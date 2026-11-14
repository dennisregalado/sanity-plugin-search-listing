import {describe, expect, it} from 'vitest'

import {
  getFallbackSources,
  getImageUrl,
  getPathValue,
  getQueryKey,
  hasFallbackValue,
  type NormalizedSource,
  resolveFallback,
} from './fallbacks'

const GLOBAL_IMAGE = {query: '*[_id == "preferences"][0].seo.image', label: 'Preferences'}

describe('getFallbackSources', () => {
  it('reads title and description from the document by default', () => {
    expect(
      getFallbackSources('title', undefined, undefined).map((s) => s.kind === 'path' && s.path),
    ).toEqual(['title', 'name', 'store.title'])
    expect(getFallbackSources('image', undefined, undefined)).toEqual([])
  })

  it('tries the field fallbacks, then the plugin fallbacks', () => {
    const sources = getFallbackSources(
      'image',
      {image: {path: 'store.previewImageUrl', label: 'Shopify'}},
      {image: GLOBAL_IMAGE},
    )

    expect(sources).toEqual([
      {kind: 'path', path: 'store.previewImageUrl', label: 'Shopify'},
      {kind: 'query', query: GLOBAL_IMAGE.query, params: {}, label: 'Preferences'},
    ])
  })

  it('replaces the document defaults when the field sets its own', () => {
    expect(getFallbackSources('title', {title: 'headline'}, {title: 'siteTitle'})).toEqual([
      {kind: 'path', path: 'headline'},
      {kind: 'path', path: 'siteTitle'},
    ])
    // An empty list turns the defaults off.
    expect(getFallbackSources('title', {title: []}, undefined)).toEqual([])
  })

  it('keeps the document defaults when the field only sets another field', () => {
    expect(getFallbackSources('title', {image: 'mainImage'}, undefined)).toHaveLength(3)
  })

  it('drops sources it cannot use', () => {
    expect(getFallbackSources('image', {image: ['', {path: ' '}, {} as never]}, undefined)).toEqual(
      [],
    )
  })
})

describe('getPathValue', () => {
  it('walks objects and array indexes', () => {
    const document = {store: {slug: {current: 'chair'}}, images: [{url: 'a'}]}
    expect(getPathValue(document, 'store.slug.current')).toBe('chair')
    expect(getPathValue(document, 'images.0.url')).toBe('a')
    expect(getPathValue(document, 'store.missing.deep')).toBeUndefined()
  })
})

describe('hasFallbackValue', () => {
  it('rejects empty values, including an image with only a _type', () => {
    expect(hasFallbackValue('')).toBe(false)
    expect(hasFallbackValue('  ')).toBe(false)
    expect(hasFallbackValue([])).toBe(false)
    expect(hasFallbackValue({_type: 'image'})).toBe(false)
    expect(hasFallbackValue(null)).toBe(false)
    expect(hasFallbackValue({_type: 'image', asset: {_ref: 'x'}})).toBe(true)
    expect(hasFallbackValue('https://cdn.shopify.com/a.jpg')).toBe(true)
  })
})

describe('resolveFallback', () => {
  const shopify: NormalizedSource = {kind: 'path', path: 'store.previewImageUrl', label: 'Shopify'}
  const global: NormalizedSource = {kind: 'query', query: GLOBAL_IMAGE.query, params: {}}

  it('uses the first source with a value', () => {
    const document = {store: {previewImageUrl: 'https://cdn.shopify.com/a.jpg'}}
    const results = new Map([[getQueryKey(global), {asset: {_ref: 'image-abc-10x10-png'}}]])

    expect(resolveFallback([shopify, global], document, results)).toEqual({
      value: 'https://cdn.shopify.com/a.jpg',
      source: shopify,
    })
  })

  it('falls through to the global query', () => {
    const results = new Map([[getQueryKey(global), {asset: {_ref: 'image-abc-10x10-png'}}]])

    expect(resolveFallback([shopify, global], {store: {}}, results)?.source).toBe(global)
  })

  it('skips a query that has not returned yet', () => {
    expect(resolveFallback([global, shopify], {}, new Map())).toBeUndefined()
  })
})

describe('getImageUrl', () => {
  const project = {projectId: 'p1', dataset: 'production'}

  it('builds a CDN URL from an image reference', () => {
    expect(getImageUrl({_type: 'image', asset: {_ref: 'image-abc123-1200x630-jpg'}}, project)).toBe(
      'https://cdn.sanity.io/images/p1/production/abc123-1200x630.jpg?w=1200&fit=max&auto=format',
    )
  })

  it('accepts URLs and dereferenced assets', () => {
    expect(getImageUrl('https://cdn.shopify.com/a.jpg', project)).toBe(
      'https://cdn.shopify.com/a.jpg',
    )
    expect(getImageUrl({asset: {url: 'https://cdn.sanity.io/x.png'}}, project)).toBe(
      'https://cdn.sanity.io/x.png',
    )
    expect(getImageUrl({_id: 'image-abc-10x10-png'}, project)).toContain('/abc-10x10.png')
  })

  it('returns nothing for values it cannot show', () => {
    expect(getImageUrl('not a url', project)).toBeUndefined()
    expect(getImageUrl({asset: {_ref: 'file-abc-pdf'}}, project)).toBeUndefined()
    expect(getImageUrl({asset: {_ref: 'image-abc-10x10-png'}}, {})).toBeUndefined()
  })
})
