import React from 'react'
import {useClient} from 'sanity'

import {
  getDocumentSlug,
  getSlugCandidatesQuery,
  getTitleSlug,
  type SlugDocument,
  type SlugOptions,
} from '../resolveSlug'
import {API_VERSION, SLUG_LOOKUP_DELAY} from './constants'
import {getGeneratedSlug, withoutHandle} from './handle'
import type {StudioFormDocument} from './types'
import {setPathValue} from './utils'

/**
 * The slug the URL handle would be generated as if it were cleared (see `getGeneratedSlug`):
 * a routing slug the document has at once, else its title slug once the dataset has been
 * checked for duplicates. Empty while `disabled` or unknown, so callers offer nothing until
 * it has resolved.
 */
export function useGeneratedSlug(
  document: StudioFormDocument,
  options: {disabled?: boolean; slug?: SlugOptions} = {},
): string {
  const client = useClient({apiVersion: API_VERSION})
  const rawClient = React.useMemo(
    () => client.withConfig({perspective: 'raw', useCdn: false}),
    [client],
  )
  const disabled = options.disabled === true
  const slugOptions = options.slug
  const documentType = typeof document?._type === 'string' ? document._type : ''
  const documentId = typeof document?._id === 'string' ? document._id : ''
  const documentCreatedAt = typeof document?._createdAt === 'string' ? document._createdAt : ''
  const base = disabled ? null : withoutHandle(document as SlugDocument)
  const routingSlug = getDocumentSlug(base, slugOptions)
  const titleSlug = getTitleSlug(base, slugOptions)
  const lookupKey = `${documentType}:${documentId}:${titleSlug}`
  const [resolved, setResolved] = React.useState({key: '', value: ''})

  React.useEffect(() => {
    if (disabled || routingSlug || !documentType || !titleSlug) return undefined

    let cancelled = false
    // Wait for typing to settle: the query reads every document of this type.
    const timeout = setTimeout(() => {
      rawClient
        .fetch<SlugDocument[]>(getSlugCandidatesQuery(slugOptions), {type: documentType})
        .then((candidates) => {
          if (cancelled) return
          // The document as the slug rules read it: its title (already slugified, and slugify
          // is idempotent) at the first source field, and no handle.
          const sourcePath = slugOptions?.source?.[0] ?? 'title'
          const current = setPathValue(
            {_createdAt: documentCreatedAt, _id: documentId, _type: documentType},
            sourcePath,
            titleSlug,
          ) as SlugDocument
          setResolved({key: lookupKey, value: getGeneratedSlug(current, candidates, slugOptions)})
        })
        .catch(() => {
          // Offer no reset when the dataset cannot be checked.
        })
    }, SLUG_LOOKUP_DELAY)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [
    rawClient,
    disabled,
    routingSlug,
    documentType,
    documentId,
    documentCreatedAt,
    titleSlug,
    lookupKey,
    slugOptions,
  ])

  if (disabled) return ''
  if (routingSlug) return routingSlug
  return resolved.key === lookupKey ? resolved.value : ''
}
