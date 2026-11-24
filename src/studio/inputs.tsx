import {ResetIcon} from '@sanity/icons/Reset'
// eslint-disable-next-line camelcase -- Sanity UI's name for the theme hook
import {Box, Button, Card, Flex, Stack, Text, useTheme_v2} from '@sanity/ui'
import {Tooltip} from '@sanity/ui/tooltip'
import React from 'react'
import {
  PatchEvent,
  set,
  setIfMissing,
  type SlugInputProps,
  type StringFieldProps,
  type StringInputProps,
  useEditState,
  useFormValue,
} from 'sanity'

import {getCanonicalDocumentId, type SlugDocument} from '../resolveSlug'
import {HOME_DESCRIPTION_PLACEHOLDER} from './constants'
import {
  FallbacksContext,
  FieldOptionsContext,
  PathPrefixContext,
  SlugFallbackContext,
} from './contexts'
import {canResetHandle, getMovedPublishedSlug, getPlaceholder} from './handle'
import type {StudioFormDocument} from './types'
import {useGeneratedSlug} from './useGeneratedSlug'
import {clipText, getFieldText, getHost, getPathBreadcrumbSegments, getUrlPreview} from './utils'

/** Every user-facing string of these inputs, in one place for translation. */
const STRINGS = {
  homeTitle: 'Home page title',
  charactersUsed: (count: number, max: number) => `${count} of ${max} characters used`,
  resetHandle: 'Reset',
  resetHandleTooltip: (path: string) => `Reset to ${path}, the URL generated from the title`,
  publishedMoved: (path: string) =>
    `Published at ${path}. Changing the handle moves the page; links to the old URL need a redirect.`,
}

/**
 * The URL handle's text input size and padding (Sanity UI's `TextInput` defaults), passed to it
 * explicitly so the path prefix drawn over it uses the same theme font size and spacing.
 */
const HANDLE_FONT_SIZE = 2
const HANDLE_PADDING = 3

export function HomePageTitleField(props: StringFieldProps) {
  const {home} = React.useContext(FieldOptionsContext)
  const title = home ? STRINGS.homeTitle : props.schemaType.title

  return props.renderDefault({
    ...props,
    title,
  })
}

/**
 * What an empty home page field shows when it has no fallback: the site's address for the
 * title, a prompt for the description.
 */
function getHomePlaceholder(fieldName: string) {
  return fieldName === 'description' ? HOME_DESCRIPTION_PLACEHOLDER : getHost()
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
  const fieldName = getFieldName(props)
  const options = React.useContext(FieldOptionsContext)
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

  const placeholder = getPlaceholder(fallbackText, options.home, getHomePlaceholder(fieldName))

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
        {STRINGS.charactersUsed(count, maxLength)}
      </Text>
    </Stack>
  )
}

export function UrlHandleInput(props: SlugInputProps) {
  const pathPrefix = React.useContext(PathPrefixContext)
  const slugFallback = React.useContext(SlugFallbackContext)
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
            content={<Text size={1}>{STRINGS.resetHandleTooltip(toPath(generatedSlug))}</Text>}
            placement="top"
            portal
          >
            <Button
              mode="ghost"
              icon={ResetIcon}
              text={STRINGS.resetHandle}
              onClick={handleReset}
            />
          </Tooltip>
        )}
      </Flex>
      <Text size={1} muted>
        {getUrlPreview(previewValue, pathPrefix)}
      </Text>
      {movedFrom && (
        <Card tone="caution" padding={3} radius={2} border>
          <Text size={1}>{STRINGS.publishedMoved(toPath(movedFrom))}</Text>
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
