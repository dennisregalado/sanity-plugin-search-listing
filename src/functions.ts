/* eslint-disable no-console -- these logs are the Functions' output */
/**
 * Sanity Function handlers and Blueprint helpers that persist the URL handle. No React or
 * Studio imports: import from `sanity-plugin-search-listing/functions` in a Function and in
 * `sanity.blueprint.ts`.
 */
import {
  getCanonicalDocumentId,
  getSlugCurrent,
  isSlugTaken,
  resolveAvailableSlug,
  SLUG_CANDIDATES_QUERY,
  type SlugDocument,
  slugify,
} from './resolveSlug'

/* -------------------------------------------------------------------------- */
/* Client                                                                     */
/* -------------------------------------------------------------------------- */

/** The patch builder methods these handlers use. `@sanity/client`'s `Patch` satisfies it. */
export interface FunctionPatch {
  set(attrs: Record<string, unknown>): FunctionPatch
  setIfMissing(attrs: Record<string, unknown>): FunctionPatch
}

/** The transaction methods these handlers use. `@sanity/client`'s `Transaction` satisfies it. */
export interface FunctionTransaction {
  patch(documentId: string, build: (patch: FunctionPatch) => FunctionPatch): FunctionTransaction
  delete(documentId: string): FunctionTransaction
  createIfNotExists(
    document: {_id: string; _type: string} & Record<string, unknown>,
  ): FunctionTransaction
  commit(): Promise<unknown>
}

/**
 * The part of a `@sanity/client` client these handlers need. Pass a real client:
 * `createClient({...context.clientOptions, useCdn: false, apiVersion: '2025-05-08'})`.
 * `syncSlug` needs `perspective: 'raw'` so drafts reserve slugs too.
 */
export interface FunctionClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches the client's generic fetch
  fetch(query: string, params?: Record<string, unknown>): Promise<any>
  transaction(): FunctionTransaction
}

/* -------------------------------------------------------------------------- */
/* Blueprint events                                                           */
/* -------------------------------------------------------------------------- */

/** A Document Function `event`, as `defineDocumentFunction` takes it. */
export interface DocumentFunctionEvent<On extends string> {
  on: On[]
  filter: string
  projection: string
}

function typeList(types: readonly string[]): string {
  if (!types.length) throw new Error('Pass at least one document type')
  for (const type of types) {
    if (!/^[A-Za-z_][\w.-]*$/.test(type)) throw new Error(`Not a document type name: ${type}`)
  }
  return `[${types.map((type) => `'${type}'`).join(', ')}]`
}

/**
 * The `event` of the `auto-slug` Document Function, for the types routed by `slug.current`.
 * Never list Shopify products or collections: they are routed by `store.slug`.
 *
 * The filter describes a state, not a change: a published document whose handle differs
 * from its slug, or that has neither. The function's own patch leaves it in sync, so it does
 * not run again, and a document that drifts is repaired on its next publish. A duplicate
 * made in the Studio has neither, so it gets a free `-copy` slug when it is published.
 */
export function autoSlugEvent(
  types: readonly string[],
): DocumentFunctionEvent<'create' | 'update'> {
  return {
    on: ['create', 'update'] as Array<'create' | 'update'>,
    filter: `_type in ${typeList(types)} && ((defined(seo.url.current) && seo.url.current != slug.current) || (!defined(seo.url.current) && !defined(slug.current) && defined(coalesce(title, name))))`,
    projection: '{_id, _createdAt, _type, title, name, slug{current}, seo{url{current}}}',
  }
}

/** The `event` of the `auto-redirect` Document Function: a published `slug.current` changed. */
export function autoRedirectEvent(types: readonly string[]): DocumentFunctionEvent<'update'> {
  return {
    on: ['update'] as Array<'update'>,
    filter: `_type in ${typeList(types)} && delta::changedAny(slug.current)`,
    projection: "{_id, _type, 'beforeSlug': before().slug.current, 'slug': after().slug.current}",
  }
}

