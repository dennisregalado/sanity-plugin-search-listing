import {ResetIcon} from '@sanity/icons/Reset'
// eslint-disable-next-line camelcase -- Sanity UI's name for the theme hook
import {Box, Button, Card, Flex, Stack, Text, useTheme_v2} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'
import React from 'react'
import {
  type ObjectFieldProps,
  PatchEvent,
  set,
  setIfMissing,
  type SlugInputProps,
  type SlugValue,
  type StringFieldProps,
  type StringInputProps,
  useEditState,
  useFormValue,
  useTranslation,
} from 'sanity'

import {searchListingLocaleNamespace} from '../i18n'
import {getCanonicalDocumentId, type SlugDocument} from '../resolveSlug'
import {
  FallbacksContext,
  FieldOptionsContext,
  PathPrefixContext,
  SlugFallbackContext,
  useSiteUrl,
} from './contexts'
import {canResetHandle, getMovedPublishedSlug, getPlaceholder} from './handle'
import type {StudioFormDocument} from './types'
import {useGeneratedSlug} from './useGeneratedSlug'
import {clipText, getFieldText, getPathBreadcrumbSegments, getUrlPreview} from './utils'

/**
 * The URL handle's text input size and padding (Sanity UI's `TextInput` defaults), passed to it
 * explicitly so the path prefix drawn over it uses the same theme font size and spacing.
 */
const HANDLE_FONT_SIZE = 2
const HANDLE_PADDING = 3

/**
 * The title field, labelled in the Studio's language: "Home page title" on a `home` document.
 * Field titles in the schema can't be translated, so the listing's fields set their own.
 */
export function HomePageTitleField(props: StringFieldProps) {
  const {home} = React.useContext(FieldOptionsContext)
  const {t} = useTranslation(searchListingLocaleNamespace)
  const title = home ? t('field.title.home-title') : t('field.title.title')

  return props.renderDefault({
    ...props,
    title,
  })
}

/** The description field, labelled in the Studio's language. */
export function MetaDescriptionField(props: StringFieldProps) {
  const {t} = useTranslation(searchListingLocaleNamespace)
  return props.renderDefault({...props, title: t('field.description.title')})
}

/** The URL handle field, labelled in the Studio's language. */
export function UrlHandleField(props: ObjectFieldProps<SlugValue>) {
  const {t} = useTranslation(searchListingLocaleNamespace)
  return props.renderDefault({...props, title: t('field.url.title')})
}

type TextElement = HTMLInputElement | HTMLTextAreaElement

/**
 * Lets an editor start from a field's fallback. Focusing the empty field puts `fallback` in it,
 * selected: typing, pasting or composing replaces it, while End, an arrow key or a click keeps
 * it for editing. Nothing is stored until the editor changes the text; once they do, the field
 * shows exactly what is stored, so it can be cleared.
 */
