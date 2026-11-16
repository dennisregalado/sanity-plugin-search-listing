import { describe, expect, test } from 'vitest';
import { evaluate, parse } from 'groq-js';
import { planRedirectChanges } from 'sanity-plugin-search-listing/functions';
import { findRedirect } from './redirect-lookup';

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