/* -------------------------------------------------------------------------- */
/* auto-slug                                                                  */
/* -------------------------------------------------------------------------- */

export type SyncSlugResult =
  | {status: 'skipped'; reason: string}
  | {status: 'refused'; slug: string}
  | {status: 'updated'; slug: string; source: 'handle' | 'title'}

/**
 * Keeps `slug.current`, the field the frontend routes on, equal to the URL handle
 * (`seo.url.current`), and gives a published document with neither its title slug, with
 * `-copy` when that is taken. `document` is the `autoSlugEvent` projection.
 *
 * - A handle typed as `Our Story` is saved as `our-story`.
 * - A handle another document of the type owns is refused; the live URL stays.
 * - A document with a slug and no handle is left alone (legacy URLs).
 * - An open draft's slug follows, so publishing it does not restore the old one.
 */
export async function syncSlug(
  client: FunctionClient,
  document: SlugDocument,
): Promise<SyncSlugResult> {
  const documentId = typeof document._id === 'string' ? document._id : ''
  const documentType = typeof document._type === 'string' ? document._type : ''

  if (!documentId || !documentType) return skip('No document id or type')

  const seoUrl = getSlugCurrent(document.seo?.url)
  const documentSlug = getSlugCurrent(document.slug)

  if (!seoUrl && documentSlug) return skip(`${documentId} keeps slug ${documentSlug}`)

  // An editor's handle is normalized; a missing one is derived from the title.
  const handle = seoUrl ? slugify(seoUrl) : ''

  if (seoUrl && !handle) {
    console.error(`${documentId} has an unusable URL handle: ${JSON.stringify(seoUrl)}`)
    return {status: 'skipped', reason: 'unusable handle'}
  }

  if (handle && handle === seoUrl && handle === documentSlug) {
    return skip(`${documentId} is already in sync at ${handle}`)
  }

  const documents: SlugDocument[] = await client.fetch(SLUG_CANDIDATES_QUERY, {type: documentType})

  if (handle && isSlugTaken(handle, document, documents)) {
    // Leave the live URL alone rather than route two documents to one path.
    console.error(`${documentId} wants ${handle}, which another ${documentType} already uses`)
    return {status: 'refused', slug: handle}
  }

  const slug = handle || resolveAvailableSlug(document, documents)

  if (!slug) return skip(`${documentId} has no title to derive a slug from`)

  const draftId = `drafts.${getCanonicalDocumentId(documentId)}`
  const draft: {seoUrl: string | null} | null = await client.fetch(
    `*[_id == $draftId][0]{"seoUrl": seo.url.current}`,
    {draftId},
  )

  const transaction = client.transaction().patch(documentId, (patch) =>
    patch
      .setIfMissing({seo: {_type: 'seo'}})
      .setIfMissing({'seo.url': {_type: 'slug'}})
      .setIfMissing({slug: {_type: 'slug'}})
      .set({'seo.url.current': slug, 'slug.current': slug}),
  )

  // A draft opened before this ran still holds the old slug and would restore it on the
  // next publish. Its routing slug follows; a handle the editor has since typed is kept.
  if (draft && documentId !== draftId) {
    transaction.patch(draftId, (patch) => {
      const next = patch.setIfMissing({slug: {_type: 'slug'}}).set({'slug.current': slug})

      if (draft.seoUrl && draft.seoUrl !== seoUrl) return next

      return next
        .setIfMissing({seo: {_type: 'seo'}})
        .setIfMissing({'seo.url': {_type: 'slug'}})
        .set({'seo.url.current': slug})
    })
  }

  await transaction.commit()

  const source = seoUrl ? 'handle' : 'title'
  console.log(
    `${documentId}: ${source === 'handle' ? 'synced slug to the URL handle' : 'set slug from the title'} (${slug})`,
  )
  return {status: 'updated', slug, source}
}

function skip(reason: string): SyncSlugResult {
  console.log(reason)
  return {status: 'skipped', reason}
}

/* -------------------------------------------------------------------------- */
/* auto-redirect                                                              */
/* -------------------------------------------------------------------------- */

