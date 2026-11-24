/**
 * Pure helpers behind the title, description and URL handle inputs: placeholders, the URL a
 * handle would be generated as, and the URL a published document lives at. No React, so
 * they are unit-tested directly.
 */
import {
  getCanonicalDocumentId,
  getDocumentSlug,
  resolveAvailableSlug,
  type SlugDocument,
  type SlugOptions,
} from '../resolveSlug'

/**
 * A copy of `document` without its URL handle (`seo.url`): the document as the slug rules see
 * it when the handle is cleared.
 */
export function withoutHandle<T extends SlugDocument>(document: T): T {
  if (!document?.seo || typeof document.seo !== 'object') return document
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const {url: _url, ...seo} = document.seo
  return {...document, seo}
}

/**
 * The slug the document would get with no handle, by the same rules as the listing preview:
 * a routing slug it already has, else its title slug, numbered past other documents of its
 * type. `candidates` is the result of `getSlugCandidatesQuery()` for its type; the document's
 * own copies in it are ignored, so its current handle does not count.
 */
export function getGeneratedSlug(
  document: SlugDocument,
  candidates: SlugDocument[],
  options?: SlugOptions,
): string {
  const current = withoutHandle(document)
  const id = getCanonicalDocumentId(current._id)
  const others = id
    ? candidates.filter((candidate) => getCanonicalDocumentId(candidate._id) !== id)
    : candidates
  return resolveAvailableSlug(current, others, options)
}

/**
 * Whether to offer resetting the handle: one is set and differs from the slug it would be
 * generated as. Nothing is offered until that slug is known.
 */
export function canResetHandle(handle: string | undefined, generatedSlug: string): boolean {
  return Boolean(handle && generatedSlug && handle !== generatedSlug)
}

/**
 * The slug a published document is served at (its handle, else a routing slug), when the
 * handle being edited (`handle`, or what the field shows while empty) would move it.
 * Empty when it is not published, has no explicit slug, or the handle is unchanged.
 */
export function getMovedPublishedSlug(
  published: SlugDocument | null | undefined,
  handle: string,
  options?: SlugOptions,
): string {
  const publishedSlug = getDocumentSlug(published, options)
  return publishedSlug && handle && publishedSlug !== handle ? publishedSlug : ''
}

/**
 * What an empty title or description field shows: the fallback the listing shows, else, on a
 * `home` document, `homePlaceholder`.
 */
export function getPlaceholder(
  fallbackText: string,
  home: boolean,
  homePlaceholder: string,
): string {
  if (fallbackText) return fallbackText
  return home ? homePlaceholder : ''
}
