/**
 * Storefront side: look up a redirect for a request that would otherwise 404. Run it only
 * after the router has returned 404, so a live page always wins over a stale redirect.
 */
export const REDIRECT_QUERY = `*[_type == "redirect" && source.current in $paths && defined(destination.current)][0] {
  "to": destination.current,
  permanent
}`;

type Fetch = (query: string, params: Record<string, unknown>) => Promise<unknown>;

/** The redirect response for `url`, or `null`. Keeps the query string. */
export async function findRedirect(url: URL, fetch: Fetch): Promise<Response | null> {
	const { pathname } = url;
	const redirect = (await fetch(REDIRECT_QUERY, {
		// Editors may enter a path with or without its trailing slash.
		paths: [...new Set([pathname, pathname.replace(/\/+$/, '') || '/', `${pathname}/`])]
	})) as { to: string | null; permanent: boolean | null } | null;

	if (!redirect?.to) return null;

	const target = new URL(redirect.to, url.origin);
	if (!target.search) target.search = url.search;

	return new Response(null, {
		status: redirect.permanent === false ? 302 : 301,
		headers: { location: target.href }
	});
}

// SvelteKit (src/hooks.server.ts):
//   const response = await resolve(event);
//   if (response.status === 404) {
//     const redirect = await findRedirect(event.url, (q, p) => client.fetch(q, p));
//     if (redirect) return redirect;
//   }
//   return response;
//
// Next.js: call findRedirect from middleware for paths your app does not serve, or from
// `not-found` handling, and return its Response.
