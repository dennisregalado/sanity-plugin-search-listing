import {Schema} from '@sanity/schema'
import {describe, expect, test} from 'vitest'

import {
  findSeoTypeAtPath,
  getFieldOptions,
  getSeoTypeOptions,
  getValidationFieldOptions,
  isSeoType,
} from './options'

/** The plugin's `seo` type, a named subtype with options, and documents that nest them. */
const schema = Schema.compile({
  name: 'test',
  types: [
    {
      name: 'seo',
      type: 'object',
      fields: [
        {name: 'title', type: 'string'},
        {name: 'description', type: 'text'},
      ],
    },
    {
      name: 'productSeo',
      type: 'seo',
      options: {maxLength: {title: 50}, slug: {source: ['store.title'], current: ['store.slug']}},
    },
    {
      name: 'page',
      type: 'document',
      fields: [
        {name: 'title', type: 'string'},
        {name: 'seo', type: 'seo', options: {maxLength: {title: 40}}},
        {
          name: 'meta',
          type: 'object',
          fields: [
            {name: 'seo', type: 'seo', options: {home: true, slug: {current: ['meta.slug']}}},
          ],
        },
        {
          name: 'sections',
          type: 'array',
          of: [
            {
              type: 'object',
              name: 'hero',
              fields: [{name: 'seo', type: 'seo', options: {maxLength: {description: 90}}}],
            },
            {type: 'productSeo'},
          ],
        },
        {
          name: 'heroes',
          type: 'array',
          of: [
            {
              type: 'object',
              name: 'hero',
              fields: [{name: 'seo', type: 'productSeo', options: {pathPrefix: '/hero'}}],
            },
          ],
        },
      ],
    },
  ],
})

const document = {
  _id: 'p',
  _type: 'page',
  sections: [
    {_key: 'h1', _type: 'hero'},
    {_key: 's1', _type: 'productSeo'},
  ],
  heroes: [{_key: 'x', _type: 'hero'}],
}

const validate = (path: unknown[]) =>
  getValidationFieldOptions({document, path, schema: schema as never})

describe('isSeoType and getSeoTypeOptions', () => {
  test('a named subtype is an seo type, and its options sit under the field’s', () => {
    const productSeo = schema.get('productSeo')
    expect(isSeoType(productSeo)).toBe(true)
    expect(isSeoType(schema.get('page'))).toBe(false)
    expect(isSeoType(undefined)).toBe(false)

    const heroes = schema
      .get('page')
      .fields.find((field: {name: string}) => field.name === 'heroes')
    const fieldType = heroes.type.of[0].fields[0].type
    expect(getSeoTypeOptions(fieldType)).toEqual({
      maxLength: {title: 50},
      slug: {source: ['store.title'], current: ['store.slug']},
      pathPrefix: '/hero',
    })
  })
})

describe('findSeoTypeAtPath', () => {
  const page = schema.get('page')

  test('stops at the seo type, for the field and for paths into it', () => {
    expect(findSeoTypeAtPath(page, ['seo'])?.options).toEqual({maxLength: {title: 40}})
    expect(findSeoTypeAtPath(page, ['seo', 'title'])?.options).toEqual({maxLength: {title: 40}})
    expect(findSeoTypeAtPath(page, ['meta', 'seo', 'title'])?.options).toMatchObject({home: true})
  })

  test('walks array items by key or index, picking the member by `_type`', () => {
    expect(findSeoTypeAtPath(page, ['sections', {_key: 'h1'}, 'seo'], document)?.options).toEqual({
      maxLength: {description: 90},
    })
    expect(findSeoTypeAtPath(page, ['sections', 1, 'title'], document)?.name).toBe('productSeo')
    // One member type needs no document.
    expect(findSeoTypeAtPath(page, ['heroes', {_key: 'unknown'}, 'seo'])?.name).toBe('productSeo')
  })

  test('gives up on unknown fields, ambiguous arrays and non-seo fields', () => {
    expect(findSeoTypeAtPath(page, ['missing', 'title'])).toBeUndefined()
    expect(findSeoTypeAtPath(page, ['sections', {_key: 'h1'}, 'seo'])).toBeUndefined()
    expect(findSeoTypeAtPath(page, ['title'])).toBeUndefined()
    expect(findSeoTypeAtPath(undefined, ['seo'])).toBeUndefined()
  })
})

describe('getValidationFieldOptions', () => {
  test('reads the options of nested fields instead of the defaults', () => {
    expect(validate(['seo', 'title']).maxLength).toEqual({title: 40, description: 160})
    expect(validate(['meta', 'seo', 'description'])).toMatchObject({
      home: true,
      hasHandle: false,
      maxLength: {title: 70, description: 320},
      slug: {current: ['meta.slug']},
    })
    expect(validate(['sections', {_key: 'h1'}, 'seo', 'description']).maxLength).toEqual({
      title: 70,
      description: 90,
    })
    expect(validate(['sections', {_key: 's1'}, 'title'])).toMatchObject({
      maxLength: {title: 50, description: 160},
      slug: {current: ['store.slug']},
    })
  })

  test('falls back to the defaults when the field cannot be found', () => {
    expect(validate(['nowhere']).maxLength).toEqual({title: 70, description: 160})
    expect(getValidationFieldOptions({path: ['seo', 'title']}).maxLength.title).toBe(70)
  })
})

describe('getFieldOptions', () => {
  test('agrees with validation for the same field', () => {
    const paths = [['seo'], ['meta', 'seo'], ['heroes', {_key: 'x'}, 'seo']]
    for (const path of paths) {
      expect(getFieldOptions({path}, schema as never, 'page')).toEqual(
        getSeoTypeOptions(findSeoTypeAtPath(schema.get('page'), path)),
      )
    }
  })

  test('uses the input’s own schema type when the path cannot be walked', () => {
    const hero = schema
      .get('page')
      .fields.find((field: {name: string}) => field.name === 'sections').type.of[0].fields[0].type
    expect(
      getFieldOptions(
        {path: ['sections', {_key: 'h1'}, 'seo'], schemaType: hero},
        schema as never,
        'page',
      ),
    ).toEqual({maxLength: {description: 90}})
    expect(getFieldOptions({path: ['seo']}, schema as never, undefined)).toEqual({})
  })
})
