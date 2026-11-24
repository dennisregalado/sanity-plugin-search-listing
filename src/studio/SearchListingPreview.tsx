import {Stack, Text} from '@sanity/ui'
import React from 'react'
import {useCurrentLocale, useFormValue, useTranslation, useWorkspace} from 'sanity'

import {getPathValue} from '../fallbacks'
import {searchListingLocaleNamespace} from '../i18n'
import {
  FallbacksContext,
  FieldOptionsContext,
  HasHandleContext,
  PathPrefixContext,
  SiteNameContext,
  SlugFallbackContext,
  useSiteUrl,
} from './contexts'
import type {StudioFormDocument} from './types'
import {clipText, getFieldText, getPathBreadcrumbSegments, getPricePreview} from './utils'

/** Search results link their title; the Card's link colour reads well in light and dark. */
const TITLE_STYLE: React.CSSProperties = {color: 'var(--card-link-fg-color)'}

export function SearchListingPreview() {
  const document = useFormValue([]) as StudioFormDocument
  const workspace = useWorkspace()
  const locale = useCurrentLocale()
  const {t} = useTranslation(searchListingLocaleNamespace)
  const siteName = React.useContext(SiteNameContext)
  const siteUrl = useSiteUrl()
  const pathPrefix = React.useContext(PathPrefixContext)
  const options = React.useContext(FieldOptionsContext)
  const slugFallback = React.useContext(SlugFallbackContext)
  const hasHandle = React.useContext(HasHandleContext)
  const pathSegments = options.home
    ? []
    : getPathBreadcrumbSegments(pathPrefix, hasHandle ? slugFallback : '')
  // A page that should have a handle but has none yet keeps a placeholder in its place.
  const missingHandle = !options.home && hasHandle && !slugFallback

  const fallbacks = React.useContext(FallbacksContext)
  const title = getFieldText(document?.seo?.title) || getFieldText(fallbacks.title?.value)
  const descriptionText =
    getFieldText(document?.seo?.description) || getFieldText(fallbacks.description?.value)
  const description = clipText(descriptionText, options.maxLength.description)
  const price = options.price
    ? getPricePreview(getPathValue(document, options.price.path), options.price.currency, locale.id)
    : undefined

  return (
    <Stack gap={2}>
      <Stack gap={4}>
        <Stack gap={2}>
          <Text>{siteName || workspace.title}</Text>
          <Text size={1} muted>
            {[siteUrl, ...pathSegments].filter(Boolean).join(' › ')}
            {missingHandle && (
              <>
                {siteUrl || pathSegments.length ? ' › ' : ''}
                <em>{t('preview.missing-handle')}</em>
              </>
            )}
          </Text>
        </Stack>
        {title ? (
          <Text size={3} weight="medium" style={TITLE_STYLE}>
            {title}
          </Text>
        ) : (
          <Text size={3} weight="medium" muted>
            {t('preview.untitled')}
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
