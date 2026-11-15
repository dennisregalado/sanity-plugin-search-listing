import { createClient } from '@sanity/client';
import { documentEventHandler } from '@sanity/functions';
import { getRedirectPaths, planRedirectChanges, type ExistingRedirect } from './plan';

const EXISTING_REDIRECTS_QUERY = `*[
  _type == "redirect" &&
  (source.current in [$source, $destination] || destination.current == $source)
]{_id, "source": source.current, "destination": destination.current}`;

/**
 * When a published document of a routed type (`ROUTE_PREFIXES`) changes slug, redirect its old storefront path to
 * the new one. The storefront reads these documents for requests that would 404.
 */
export const handler = documentEventHandler(async ({ context, event }) => {
	const { _type, beforeSlug, slug } = event.data as Record<string, unknown>;
	const paths = getRedirectPaths(_type, beforeSlug, slug);

	if (!paths) {
		console.log('No slug change to redirect');
		return;
	}

	const { source, destination } = paths;
	const client = createClient({
		...context.clientOptions,
		useCdn: false,
		apiVersion: '2025-05-08',
		perspective: 'published'
	});

	const existing = await client.fetch<ExistingRedirect[]>(EXISTING_REDIRECTS_QUERY, {
		source,
		destination
	});
	const transaction = client.transaction();

	for (const change of planRedirectChanges(source, destination, existing)) {
		if (change.action === 'delete') {
			transaction.delete(change.id);
		} else if (change.action === 'retarget') {
			transaction.patch(change.id, (patch) =>
				patch.set({ destination: { _type: 'slug', current: change.destination } })
			);
		} else {
			// One id per source path, so a retried event cannot create a second redirect.
			transaction.createIfNotExists({
				_id: getRedirectId(change.source),
				_type: 'redirect',
				source: { _type: 'slug', current: change.source },
				destination: { _type: 'slug', current: change.destination },
				permanent: true
			});
		}
	}

	await transaction.commit();
	console.log(`Redirect ${source} -> ${destination}`);
});

/** `/pages/about` becomes `redirect-pages-about`. No dots: those ids are private in a public dataset. */
function getRedirectId(source: string) {
	const slug = source.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
	return `redirect-${slug}`.slice(0, 120);
}
