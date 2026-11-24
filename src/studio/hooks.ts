import React from 'react'
import {useDocumentStore} from 'sanity'

import {
  FALLBACK_FIELDS,
  type FallbackField,
  getFallbackSources,
  getQueryKey,
  type NormalizedSource,
  resolveFallback,
} from '../fallbacks'
import {
  getCanonicalDocumentId,
  getDocumentSlug,
  getSlugCandidatesQuery,
  getTitleSlug,
  resolveAvailableSlug,
  type SlugDocument,
  type SlugOptions,
} from '../resolveSlug'
import type {SearchListingFallbacks} from '../types'
import {API_VERSION} from './constants'
import type {ResolvedFallbacks, StudioFormDocument} from './types'
import {setPathValue} from './utils'

/**
 * The first fallback with a value for each field. Path sources read the form document;
 * query sources are live queries, shared by every field that uses the same one.
 */
export function useFallbacks(
  document: StudioFormDocument,
  fieldFallbacks: SearchListingFallbacks | undefined,
  pluginFallbacks: SearchListingFallbacks | undefined,
): ResolvedFallbacks {
  const documentStore = useDocumentStore()
  const id = getCanonicalDocumentId(document?._id)
  const type = typeof document?._type === 'string' ? document._type : ''

  const sourcesByField = React.useMemo(
    () =>
      Object.fromEntries(
        FALLBACK_FIELDS.map((field) => [
          field,
          getFallbackSources(field, fieldFallbacks, pluginFallbacks),
        ]),
      ) as Record<FallbackField, NormalizedSource[]>,
    [fieldFallbacks, pluginFallbacks],
  )

  const querySources = React.useMemo(() => {
    const byKey = new Map<string, Extract<NormalizedSource, {kind: 'query'}>>()
    for (const sources of Object.values(sourcesByField)) {
      for (const source of sources) {
        if (source.kind === 'query') byKey.set(getQueryKey(source), source)
      }
    }
    return [...byKey.entries()]
  }, [sourcesByField])

  // Results belong to one document and one set of sources: a change of either starts afresh,
  // so a result for the previous document or query never shows.
  const scope = JSON.stringify([id, type, querySources.map(([key]) => key)])
  const [queryState, setQueryState] = React.useState<{
    scope: string
    results: ReadonlyMap<string, unknown>
  }>(() => ({scope, results: new Map()}))
  const queryResults = React.useMemo<ReadonlyMap<string, unknown>>(
    () => (queryState.scope === scope ? queryState.results : new Map()),
    [queryState, scope],
  )

  React.useEffect(() => {
    if (querySources.length === 0) return undefined

    const subscriptions = querySources.map(([key, source]) =>
      documentStore
        .listenQuery(
          source.query,
          {...source.params, id, draftId: `drafts.${id}`, type},
          {apiVersion: API_VERSION, perspective: 'drafts', tag: 'search-listing.fallback'},
        )
        .subscribe({
          next: (result: unknown) => {
            setQueryState((previous) => ({
              scope,
              results: new Map(previous.scope === scope ? previous.results : []).set(key, result),
            }))
          },
          error: () => {
            // A failing query is skipped; the next source is used instead.
          },
        }),
    )

    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  }, [documentStore, querySources, id, type, scope])

  return React.useMemo(() => {
    const resolved: ResolvedFallbacks = {}
    for (const field of FALLBACK_FIELDS) {
      const fallback = resolveFallback(sourcesByField[field], document, queryResults)
      if (fallback) resolved[field] = fallback
    }
    return resolved
  }, [sourcesByField, document, queryResults])
}

/**
 * The slug the document would be given if it has none: its title slug at once, then the
 * duplicate-aware slug once the other documents of its type have loaded. One live query per
 * document type and slug fields keeps those documents current; each title change is resolved
 * locally with `resolveAvailableSlug`, without another request.
 */
export function useResolvedSlugFallback(
  document: StudioFormDocument,
  options: {disabled?: boolean; slug?: SlugOptions} = {},
) {
  const disabled = options.disabled === true
  const documentType = typeof document?._type === 'string' ? document._type : ''
  const documentId = typeof document?._id === 'string' ? document._id : ''
  const documentCreatedAt = typeof document?._createdAt === 'string' ? document._createdAt : ''
  // Stable while the options' content is, whatever the identity of the object passed.
  const slugOptionsKey = JSON.stringify(options.slug ?? null)
  const slugOptions = React.useMemo(
    () => (JSON.parse(slugOptionsKey) as SlugOptions | null) ?? undefined,
    [slugOptionsKey],
  )
  const explicitSlug = disabled ? '' : getDocumentSlug(document as SlugDocument, slugOptions)
  const titleSlug = disabled ? '' : getTitleSlug(document as SlugDocument, slugOptions)
  const candidates = useSlugCandidates(
    disabled || explicitSlug || !titleSlug ? '' : documentType,
    slugOptions,
  )

  const resolved = React.useMemo(() => {
    if (!candidates || !titleSlug) return ''
    // The title being edited, at the first source field. Already slugified, and slugify is
    // idempotent.
    const sourcePath = slugOptions?.source?.[0] ?? 'title'
    const currentDocument = setPathValue(
      {_createdAt: documentCreatedAt, _id: documentId, _type: documentType},
      sourcePath,
      titleSlug,
    ) as SlugDocument
    return resolveAvailableSlug(currentDocument, candidates, slugOptions)
  }, [candidates, titleSlug, slugOptions, documentCreatedAt, documentId, documentType])

  if (explicitSlug) {
    return explicitSlug
  }

  return resolved || titleSlug
}

/**
 * Every document of `documentType` that can own or reserve a slug, drafts included, kept
 * current by a live query. `undefined` while loading, when `documentType` is empty, or when
 * the dataset cannot be queried (the caller then keeps the title slug).
 */
export function useSlugCandidates(
  documentType: string,
  slugOptions: SlugOptions | undefined,
): SlugDocument[] | undefined {
  const documentStore = useDocumentStore()
  const query = React.useMemo(() => getSlugCandidatesQuery(slugOptions), [slugOptions])
  const key = documentType ? `${documentType}:${query}` : ''
  const [state, setState] = React.useState<{key: string; documents: SlugDocument[]}>({
    key: '',
    documents: [],
  })

  React.useEffect(() => {
    if (!documentType) return undefined

    const subscription = documentStore
      .listenQuery(
        query,
        {type: documentType},
        {apiVersion: API_VERSION, perspective: 'raw', tag: 'search-listing.slug'},
      )
      .subscribe({
        next: (documents: unknown) => {
          setState({key, documents: Array.isArray(documents) ? documents : []})
        },
        error: () => {
          // Keep the title slug when the preview cannot query the dataset.
        },
      })

    return () => subscription.unsubscribe()
  }, [documentStore, documentType, query, key])

  return key && state.key === key ? state.documents : undefined
}