function useAdoptedFallback(value: string, fallback: string) {
  const elementRef = React.useRef<TextElement | null>(null)
  const [isEditing, setIsEditing] = React.useState(false)
  const [hasTyped, setHasTyped] = React.useState(false)
  const isAdopted = isEditing && !hasTyped && !value && Boolean(fallback)

  // Select the adopted text once it is in the field. A click places the caret after focus, so
  // select again on the next frame unless the editor has already moved on.
  React.useLayoutEffect(() => {
    const element = elementRef.current
    if (!isAdopted || !element) return undefined
    element.select()
    const frame = requestAnimationFrame(() => {
      if (document.activeElement === element && element.value === fallback) element.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [isAdopted, fallback])

  return {
    displayValue: isAdopted ? fallback : value,
    onInput: () => setHasTyped(true),
    onFocus: (event: React.FocusEvent<TextElement>) => {
      elementRef.current = event.currentTarget
      setIsEditing(true)
    },
    onBlur: () => {
      setIsEditing(false)
      setHasTyped(false)
    },
  }
}

export function PlaceholderInput(props: StringInputProps) {
  const {t} = useTranslation(searchListingLocaleNamespace)
  const fieldName = getFieldName(props)
  const options = React.useContext(FieldOptionsContext)
  const siteUrl = useSiteUrl()
  const fallbacks = React.useContext(FallbacksContext)
  const maxLength =
    fieldName === 'description' ? options.maxLength.description : options.maxLength.title

  // The fallback, as long as the listing would show it: what the field holds while empty.
  const fallbackText = React.useMemo(() => {
    const text = getFieldText(
      fieldName === 'description' ? fallbacks.description?.value : fallbacks.title?.value,
    )
    return clipText(text, maxLength, '')
  }, [fallbacks, fieldName, maxLength])

  // With no fallback, an empty home page field shows the site's address for the title and a
  // prompt for the description.
  const placeholder = getPlaceholder(
    fallbackText,
    options.home,
    fieldName === 'description' ? t('field.description.home-placeholder') : siteUrl,
  )

  // Only what is typed counts; the fallback is not the field's value.
  const count = (props.value ?? '').length
  const adoption = useAdoptedFallback(props.value ?? '', fallbackText)

  return (
    <Stack gap={2}>
      {props.renderDefault({
        ...props,
        elementProps: {
          ...props.elementProps,
          value: adoption.displayValue,
          placeholder,
          onInput: adoption.onInput,
          onFocus: (event: React.FocusEvent<HTMLInputElement>) => {
            props.elementProps.onFocus?.(event)
            adoption.onFocus(event)
          },
          onBlur: (event) => {
            props.elementProps.onBlur?.(event)
            adoption.onBlur()
          },
        } as StringInputProps['elementProps'],
      })}
      <Text size={1} muted>
        {t('field.characters-used', {count, max: maxLength})}
      </Text>
    </Stack>
  )
}

export function UrlHandleInput(props: SlugInputProps) {
  const {t} = useTranslation(searchListingLocaleNamespace)
  const pathPrefix = React.useContext(PathPrefixContext)
  const slugFallback = React.useContext(SlugFallbackContext)
  const siteUrl = useSiteUrl()
  const options = React.useContext(FieldOptionsContext)
  const document = useFormValue([]) as StudioFormDocument
  const {space} = useTheme_v2()
  const handle = props.value?.current ?? ''
  const adoption = useAdoptedFallback(handle, slugFallback)
  const previewValue = handle || slugFallback

  const generatedSlug = useGeneratedSlug(document, {disabled: !handle, slug: options.slug})
  const showReset = canResetHandle(handle, generatedSlug) && !props.readOnly
  const movedFrom = useMovedPublishedSlug(document, previewValue)

  const {onChange, schemaType} = props
  const handleReset = React.useCallback(() => {
    onChange(
      PatchEvent.from([setIfMissing({_type: schemaType.name}), set(generatedSlug, ['current'])]),
    )
  }, [onChange, schemaType.name, generatedSlug])

  const prefixRef = React.useRef<HTMLDivElement>(null)
  const [prefixWidth, setPrefixWidth] = React.useState(0)

  React.useLayoutEffect(() => {
    if (!prefixRef.current) {
      return undefined
    }

    const updateWidth = () => {
      setPrefixWidth(prefixRef.current?.getBoundingClientRect().width ?? 0)
    }

    updateWidth()

    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(prefixRef.current)

    return () => resizeObserver.disconnect()
  }, [pathPrefix])

  const toPath = (slug: string) => `/${getPathBreadcrumbSegments(pathPrefix, slug).join('/')}`

  return (
    <Stack gap={2}>
      <Flex gap={1}>
        <Box flex={1} style={{position: 'relative'}}>
          {props.renderDefault({
            ...props,
            elementProps: {
              ...props.elementProps,
              fontSize: HANDLE_FONT_SIZE,
              padding: HANDLE_PADDING,
              style: {
                ...props.elementProps?.style,
                // The prefix sits where the text would start; the text starts after it.
                paddingLeft: space[HANDLE_PADDING] + prefixWidth,
              } as React.CSSProperties,
              value: adoption.displayValue,
              placeholder: slugFallback,
              onInput: adoption.onInput,
              onFocus: (event: React.FocusEvent<HTMLInputElement>) => {
                props.elementProps.onFocus?.(event)
                adoption.onFocus(event)
              },
              onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
                props.elementProps.onBlur?.(event)
                adoption.onBlur()
              },
            } as SlugInputProps['elementProps'],
          })}
          {/* Over the input, at its padding, in its font size: aligned with the text. */}
          <Box
            padding={HANDLE_PADDING}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 1,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <Text ref={prefixRef} size={HANDLE_FONT_SIZE} muted>
              {pathPrefix}
            </Text>
          </Box>
        </Box>
        {showReset && (
          <Tooltip
            content={
              <Text size={1}>{t('url-handle.reset.tooltip', {path: toPath(generatedSlug)})}</Text>
            }
            placement="top"
            portal
          >
            <Button
              mode="ghost"
              icon={ResetIcon}
              text={t('url-handle.reset')}
              onClick={handleReset}
            />
          </Tooltip>
        )}
      </Flex>
      <Text size={1} muted>
        {getUrlPreview(previewValue, pathPrefix, siteUrl)}
      </Text>
      {movedFrom && (
        <Card tone="caution" padding={3} radius={2} border>
          <Text size={1}>{t('url-handle.published-moved', {path: toPath(movedFrom)})}</Text>
        </Card>
      )}
    </Stack>
  )
}

/**
 * The slug the published document is served at, when `handle` would move it (see
 * `getMovedPublishedSlug`). Read from the Studio's own document state, so no extra query.
 */
function useMovedPublishedSlug(document: StudioFormDocument, handle: string): string {
  const options = React.useContext(FieldOptionsContext)
  const id = getCanonicalDocumentId(document?._id)
  const type = typeof document?._type === 'string' ? document._type : ''
  const {published} = useEditState(id, type, 'low')
  return getMovedPublishedSlug(published as SlugDocument | null, handle, options.slug)
}

/** The field this input edits (`title` or `description`): the last segment of its path. */
export function getFieldName(props: StringInputProps) {
  const lastPathSegment = props.path.at(-1)
  return typeof lastPathSegment === 'string' ? lastPathSegment : 'title'
}
