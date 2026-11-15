/**
 * The storefront route of each document type routed by `slug.current`. EDIT for the project:
 * match the `pathPrefix` of each type's `seo` field and the types in the Blueprint filters.
 */
export const ROUTE_PREFIXES: Record<string, string> = {
	page: '/pages/',
	post: '/blog/'
};

export type ExistingRedirect = {
	_id: string;
	source: string | null;
	destination: string | null;
};

export type RedirectChange =
	| { action: 'create'; source: string; destination: string }
	| { action: 'retarget'; id: string; destination: string }
	| { action: 'delete'; id: string };

/** The old and new storefront paths of a slug change, or `null` when there is nothing to redirect. */
export function getRedirectPaths(type: unknown, beforeSlug: unknown, slug: unknown) {
	const prefix = typeof type === 'string' ? ROUTE_PREFIXES[type] : undefined;

	if (!prefix || typeof beforeSlug !== 'string' || typeof slug !== 'string') return null;
	if (!beforeSlug || !slug || beforeSlug === slug) return null;

	return { source: `${prefix}${beforeSlug}`, destination: `${prefix}${slug}` };
}

/**
 * What to do to the redirect documents when a page moves from `source` to `destination`.
 * `existing` holds every redirect that starts at either path or ends at `source`.
 */
export function planRedirectChanges(
	source: string,
	destination: string,
	existing: ExistingRedirect[]
): RedirectChange[] {
	const changes: RedirectChange[] = [];
	let hasSource = false;

	for (const redirect of existing) {
		if (redirect.source === destination) {
			// The page is live at this path again, so a redirect away from it is stale.
			changes.push({ action: 'delete', id: redirect._id });
		} else if (redirect.source === source) {
			hasSource = true;
			if (redirect.destination !== destination) {
				changes.push({ action: 'retarget', id: redirect._id, destination });
			}
		} else if (redirect.destination === source) {
			// Point earlier redirects straight at the new path instead of chaining.
			changes.push({ action: 'retarget', id: redirect._id, destination });
		}
	}

	if (!hasSource) changes.push({ action: 'create', source, destination });

	return changes;
}
