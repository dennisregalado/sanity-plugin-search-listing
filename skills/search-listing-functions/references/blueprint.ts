// sanity.blueprint.ts — merge these two resources into the project's Blueprint.
import { defineBlueprint, defineDocumentFunction } from '@sanity/blueprints';

/**
 * Types routed by `slug.current`, with the URL handle edited in the search listing.
 * EDIT for the project; keep in step with ROUTE_PREFIXES in functions/auto-redirect/plan.ts.
 * Shopify products and collections are routed by `store.slug` and are never listed.
 */
const SLUG_TYPES = "['page', 'post']";

export default defineBlueprint({
	resources: [
		defineDocumentFunction({
			name: 'auto-redirect',
			src: './functions/auto-redirect',
			memory: 2,
			timeout: 30,
			event: {
				on: ['update'],
				filter: `_type in ${SLUG_TYPES} && delta::changedAny(slug.current)`,
				projection:
					"{_id, _type, 'beforeSlug': before().slug.current, 'slug': after().slug.current}"
			}
		}),
		defineDocumentFunction({
			name: 'auto-slug',
			src: './functions/auto-slug',
			memory: 2,
			timeout: 30,
			event: {
				on: ['create', 'update'],
				// A state, not a change: the function's own patch leaves the document in sync, so it
				// does not run again, and a document that drifts is repaired on its next publish.
				filter: `_type in ${SLUG_TYPES} && ((defined(seo.url.current) && seo.url.current != slug.current) || (!defined(seo.url.current) && !defined(slug.current) && defined(coalesce(title, name))))`,
				projection: '{_id, _createdAt, _type, title, name, slug{current}, seo{url{current}}}'
			}
		})
	]
});
