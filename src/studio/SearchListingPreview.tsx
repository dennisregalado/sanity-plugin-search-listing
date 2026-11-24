import {Stack, Text} from '@sanity/ui'
import React from 'react'
import {useFormValue, useWorkspace} from 'sanity'

import {getPathValue} from '../fallbacks'
import {
  FallbacksContext,
  FieldOptionsContext,
  HasHandleContext,
  PathPrefixContext,
  SiteNameContext,
  SlugFallbackContext,
} from './contexts'
import type {StudioFormDocument} from './types'
import {clipText, getFieldText, getHost, getPathBreadcrumbSegments, getPricePreview} from './utils'

export function SearchListingPreview() {
  const document = useFormValue([]) as StudioFormDocument
  const workspace = useWorkspace()
  const siteName = React.useContext(SiteNameContext)
  const pathPrefix = React.useContext(PathPrefixContext)
  const options = React.useContext(FieldOptionsContext)
  const slugFallback = React.useContext(SlugFallbackContext)
  const hasHandle = React.useContext(HasHandleContext)
  const pathSegments = options.home
    ? []
    : getPathBreadcrumbSegments(pathPrefix, hasHandle ? slugFallback : '')

  const fallbacks = React.useContext(FallbacksContext)
  const title = getFieldText(document?.seo?.title) || getFieldText(fallbacks.title?.value)
  const descriptionText =
    getFieldText(document?.seo?.description) || getFieldText(fallbacks.description?.value)
  const description = clipText(descriptionText, options.maxLength.description)
  const price = options.price
    ? getPricePreview(getPathValue(document, options.price.path), options.price.currency)
    : undefined

  return (
    <Stack gap={2}>
      <Stack gap={4}>
        <Stack gap={2}>
          <Text>{siteName || workspace.title}</Text>
          <Text size={1} muted>
            {[getHost(), ...pathSegments].filter(Boolean).join(' › ')}
          </Text>
        </Stack>
        {title && (
          <Text size={3} weight="medium" style={{color: 'var(--card-avatar-blue-bg-color)'}}>
            {title}
          </Text>
        )}
        {description && (
          <Text size={1} muted>
            {description}
          </Text>
        )}
        {price && (
          <Text size={1} muted>
            {price}
          </Text>
        )}
      </Stack>
    </Stack>
  )
}
