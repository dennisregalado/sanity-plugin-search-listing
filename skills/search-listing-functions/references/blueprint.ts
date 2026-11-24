// sanity.blueprint.ts — merge these two resources into the project's Blueprint.
import { defineBlueprint, defineDocumentFunction } from '@sanity/blueprints';
import {
	autoRedirectEvent,
	autoSlugEvent,
	type SlugOptions
} from 'sanity-plugin-search-listing/functions';

/**
 * Types routed by their own slug (`slug.current` by default), with the URL handle edited in the search listing.
 * EDIT for the project; keep in step with ROUTE_PREFIXES in functions/auto-redirect/index.ts.
 * Never list Shopify products or collections: they are routed by `store.slug`.
 */
const SLUG_TYPES = ['page', 'post'];

/**
 * The Studio field's `slug` option, for these types. EDIT when it is not the default, and keep
 * it the same as `SLUG` in functions/auto-slug/index.ts. The first `current` path is the
 * routing slug: auto-slug writes it and auto-redirect watches it.
 */
const SLUG: SlugOptions = { source: ['title', 'name'], current: ['slug'] };

export default defineBlueprint({
	resources: [
		defineDocumentFunction({
			name: 'auto-redirect',
			src: './functions/auto-redirect',
			memory: 2,
			timeout: 30,
			event: autoRedirectEvent(SLUG_TYPES, SLUG)
		}),
		defineDocumentFunction({
			name: 'auto-slug',
			src: './functions/auto-slug',
			memory: 2,
			timeout: 30,
			event: autoSlugEvent(SLUG_TYPES, SLUG)
		})
	]
});