/** Each routed type's path prefix, e.g. `{page: '/pages/', post: '/blog/'}`. */
export type RoutePrefixes = Readonly<Record<string, string>>

export type ExistingRedirect = {
  _id: string
  source: string | null
  destination: string | null
}

export type RedirectChange =
  | {action: 'create'; source: string; destination: string}
  | {action: 'retarget'; id: string; destination: string}
  | {action: 'delete'; id: string}

/** The old and new paths of a slug change, or `null` when there is nothing to redirect. */
export function getRedirectPaths(
  routes: RoutePrefixes,
  type: unknown,
  beforeSlug: unknown,
  slug: unknown,
): {source: string; destination: string} | null {
  const prefix = typeof type === 'string' ? routes[type] : undefined

  if (!prefix || typeof beforeSlug !== 'string' || typeof slug !== 'string') return null
  if (!beforeSlug || !slug || beforeSlug === slug) return null

  return {source: `${prefix}${beforeSlug}`, destination: `${prefix}${slug}`}
}

/**
 * What to do to the redirect documents when a page moves from `source` to `destination`.
 * `existing` holds every redirect that starts at either path or ends at `source`.
 * No chains: earlier redirects to `source` are retargeted; moving back deletes the redirect.
 */
export function planRedirectChanges(
  source: string,
  destination: string,
  existing: ExistingRedirect[],
): RedirectChange[] {
  const changes: RedirectChange[] = []
  let hasSource = false

  for (const redirect of existing) {
    if (redirect.source === destination) {
      // The page is live at this path again, so a redirect away from it is stale.
      changes.push({action: 'delete', id: redirect._id})
    } else if (redirect.source === source) {
      hasSource = true
      if (redirect.destination !== destination) {
        changes.push({action: 'retarget', id: redirect._id, destination})
      }
    } else if (redirect.destination === source) {
      changes.push({action: 'retarget', id: redirect._id, destination})
    }
  }

  if (!hasSource) changes.push({action: 'create', source, destination})

  return changes
}

/** Redirects that start at either path or end at `$source`. */
export const EXISTING_REDIRECTS_QUERY = `*[
  _type == "redirect" &&
  (source.current in [$source, $destination] || destination.current == $source)
]{_id, "source": source.current, "destination": destination.current}`

/** `/pages/about` becomes `redirect-pages-about`. No dots: those ids are private in a public dataset. */
export function getRedirectId(source: string): string {
  const slug = source.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `redirect-${slug}`.slice(0, 120)
}

/**
 * Writes the `redirect` documents for a published slug change. `data` is the
 * `autoRedirectEvent` projection. Redirects store full paths and get a deterministic id,
 * so a retried event cannot create a second one.
 */
export async function syncRedirects(
  client: FunctionClient,
  routes: RoutePrefixes,
  data: {_type?: unknown; beforeSlug?: unknown; slug?: unknown},
): Promise<RedirectChange[]> {
  const paths = getRedirectPaths(routes, data._type, data.beforeSlug, data.slug)

  if (!paths) {
    console.log('No slug change to redirect')
    return []
  }

  const {source, destination} = paths
  const existing: ExistingRedirect[] = await client.fetch(EXISTING_REDIRECTS_QUERY, {
    source,
    destination,
  })
  const changes = planRedirectChanges(source, destination, existing)
  const transaction = client.transaction()

  for (const change of changes) {
    if (change.action === 'delete') {
      transaction.delete(change.id)
    } else if (change.action === 'retarget') {
      transaction.patch(change.id, (patch) =>
        patch.set({destination: {_type: 'slug', current: change.destination}}),
      )
    } else {
      transaction.createIfNotExists({
        _id: getRedirectId(change.source),
        _type: 'redirect',
        source: {_type: 'slug', current: change.source},
        destination: {_type: 'slug', current: change.destination},
        permanent: true,
      })
    }
  }

  await transaction.commit()
  console.log(`Redirect ${source} -> ${destination}`)
  return changes
}
