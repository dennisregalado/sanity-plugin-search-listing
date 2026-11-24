import React from 'react'
import {type FormPatch, type ObjectFieldProps, type ObjectInputProps, PatchEvent} from 'sanity'

import {guardFallbackImagePatches} from './editMode'

/**
 * The stand-in value the listing's image input shows for a Sanity image fallback, or
 * `undefined` when the document's own image (or nothing) is shown.
 */
export const FallbackImageContext = React.createContext<Record<string, unknown> | undefined>(
  undefined,
)

/**
 * Shows the listing image at the 1200×630 ratio of a search or social card. The image input
 * has no option for its preview's ratio, so this targets its preview box, scoped to this field.
 * React hoists and de-duplicates the `<style>` by its `href`, so it is added to the page once
 * however many listing fields are open.
 */
const IMAGE_FIELD_STYLES = `
.seo-image-field div:has(> img[data-testid="hotspot-image-input"]) {
  aspect-ratio: 1200 / 630 !important;
  max-height: min-content !important;
}
`

/** The listing's image field: its input without the field's own title. */
export function SearchListingImageField(props: ObjectFieldProps) {
  return (
    <div className="seo-image-field">
      <style href="sanity-plugin-search-listing/image-field" precedence="default">
        {IMAGE_FIELD_STYLES}
      </style>
      {props.children}
    </div>
  )
}

/**
 * The listing's image input. With a Sanity image fallback it shows the fallback in place of
 * the empty value and only lets a change through when it sets a real asset (Upload, Select),
 * so Clear field and hotspot or crop edits on the borrowed image write nothing.
 */
export function SearchListingImageInput(props: ObjectInputProps) {
  const fallbackImage = React.useContext(FallbackImageContext)
  const {onChange} = props
  const handleFallbackChange = React.useCallback(
    (event: FormPatch | FormPatch[] | PatchEvent) => {
      const patches = guardFallbackImagePatches(PatchEvent.from(event).patches)
      if (patches.length) onChange(patches)
    },
    [onChange],
  )

  if (!fallbackImage) return props.renderDefault(props)

  return props.renderDefault({
    ...props,
    value: fallbackImage as ObjectInputProps['value'],
    onChange: handleFallbackChange,
  })
}
