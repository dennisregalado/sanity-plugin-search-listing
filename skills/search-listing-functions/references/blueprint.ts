// sanity.blueprint.ts — merge these two resources into the project's Blueprint.
import { defineBlueprint, defineDocumentFunction } from '@sanity/blueprints';
import { autoRedirectEvent, autoSlugEvent } from 'sanity-plugin-search-listing/functions';

/**
 * Types routed by `slug.current`, with the URL handle edited in the search listing.
 * EDIT for the project; keep in step with ROUTE_PREFIXES in functions/auto-redirect/index.ts.
 * Never list Shopify products or collections: they are routed by `store.slug`.
 */
const SLUG_TYPES = ['page', 'post'];

export default defineBlueprint({
	resources: [
		defineDocumentFunction({
			name: 'auto-redirect',
			src: './functions/auto-redirect',
			memory: 2,
			timeout: 30,
			event: autoRedirectEvent(SLUG_TYPES)
		}),
		defineDocumentFunction({
			name: 'auto-slug',
			src: './functions/auto-slug',
			memory: 2,
			timeout: 30,
			event: autoSlugEvent(SLUG_TYPES)
		})
	]
});
