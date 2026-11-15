import { createClient } from '@sanity/client';
import { documentEventHandler } from '@sanity/functions';
import type { SlugDocument } from 'sanity-plugin-search-listing/slug';
import { syncSlug } from './sync';

export const handler = documentEventHandler(async ({ context, event }) => {
	const client = createClient({
		...context.clientOptions,
		useCdn: false,
		apiVersion: '2025-05-08',
		// Drafts reserve slugs too.
		perspective: 'raw'
	});

	await syncSlug(client, event.data as SlugDocument);
});
