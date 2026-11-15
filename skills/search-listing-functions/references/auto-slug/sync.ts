import type { SanityClient } from '@sanity/client';
import {
	getCanonicalDocumentId,
	getSlugCurrent,
	isSlugTaken,
	resolveAvailableSlug,
	SLUG_CANDIDATES_QUERY,
	slugify,
	type SlugDocument
} from 'sanity-plugin-search-listing/slug';

/** The part of the client this needs. It must read with the `raw` perspective. */
export type SlugClient = Pick<SanityClient, 'fetch' | 'transaction'>;

/**
 * Keeps `slug.current`, the field the storefront routes on, equal to the URL handle from
 * `sanity-plugin-search-listing` (`seo.url.current`), and gives a published document with
 * neither its title slug. The Blueprint filter decides when this runs; see the README.
 */
export async function syncSlug(client: SlugClient, document: SlugDocument) {
	const documentId = typeof document._id === 'string' ? document._id : '';
	const documentType = typeof document._type === 'string' ? document._type : '';

	if (!documentId || !documentType) {
		console.log('No document id or type');
		return;
	}

	const seoUrl = getSlugCurrent(document.seo?.url);
	const documentSlug = getSlugCurrent(document.slug);

	if (!seoUrl && documentSlug) {
		console.log(`${documentId} keeps slug ${documentSlug}`);
		return;
	}

	// An editor's handle is normalized; a missing one is derived from the title.
	const handle = seoUrl ? slugify(seoUrl) : '';

	if (seoUrl && !handle) {
		console.error(`${documentId} has an unusable URL handle: ${JSON.stringify(seoUrl)}`);
		return;
	}

	if (handle && handle === seoUrl && handle === documentSlug) {
		console.log(`${documentId} is already in sync at ${handle}`);
		return;
	}

	const documents = await client.fetch<SlugDocument[]>(SLUG_CANDIDATES_QUERY, {
		type: documentType
	});

	if (handle && isSlugTaken(handle, document, documents)) {
		// Leave the live URL alone rather than route two documents to one path.
		console.error(`${documentId} wants ${handle}, which another ${documentType} already uses`);
		return;
	}

	const slug = handle || resolveAvailableSlug(document, documents);

	if (!slug) {
		console.log(`${documentId} has no title to derive a slug from`);
		return;
	}

	const publishedId = getCanonicalDocumentId(documentId);
	const draftId = `drafts.${publishedId}`;
	const draft = await client.fetch<{ seoUrl: string | null } | null>(
		`*[_id == $draftId][0]{"seoUrl": seo.url.current}`,
		{ draftId }
	);

	const transaction = client.transaction().patch(documentId, (patch) =>
		patch
			.setIfMissing({ seo: { _type: 'seo' } })
			.setIfMissing({ 'seo.url': { _type: 'slug' } })
			.setIfMissing({ slug: { _type: 'slug' } })
			.set({ 'seo.url.current': slug, 'slug.current': slug })
	);

	// A draft opened before this ran still holds the old slug and would restore it on the
	// next publish. Its routing slug follows; a handle the editor has since typed is kept.
	if (draft && documentId !== draftId) {
		transaction.patch(draftId, (patch) => {
			const next = patch.setIfMissing({ slug: { _type: 'slug' } }).set({ 'slug.current': slug });

			if (draft.seoUrl && draft.seoUrl !== seoUrl) return next;

			return next
				.setIfMissing({ seo: { _type: 'seo' } })
				.setIfMissing({ 'seo.url': { _type: 'slug' } })
				.set({ 'seo.url.current': slug });
		});
	}

	await transaction.commit();

	console.log(
		`${documentId}: ${seoUrl ? 'synced slug to the URL handle' : 'set slug from the title'} (${slug})`
	);
}
