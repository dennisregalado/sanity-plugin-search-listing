import {Box, Stack, Text} from '@sanity/ui'
import React from 'react'
import type {SlugInputProps, StringFieldProps, StringInputProps} from 'sanity'

import {HOME_DESCRIPTION_PLACEHOLDER} from './constants'
import {
  FallbacksContext,
  FieldOptionsContext,
  PathPrefixContext,
  SlugFallbackContext,
  useSiteUrl,
} from './contexts'
import {clipText, getFieldText, getUrlPreview} from './utils'

export function HomePageTitleField(props: StringFieldProps) {
  const {home} = React.useContext(FieldOptionsContext)
  const title = home ? 'Home page title' : props.schemaType.title

  return props.renderDefault({
    ...props,
    title,
  })
}

export function PlaceholderInput(props: StringInputProps) {
  const fieldName = getFieldName(props)
  const options = React.useContext(FieldOptionsContext)
  const isHome = options.home
  const siteUrl = useSiteUrl()
  const fallbacks = React.useContext(FallbacksContext)
  const maxLength =
    fieldName === 'description' ? options.maxLength.description : options.maxLength.title

  // The fallback, as long as the listing would show it: what the field holds while empty.
  const fallbackText = React.useMemo(() => {
    if (isHome) return ''
    const text = getFieldText(
      fieldName === 'description' ? fallbacks.description?.value : fallbacks.title?.value,
    )
    return clipText(text, maxLength, '')
  }, [fallbacks, fieldName, isHome, maxLength])

  const placeholder = React.useMemo(() => {
    if (isHome) return fieldName === 'description' ? HOME_DESCRIPTION_PLACEHOLDER : siteUrl
    return fallbackText
  }, [fallbackText, fieldName, isHome, siteUrl])

  // Only what is typed counts; the fallback is not the field's value.
  const count = (props.value ?? '').length

  const [isEditing, setIsEditing] = React.useState(false)
  // Once the editor types, show exactly what is stored so the field can be cleared.
  const [hasTyped, setHasTyped] = React.useState(false)

  const displayValue =
    isEditing && !hasTyped && !isHome ? props.value || fallbackText : (props.value ?? '')

  return (
    <Stack gap={2}>
      {props.renderDefault({
        ...props,
        elementProps: {
          ...props.elementProps,
          value: displayValue,
          placeholder: placeholder,
          onInput: () => setHasTyped(true),
          onFocus: (event) => {
            props.elementProps.onFocus?.(event)
            setIsEditing(true)
          },
          onBlur: (event) => {
            props.elementProps.onBlur?.(event)
            setIsEditing(false)
            setHasTyped(false)
          },
        } as StringInputProps['elementProps'],
      })}
      <Text size={1} muted>
        {count} of {maxLength} characters used
      </Text>
    </Stack>
  )
}

export function UrlHandleInput(props: SlugInputProps) {
  const pathPrefix = React.useContext(PathPrefixContext)
  const slugFallback = React.useContext(SlugFallbackContext)
  const siteUrl = useSiteUrl()
  const [isEditing, setIsEditing] = React.useState(false)
  const [hasTyped, setHasTyped] = React.useState(false)

  const displayValue =
    isEditing && !hasTyped ? props.value?.current || slugFallback : (props.value?.current ?? '')
  const previewValue = props.value?.current || slugFallback

  const prefixRef = React.useRef<HTMLDivElement>(null)
  const [prefixWidth, setPrefixWidth] = React.useState(0)

  React.useLayoutEffect(() => {
    if (!prefixRef.current) {
      return undefined
    }

    const updateWidth = () => {
      setPrefixWidth(prefixRef.current?.offsetWidth ?? 0)
    }

    updateWidth()

    const resizeObserver = new ResizeObserver(updateWidth)
    resizeObserver.observe(prefixRef.current)

    return () => resizeObserver.disconnect()
  }, [pathPrefix])

  return (
    <Stack gap={2}>
      <Box style={{position: 'relative'}}>
        {props.renderDefault({
          ...props,
          elementProps: {
            ...props.elementProps,
            style: {
              ...props.elementProps?.style,
              paddingLeft: prefixWidth + 12.5,
            } as React.CSSProperties,
            value: displayValue,
            placeholder: slugFallback,
            onInput: () => setHasTyped(true),
            onFocus: (event: React.FocusEvent) => {
              props.elementProps.onFocus?.(event)
              setIsEditing(true)
            },
            onBlur: (event: React.FocusEvent) => {
              props.elementProps.onBlur?.(event)
              setIsEditing(false)
              setHasTyped(false)
            },
          } as SlugInputProps['elementProps'],
        })}
        <Text
          ref={prefixRef}
          style={{
            color: '#555c75',
            position: 'absolute',
            top: 12,
            left: 12,
            fontSize: 15,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {pathPrefix}
        </Text>
      </Box>
      <Text size={1} muted>
        {getUrlPreview(previewValue, pathPrefix, siteUrl)}
      </Text>
    </Stack>
  )
}

export function getFieldName(props: StringInputProps) {
  const lastPathSegment = props.path.at(-1)

  if (typeof lastPathSegment === 'string') {
    return lastPathSegment
  }

  if (props.schemaType.title === 'Meta description') {
    return 'description'
  }

  return 'title'
}
