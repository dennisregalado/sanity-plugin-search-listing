import React from 'react'

import {getDocumentSlug, getTitleSlug, type SlugDocument, type SlugOptions} from '../resolveSlug'
import {getGeneratedSlug, withoutHandle} from './handle'
import {useSlugCandidates} from './hooks'
import type {StudioFormDocument} from './types'
import {setPathValue} from './utils'

/**
 * The slug the URL handle would be generated as if it were cleared (see `getGeneratedSlug`):
 * a routing slug the document has at once, else its title slug resolved against the live slug
 * candidates (shared with the preview's fallback). Empty while `disabled` or still loading, so
 * callers offer nothing until it has resolved.
 */
export function useGeneratedSlug(
  document: StudioFormDocument,
  options: {disabled?: boolean; slug?: SlugOptions} = {},
): string {
  const disabled = options.disabled === true
  // Stable while the options' content is, whatever the identity of the object passed.
  const slugOptionsKey = JSON.stringify(options.slug ?? null)
  const slugOptions = React.useMemo(
    () => (JSON.parse(slugOptionsKey) as SlugOptions | null) ?? undefined,
    [slugOptionsKey],
  )
  const documentType = typeof document?._type === 'string' ? document._type : ''
  const documentId = typeof document?._id === 'string' ? document._id : ''
  const documentCreatedAt = typeof document?._createdAt === 'string' ? document._createdAt : ''
  const base = disabled ? null : withoutHandle(document as SlugDocument)
  const routingSlug = getDocumentSlug(base, slugOptions)
  const titleSlug = getTitleSlug(base, slugOptions)
  const candidates = useSlugCandidates(
    disabled || routingSlug || !titleSlug ? '' : documentType,
    slugOptions,
  )

  const generated = React.useMemo(() => {
    if (!candidates || !titleSlug) return ''
    // The document as the slug rules read it: its title (already slugified, and slugify is
    // idempotent) at the first source field, and no handle.
    const sourcePath = slugOptions?.source?.[0] ?? 'title'
    const current = setPathValue(
      {_createdAt: documentCreatedAt, _id: documentId, _type: documentType},
      sourcePath,
      titleSlug,
    ) as SlugDocument
    return getGeneratedSlug(current, candidates, slugOptions)
  }, [candidates, titleSlug, slugOptions, documentCreatedAt, documentId, documentType])

  if (disabled) return ''
  return routingSlug || generated
}
