import { beforeEach, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { evaluate, parse } from 'groq-js';
import { syncSlug, type SlugClient } from './auto-slug/sync';

/**
 * Runs the function against an in-memory dataset: `fetch` evaluates the function's own
 * GROQ, and patches are applied to the documents so the next query sees them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose in-memory documents
type Doc = Record<string, any>;
let dataset: Doc[] = [];

const find = (id: string) => dataset.find((doc) => doc._id === id);

function setPath(doc: Doc, path: string, value: unknown, onlyIfMissing: boolean) {
	const keys = path.split('.');
	const last = keys.pop()!;
	let target = doc;
	for (const key of keys) target = target[key] ??= {};
	if (!onlyIfMissing || target[last] === undefined) target[last] = value;
}

function patchBuilder(doc: Doc) {
	const builder = {
		setIfMissing(values: Doc) {
			for (const [path, value] of Object.entries(values)) setPath(doc, path, value, true);
			return builder;
		},
		set(values: Doc) {
			for (const [path, value] of Object.entries(values)) setPath(doc, path, value, false);
			return builder;
		}
	};
	return builder;
}

const client = {
	async fetch(query: string, params: Doc = {}) {
		const value = await evaluate(parse(query, { params }), { dataset, params });
		return value.get();
	},
	transaction() {
		const operations: Array<() => void> = [];
		const transaction = {
			patch(id: string, build: (patch: ReturnType<typeof patchBuilder>) => unknown) {
				operations.push(() => {
					const doc = find(id);
					if (!doc) throw new Error(`Cannot patch missing document ${id}`);
					build(patchBuilder(doc));
				});
				return transaction;
			},
			async commit() {
				for (const operation of operations) operation();
			}
		};
		return transaction;
	}
};

// The filter and projection from blueprint.ts, which imports @sanity/blueprints.
const blueprintSource = readFileSync(new URL('./blueprint.ts', import.meta.url), 'utf8');
const SLUG_TYPES = blueprintSource.match(/const SLUG_TYPES = "([^"]+)"/)![1];
const autoSlug = {
	event: {
		filter: blueprintSource
			.match(/filter: `(_type in \$\{SLUG_TYPES\} && \(\(defined[^`]+)`/)![1]
			.replace('${SLUG_TYPES}', SLUG_TYPES),
		projection: blueprintSource.match(/projection: '(\{_id, _createdAt[^']+)'/)![1]
	}
};

/** Whether the Blueprint filter would invoke the function for this document. */
async function matchesFilter(doc: Doc) {
	const value = await evaluate(parse(`*[${autoSlug.event.filter}]`), { dataset: [doc] });
	return (await value.get()).length === 1;
}

/** Publish `doc` the way the platform does: invoke the function only if the filter matches. */
async function run(id: string) {
	const doc = find(id)!;
	if (!(await matchesFilter(doc))) return false;
	const projected = await evaluate(parse(`*[_id == $id][0]${autoSlug.event.projection}`), {
		dataset,
		params: { id }
	});
	await syncSlug(client as unknown as SlugClient, await projected.get());
	return true;
}

const slugs = (id: string) => ({ slug: find(id)?.slug?.current, url: find(id)?.seo?.url?.current });

beforeEach(() => {
	dataset = [];
});

describe('auto-slug', () => {
	test('gives a newly published page its title slug, once', async () => {
		dataset.push({ _id: 'a', _type: 'page', _createdAt: '2026-01-01', title: 'About Us' });

		expect(await run('a')).toBe(true);
		expect(slugs('a')).toEqual({ slug: 'about-us', url: 'about-us' });
		// Its own patch leaves the document in sync, so it is not invoked again.
		expect(await run('a')).toBe(false);
	});

	test('derives a maker slug from its name', async () => {
		dataset.push({ _id: 'm', _type: 'post', _createdAt: '2026-01-01', name: 'Atelier Été' });

		await run('m');
		expect(slugs('m')).toEqual({ slug: 'atelier-ete', url: 'atelier-ete' });
	});

	test('same-title documents get -copy in creation order', async () => {
		dataset.push(
			{ _id: 'a', _type: 'post', _createdAt: '2026-01-01', title: 'Returns' },
			{ _id: 'b', _type: 'post', _createdAt: '2026-01-02', title: 'Returns' }
		);

		await run('b');
		await run('a');
		expect(slugs('a').slug).toBe('returns');
		expect(slugs('b').slug).toBe('returns-copy');
	});

	test('a changed URL handle becomes the routing slug', async () => {
		dataset.push({
			_id: 'a',
			_type: 'page',
			_createdAt: '2026-01-01',
			title: 'About',
			slug: { _type: 'slug', current: 'about' },
			seo: { url: { _type: 'slug', current: 'our-story' } }
		});

		expect(await run('a')).toBe(true);
		expect(slugs('a')).toEqual({ slug: 'our-story', url: 'our-story' });
	});

	test('normalizes a handle typed with spaces and capitals', async () => {
		dataset.push({
			_id: 'a',
			_type: 'page',
			_createdAt: '2026-01-01',
			title: 'About',
			seo: { url: { _type: 'slug', current: 'Our Story' } }
		});

		await run('a');
		expect(slugs('a')).toEqual({ slug: 'our-story', url: 'our-story' });
	});

	test('leaves a legacy slug with no URL handle alone', async () => {
		dataset.push({
			_id: 'a',
			_type: 'page',
			_createdAt: '2026-01-01',
			title: 'About',
			slug: { _type: 'slug', current: 'legacy-slug' }
		});

		expect(await run('a')).toBe(false);
	});

	test('does not take a handle another document routes on', async () => {
		dataset.push(
			{ _id: 'a', _type: 'page', _createdAt: '2026-01-01', slug: { current: 'contact' } },
			{
				_id: 'b',
				_type: 'page',
				_createdAt: '2026-01-02',
				slug: { current: 'reach-us' },
				seo: { url: { current: 'contact' } }
			}
		);

		await run('b');
		expect(slugs('b').slug).toBe('reach-us');
	});

	test('repairs a publish that restored the old slug from a stale draft', async () => {
		// The published handle is `new`, but the draft that was just published carried `old`.
		dataset.push({
			_id: 'a',
			_type: 'page',
			_createdAt: '2026-01-01',
			title: 'About',
			slug: { _type: 'slug', current: 'old' },
			seo: { url: { _type: 'slug', current: 'new' } }
		});

		expect(await run('a')).toBe(true);
		expect(slugs('a').slug).toBe('new');
	});

	test('updates an open draft, adopting a handle the editor has already typed there', async () => {
		dataset.push(
			{ _id: 'a', _type: 'page', _createdAt: '2026-01-01', title: 'About' },
			{ _id: 'drafts.a', _type: 'page', _createdAt: '2026-01-01', title: 'About' },
			{ _id: 'b', _type: 'page', _createdAt: '2026-01-02', title: 'Team' },
			{
				_id: 'drafts.b',
				_type: 'page',
				_createdAt: '2026-01-02',
				title: 'Team',
				seo: { url: { _type: 'slug', current: 'people' } }
			}
		);

		await run('a');
		await run('b');
		expect(slugs('drafts.a')).toEqual({ slug: 'about', url: 'about' });
		// The draft's handle is used straight away, so the URL does not move on the next publish.
		expect(slugs('b')).toEqual({ slug: 'people', url: 'people' });
		expect(slugs('drafts.b')).toEqual({ slug: 'people', url: 'people' });
	});

	test('ignores Shopify documents and types without a route', async () => {
		expect(await matchesFilter({ _id: 'p', _type: 'product', title: 'Chair' })).toBe(false);
		expect(await matchesFilter({ _id: 's', _type: 'showroom', title: 'LA' })).toBe(false);
	});
});
