import React from 'react'
import {
  defineField,
  definePlugin,
  defineType,
  type DocumentActionComponent,
  type DuplicateActionProps,
  type ObjectFieldProps,
  type ObjectInputProps,
} from 'sanity'

import {prepareDuplicate} from './duplicate'
import {isValidUrlHandle} from './resolveSlug'
import {HomePageTitleField, PlaceholderInput, UrlHandleInput} from './studio/inputs'
import {getValidationFieldOptions} from './studio/options'
import {
  SearchListingField,
  SearchListingInput,
  type SearchListingInputProps,
} from './studio/SearchListingInput'
import {isUrlHandleUnique} from './studio/validation'
import type {SearchListingPluginOptions} from './types'

export const searchListing = definePlugin<SearchListingPluginOptions | void>((options) => {
  const siteName = options?.siteName
  const pluginFallbacks = options?.fallbacks
  const duplicateOption = options?.duplicate ?? true
  const duplicateOmit =
    typeof duplicateOption === 'object' ? (duplicateOption.omit ?? ['slug']) : ['slug']
  const duplicateTitleSuffix =
    typeof duplicateOption === 'object' ? duplicateOption.titleSuffix : undefined

  const searchListingType = defineType({
    name: 'seo',
    title: 'Search engine listing',
    type: 'object',
    components: {
      field: SearchListingField,
      input: (props: ObjectInputProps) =>
        React.createElement(SearchListingInput, {
          ...props,
          siteName,
          pluginFallbacks,
        } as SearchListingInputProps),
    },
    fields: [
      defineField({
        name: 'image',
        title: 'Image',
        type: 'image',
        components: {
          field: (props: ObjectFieldProps) => {
            return <div className="seo-image-field">{props.children}</div>
          },
        },
      }),
      defineField({
        name: 'title',
        title: 'Page title',
        placeholder: 'Enter page title',
        components: {
          field: HomePageTitleField,
          input: PlaceholderInput,
        },
        validation: (rule) =>
          rule
            .custom((value, context) => {
              const {maxLength} = getValidationFieldOptions(context)
              return typeof value === 'string' && value.length > maxLength.title
                ? 'Longer titles may be truncated by search engines'
                : true
            })
            .warning(),
        type: 'string',
      }),
      defineField({
        name: 'description',
        title: 'Meta description',
        type: 'text',
        components: {
          input: PlaceholderInput,
        },
        rows: 4,
        validation: (rule) =>
          rule
            .custom((value, context) => {
              const {maxLength} = getValidationFieldOptions(context)

              if (typeof value === 'string' && value.length > maxLength.description) {
                return 'Longer descriptions may be truncated by search engines'
              }

              return true
            })
            .warning(),
      }),
      defineField({
        name: 'url',
        title: 'URL handle',
        type: 'slug',
        // Not shown for `home` or `handle: false`: the input leaves the member out.
        options: {
          isUnique: isUrlHandleUnique,
        },
        validation: (rule) =>
          rule.custom((value) => {
            if (!value?.current || isValidUrlHandle(value.current)) {
              return true
            }

            return 'Use lowercase letters, numbers and hyphens only'
          }),
        components: {
          input: UrlHandleInput,
        },
      }),
    ],
  })

  return {
    name: 'search-listing',
    schema: {
      types: [searchListingType],
    },
    document:
      duplicateOption === false
        ? undefined
        : {
            // A duplicate would otherwise claim the original's URL. Every type with an `seo`
            // field gets a copy without its URL handle and routing slug.
            actions: (prev, context) => {
              // structureTool() adds the default actions, Duplicate included. A plugin listed
              // before it sees an empty list and has nothing to wrap.
              if (!prev.length) {
                warnRegisteredBeforeStructureTool()
                return prev
              }
              const seoFields = getSeoFieldNames(context.schema.get(context.schemaType))
              if (!seoFields.length) return prev

              return prev.map((action) =>
                action.action === 'duplicate'
                  ? withoutUrlOnDuplicate(action, {
                      seoFields,
                      omit: duplicateOmit,
                      titleSuffix: duplicateTitleSuffix,
                    })
                  : action,
              )
            },
          },
  }
})

let warnedAboutOrder = false

function warnRegisteredBeforeStructureTool() {
  if (warnedAboutOrder) return
  warnedAboutOrder = true
  // eslint-disable-next-line no-console -- a configuration mistake the developer must see
  console.warn(
    'sanity-plugin-search-listing: register searchListing() after structureTool() in `plugins`, ' +
      'or duplicating a document copies its URL handle. Pass `duplicate: false` to silence this.',
  )
}

/** Names of the document's top-level fields of type `seo`. */
function getSeoFieldNames(schemaType: unknown): string[] {
  const fields = (schemaType as {fields?: Array<{name: string; type?: {name?: string}}>})?.fields
  if (!Array.isArray(fields)) return []
  return fields.filter((field) => field.type?.name === 'seo').map((field) => field.name)
}

function withoutUrlOnDuplicate(
  duplicate: DocumentActionComponent,
  options: {seoFields: string[]; omit: readonly string[]; titleSuffix?: string | false},
): DocumentActionComponent {
  const Duplicate = duplicate as unknown as (
    props: DuplicateActionProps,
  ) => ReturnType<DocumentActionComponent>
  const action: DocumentActionComponent = (props) =>
    Duplicate({...props, mapDocument: (document) => prepareDuplicate(document, options)})

  action.action = 'duplicate'
  action.displayName = 'SearchListingDuplicateAction'
  return action
}
