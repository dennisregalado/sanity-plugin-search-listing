import { createClient } from '@sanity/client';
import { documentEventHandler } from '@sanity/functions';
import { syncSlug, type SlugDocument, type SlugOptions } from 'sanity-plugin-search-listing/functions';

/**
 * The Studio field's `slug` option. EDIT for the project when it is not the default, and keep
 * it the same as the `SLUG` passed to `autoSlugEvent` in the Blueprint. The first `current`
 * path is the routing slug this function writes.
 */
const SLUG: SlugOptions = { source: ['title', 'name'], current: ['slug'] };

export const handler = documentEventHandler(async ({ context, event }) => {
	const client = createClient({
		...context.clientOptions,
		useCdn: false,
		apiVersion: '2025-05-08',
		// Drafts reserve slugs too.
		perspective: 'raw'
	});

	await syncSlug(client, event.data as SlugDocument, SLUG);
});
