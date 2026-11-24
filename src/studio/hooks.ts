import React from 'react'
import {useClient, useDocumentStore} from 'sanity'

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
import {API_VERSION, SLUG_LOOKUP_DELAY} from './constants'
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

  const [queryResults, setQueryResults] = React.useState<ReadonlyMap<string, unknown>>(
    () => new Map(),
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
            setQueryResults((previous) => new Map(previous).set(key, result))
          },
          error: () => {
            // A failing query is skipped; the next source is used instead.
          },
        }),
    )

    return () => subscriptions.forEach((subscription) => subscription.unsubscribe())
  }, [documentStore, querySources, id, type])

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
 * duplicate-aware slug once the dataset has been checked.
 */
export function useResolvedSlugFallback(
  document: StudioFormDocument,
  options: {disabled?: boolean; slug?: SlugOptions} = {},
) {
  const client = useClient({apiVersion: API_VERSION})
  const rawClient = React.useMemo(
    () => client.withConfig({perspective: 'raw', useCdn: false}),
    [client],
  )
  const disabled = options.disabled === true
  const documentType = typeof document?._type === 'string' ? document._type : ''
  const documentId = typeof document?._id === 'string' ? document._id : ''
  const documentCreatedAt = typeof document?._createdAt === 'string' ? document._createdAt : ''
  const slugOptions = options.slug
  const slugOptionsKey = JSON.stringify(slugOptions ?? null)
  const explicitSlug = disabled ? '' : getDocumentSlug(document as SlugDocument, slugOptions)
  const titleSlug = disabled ? '' : getTitleSlug(document as SlugDocument, slugOptions)
  const lookupKey = `${documentType}:${documentId}:${titleSlug}`
  const [resolved, setResolved] = React.useState({key: '', value: ''})

  React.useEffect(() => {
    if (disabled || explicitSlug || !documentType || !titleSlug) {
      return undefined
    }

    let cancelled = false
    // Wait for typing to settle: the query reads every document of this type.
    const timeout = setTimeout(() => {
      rawClient
        .fetch<SlugDocument[]>(getSlugCandidatesQuery(slugOptions), {type: documentType})
        .then((documents) => {
          if (cancelled) {
            return
          }

          // The title being edited, at the first source field. Already slugified, and slugify
          // is idempotent.
          const sourcePath = slugOptions?.source?.[0] ?? 'title'
          const currentDocument = setPathValue(
            {_createdAt: documentCreatedAt, _id: documentId, _type: documentType},
            sourcePath,
            titleSlug,
          ) as SlugDocument

          setResolved({
            key: lookupKey,
            value: resolveAvailableSlug(currentDocument, documents, slugOptions),
          })
        })
        .catch(() => {
          // Keep the title slug when the preview cannot query the dataset.
        })
    }, SLUG_LOOKUP_DELAY)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [
    rawClient,
    disabled,
    explicitSlug,
    documentType,
    documentId,
    documentCreatedAt,
    titleSlug,
    lookupKey,
    slugOptions,
    slugOptionsKey,
  ])

  if (explicitSlug) {
    return explicitSlug
  }

  return resolved.key === lookupKey ? resolved.value : titleSlug
}
