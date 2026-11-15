import { describe, expect, test } from 'vitest';
import { evaluate, parse } from 'groq-js';
import { getRedirectPaths, planRedirectChanges } from './auto-redirect/plan';
import { findRedirect } from './redirect-lookup';

describe('getRedirectPaths', () => {
	test('prefixes both slugs with the type route', () => {
		expect(getRedirectPaths('page', 'about', 'about-us')).toEqual({
			source: '/pages/about',
			destination: '/pages/about-us'
		});
		expect(getRedirectPaths('post', 'a', 'b')?.destination).toBe('/blog/b');
	});

	test('ignores unrouted types, first slugs and unchanged slugs', () => {
		expect(getRedirectPaths('product', 'a', 'b')).toBeNull();
		expect(getRedirectPaths('page', undefined, 'b')).toBeNull();
		expect(getRedirectPaths('page', 'a', null)).toBeNull();
		expect(getRedirectPaths('page', 'a', 'a')).toBeNull();
	});
});

describe('planRedirectChanges', () => {
	test('creates a redirect for a first rename', () => {
		expect(planRedirectChanges('/pages/a', '/pages/b', [])).toEqual([
			{ action: 'create', source: '/pages/a', destination: '/pages/b' }
		]);
	});

	test('points earlier redirects at the new path instead of chaining', () => {
		// a -> b already exists; the page now moves b -> c.
		expect(
			planRedirectChanges('/pages/b', '/pages/c', [
				{ _id: 'r1', source: '/pages/a', destination: '/pages/b' }
			])
		).toEqual([
			{ action: 'retarget', id: 'r1', destination: '/pages/c' },
			{ action: 'create', source: '/pages/b', destination: '/pages/c' }
		]);
	});

	test('renaming back removes the redirect away from the live path', () => {
		// a -> b exists; the page moves b -> a.
		expect(
			planRedirectChanges('/pages/b', '/pages/a', [
				{ _id: 'r1', source: '/pages/a', destination: '/pages/b' }
			])
		).toEqual([
			{ action: 'delete', id: 'r1' },
			{ action: 'create', source: '/pages/b', destination: '/pages/a' }
		]);
	});

	test('reuses a redirect that already starts at the old path', () => {
		expect(
			planRedirectChanges('/pages/a', '/pages/b', [
				{ _id: 'manual', source: '/pages/a', destination: '/pages/elsewhere' }
			])
		).toEqual([{ action: 'retarget', id: 'manual', destination: '/pages/b' }]);

		expect(
			planRedirectChanges('/pages/a', '/pages/b', [
				{ _id: 'same', source: '/pages/a', destination: '/pages/b' }
			])
		).toEqual([]);
	});
});

describe('findRedirect', () => {
	const [change] = planRedirectChanges('/pages/about', '/pages/our-story', []);
	const dataset = [
		{
			_id: 'redirect-pages-about',
			_type: 'redirect',
			source: { _type: 'slug', current: change.action === 'create' ? change.source : '' },
			destination: { _type: 'slug', current: '/pages/our-story' },
			permanent: true
		}
	];
	const fetch = async (query: string, params: Record<string, unknown>) =>
		(await evaluate(parse(query, { params }), { dataset, params })).get();

	test('redirects the path the function wrote, keeping the query string', async () => {
		const response = await findRedirect(new URL('https://shop.test/pages/about/?ref=x'), fetch);
		expect(response?.status).toBe(301);
		expect(response?.headers.get('location')).toBe('https://shop.test/pages/our-story?ref=x');
	});

	test('returns null for paths without a redirect', async () => {
		expect(await findRedirect(new URL('https://shop.test/pages/our-story'), fetch)).toBeNull();
	});
});
