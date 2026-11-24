/* eslint-disable no-console -- these logs are the Functions' output */
/**
 * Sanity Function handlers and Blueprint helpers that persist the URL handle. No React or
 * Studio imports: import from `sanity-plugin-search-listing/functions` in a Function and in
 * `sanity.blueprint.ts`.
 */
import {
  DEFAULT_SLUG_CURRENT,
  DEFAULT_SLUG_SOURCE,
  getCanonicalDocumentId,
  getPathsProjection,
  getPathValue,
  getSlugCandidatesQuery,
  getSlugCurrent,
  isSlugTaken,
  resolveAvailableSlug,
  type SlugDocument,
  slugify,
  type SlugOptions,
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

/** The slug fields the Functions use, with the defaults applied and the paths validated. */
function getSlugPaths(slug?: SlugOptions): {source: string[]; current: string[]} {
  const source = slug?.source?.length ? slug.source : DEFAULT_SLUG_SOURCE
  const current = slug?.current?.length ? slug.current : DEFAULT_SLUG_CURRENT
  // Throws on anything that is not a dot path, before it reaches a filter.
  getPathsProjection([...source, ...current])
  return {source, current}
}

/**
 * The `event` of the `auto-slug` Document Function, for the types routed by their own slug
 * field: `slug.current`, or the first of the `current` paths. Never list Shopify products or
 * collections: Sanity Connect writes `store.slug` itself.
 *
 * The filter describes a state, not a change: a published document whose handle differs
 * from its slug, or that has neither. The function's own patch leaves it in sync, so it does
 * not run again, and a document that drifts is repaired on its next publish. A duplicate
 * made in the Studio has neither, so it gets its own slug from its title ("Homepage Copy" at
 * `homepage-copy`, then `homepage-copy-2`) when it is published.
 */
export function autoSlugEvent(
  types: readonly string[],
  /**
   * The Studio's `slug` option: the fields a slug is derived from (`source`), and the slug
   * fields a document routes on (`current`, dot paths). The first `current` path is the one
   * the function writes. @defaultValue `{source: ['title', 'name'], current: ['slug']}`
   */
  slug?: Pick<SlugOptions, 'source' | 'current'>,
): DocumentFunctionEvent<'create' | 'update'> {
  const {source, current} = getSlugPaths(slug)
  const routing = `${current[0]}.current`
  const hasNoSlug = current.map((path) => `!defined(${path}.current)`).join(' && ')
  const projection = getPathsProjection([
    ...source,
    ...current.map((path) => `${path}.current`),
    'seo.url.current',
  ])
  return {
    on: ['create', 'update'] as Array<'create' | 'update'>,
    filter: `_type in ${typeList(types)} && ((defined(seo.url.current) && seo.url.current != ${routing}) || (!defined(seo.url.current) && ${hasNoSlug} && defined(coalesce(${source.join(', ')}))))`,
    projection: `{_id, _createdAt, _type, ${projection}}`,
  }
}

/**
 * The `event` of the `auto-redirect` Document Function: a published routing slug changed.
 * The routing slug is `slug.current`, or the first of the `current` paths.
 */
export function autoRedirectEvent(
  types: readonly string[],
  /** The slug fields a document routes on, as in `autoSlugEvent`. */
  slug?: Pick<SlugOptions, 'current'>,
): DocumentFunctionEvent<'update'> {
  const routing = `${getSlugPaths(slug).current[0]}.current`
  return {
    on: ['update'] as Array<'update'>,
    filter: `_type in ${typeList(types)} && delta::changedAny(${routing})`,
    projection: `{_id, _type, 'beforeSlug': before().${routing}, 'slug': after().${routing}}`,
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
 * Keeps the routing slug (`slug.current`, or the first `current` path), the field the
 * frontend routes on, equal to the URL handle
 * (`seo.url.current`), and gives a published document with neither its title slug, with
 * `-2`, `-3` when that is taken. `document` is the `autoSlugEvent` projection.
 *
 * - A handle typed as `Our Story` is saved as `our-story`.
 * - A handle another document of the type owns is refused; the live URL stays.
 * - A document with a slug and no handle is left alone (legacy URLs).
 * - An open draft's slug follows, so publishing it does not restore the old one.
 */
export async function syncSlug(
  client: FunctionClient,
  document: SlugDocument,
  /** The slug fields; pass the same `source` and `current` as to `autoSlugEvent`. */
  slug?: Pick<SlugOptions, 'source' | 'current'>,
): Promise<SyncSlugResult> {
  const documentId = typeof document._id === 'string' ? document._id : ''
  const documentType = typeof document._type === 'string' ? document._type : ''

  if (!documentId || !documentType) return skip('No document id or type')

  const {current} = getSlugPaths(slug)
  const routingPath = current[0]
  const seoUrl = getSlugCurrent(document.seo?.url)
  const documentSlug = getSlugCurrent(getPathValue(document, routingPath))
  const ownedSlug = current
    .map((path) => getSlugCurrent(getPathValue(document, path)))
    .find(Boolean)

  if (!seoUrl && ownedSlug) return skip(`${documentId} keeps slug ${ownedSlug}`)

  // An editor's handle is normalized; a missing one is derived from the title.
  const handle = seoUrl ? slugify(seoUrl) : ''

  if (seoUrl && !handle) {
    console.error(`${documentId} has an unusable URL handle: ${JSON.stringify(seoUrl)}`)
    return {status: 'skipped', reason: 'unusable handle'}
  }

  if (handle && handle === seoUrl && handle === documentSlug) {
    return skip(`${documentId} is already in sync at ${handle}`)
  }

  const documents: SlugDocument[] = await client.fetch(getSlugCandidatesQuery(slug), {
    type: documentType,
  })

  if (handle && isSlugTaken(handle, document, documents, slug)) {
    // Leave the live URL alone rather than route two documents to one path.
    console.error(`${documentId} wants ${handle}, which another ${documentType} already uses`)
    return {status: 'refused', slug: handle}
  }

  const nextSlug = handle || resolveAvailableSlug(document, documents, slug)

  if (!nextSlug) return skip(`${documentId} has no title to derive a slug from`)

  const draftId = `drafts.${getCanonicalDocumentId(documentId)}`
  const draft: {seoUrl: string | null} | null = await client.fetch(
    `*[_id == $draftId][0]{"seoUrl": seo.url.current}`,
    {draftId},
  )

  const transaction = client
    .transaction()
    .patch(documentId, (patch) =>
      withSlugField(
        patch.setIfMissing({seo: {_type: 'seo'}}).setIfMissing({'seo.url': {_type: 'slug'}}),
        routingPath,
      ).set({'seo.url.current': nextSlug, [`${routingPath}.current`]: nextSlug}),
    )

  // A draft opened before this ran still holds the old slug and would restore it on the
  // next publish. Its routing slug follows; a handle the editor has since typed is kept.
  if (draft && documentId !== draftId) {
    transaction.patch(draftId, (patch) => {
      const next = withSlugField(patch, routingPath).set({[`${routingPath}.current`]: nextSlug})

      if (draft.seoUrl && draft.seoUrl !== seoUrl) return next

      return next
        .setIfMissing({seo: {_type: 'seo'}})
        .setIfMissing({'seo.url': {_type: 'slug'}})
        .set({'seo.url.current': nextSlug})
    })
  }

  await transaction.commit()

  const source = seoUrl ? 'handle' : 'title'
  console.log(
    `${documentId}: ${source === 'handle' ? 'synced slug to the URL handle' : 'set slug from the title'} (${nextSlug})`,
  )
  return {status: 'updated', slug: nextSlug, source}
}

/** Creates the slug object at `path` (`slug`, or `store.slug`) and its parents if missing. */
function withSlugField(patch: FunctionPatch, path: string): FunctionPatch {
  const keys = path.split('.')
  return keys.reduce(
    (next, _key, index) =>
      next.setIfMissing({
        [keys.slice(0, index + 1).join('.')]: index === keys.length - 1 ? {_type: 'slug'} : {},
      }),
    patch,
  )
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
