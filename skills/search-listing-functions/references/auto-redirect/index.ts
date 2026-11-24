import { createClient } from '@sanity/client';
import { documentEventHandler } from '@sanity/functions';
import { syncRedirects } from 'sanity-plugin-search-listing/functions';

/**
 * The route of each type routed by its slug (`slug.current` by default). EDIT for the project: match each type's
 * `pathPrefix` and the types passed to `autoRedirectEvent` in the Blueprint.
 */
const ROUTE_PREFIXES = {
	page: '/pages/',
	post: '/blog/'
};

export const handler = documentEventHandler(async ({ context, event }) => {
	const client = createClient({
		...context.clientOptions,
		useCdn: false,
		apiVersion: '2025-05-08',
		perspective: 'published'
	});

	await syncRedirects(client, ROUTE_PREFIXES, event.data as Record<string, unknown>);
});
