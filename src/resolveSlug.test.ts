import {describe, expect, it} from 'vitest'

import {shopifyProduct} from './presets'
import {
  getCanonicalDocumentId,
  getDocumentSlug,
  getSlugCandidatesQuery,
  getTitleSlug,
  isSlugTaken,
  isValidUrlHandle,
  resolveAvailableSlug,
  type SlugDocument,
  slugify,
} from './resolveSlug'

const page = (id: string, createdAt: string, fields: Partial<SlugDocument> = {}): SlugDocument => ({
  _createdAt: createdAt,
  _id: id,
  _type: 'page',
  ...fields,
})

describe('slugify', () => {
  it('lowercases, strips accents and collapses separators', () => {
    expect(slugify('  Café & Crème — Très Bon!  ')).toBe('cafe-and-creme-tres-bon')
  })

  it('is idempotent', () => {
    const once = slugify('Very cool function')
    expect(slugify(once)).toBe(once)
  })
})

describe('isValidUrlHandle', () => {
  it('accepts hyphenated lowercase handles only', () => {
    expect(isValidUrlHandle('about-us-2')).toBe(true)
    expect(isValidUrlHandle('About Us')).toBe(false)
    expect(isValidUrlHandle('about/us')).toBe(false)
    expect(isValidUrlHandle('-about')).toBe(false)
    expect(isValidUrlHandle('')).toBe(false)
  })
})

describe('getTitleSlug', () => {
  it('reads title, then name, by default', () => {
    expect(getTitleSlug({title: 'A Page', name: 'Ignored'})).toBe('a-page')
    expect(getTitleSlug({name: 'Studio Maker'})).toBe('studio-maker')
    expect(getTitleSlug({title: '<em>Bold</em> move'})).toBe('bold-move')
    // No Shopify shape unless asked for.
    expect(getTitleSlug({store: {title: 'Oak Chair'}})).toBe('')
  })

  it('reads the configured source paths in order', () => {
    expect(getTitleSlug({store: {title: 'Oak Chair'}}, shopifyProduct.slug)).toBe('oak-chair')
    expect(getTitleSlug({title: 'A', headline: 'B'}, {source: ['headline', 'title']})).toBe('b')
  })
})

describe('getDocumentSlug', () => {
  it('prefers seo.url, then slug, by default', () => {
    expect(getDocumentSlug({seo: {url: {current: 'a'}}, slug: {current: 'b'}})).toBe('a')
    expect(getDocumentSlug({seo: {url: {}}, slug: {current: 'b'}})).toBe('b')
    expect(getDocumentSlug({store: {slug: {current: 'c'}}})).toBe('')
    expect(getDocumentSlug({})).toBe('')
  })

  it('reads the configured routing slug fields after seo.url', () => {
    const product = {store: {slug: {current: 'oak-chair'}}}
    expect(getDocumentSlug(product, shopifyProduct.slug)).toBe('oak-chair')
    expect(getDocumentSlug({...product, seo: {url: {current: 'x'}}}, shopifyProduct.slug)).toBe('x')
  })

  it('treats another product with the same Shopify handle as taken', () => {
    const documents = [
      {_id: 'a', _type: 'product', store: {title: 'Oak Chair', slug: {current: 'oak-chair'}}},
    ]
    expect(isSlugTaken('oak-chair', {_id: 'b'}, documents, shopifyProduct.slug)).toBe(true)
    expect(isSlugTaken('oak-chair', {_id: 'b'}, documents)).toBe(false)
  })
})

describe('getSlugCandidatesQuery', () => {
  it('projects the default fields, or the configured ones nested', () => {
    expect(getSlugCandidatesQuery()).toContain('title, name, slug{current}, seo{url{current}}')
    expect(getSlugCandidatesQuery(shopifyProduct.slug)).toContain(
      'store{title, slug{current}}, seo{url{current}}',
    )
    expect(() => getSlugCandidatesQuery({source: ['title || true']})).toThrow()
  })
})

describe('getCanonicalDocumentId', () => {
  it('folds drafts and release versions onto the published id', () => {
    expect(getCanonicalDocumentId('drafts.abc')).toBe('abc')
    expect(getCanonicalDocumentId('versions.r1.abc')).toBe('abc')
    expect(getCanonicalDocumentId('abc')).toBe('abc')
  })
})

describe('resolveAvailableSlug', () => {
  const title = 'Very cool function'

  it('returns the explicit slug, even without a title', () => {
    expect(resolveAvailableSlug(page('a', '2026-01-01', {slug: {current: 'kept'}}), [])).toBe(
      'kept',
    )
  })

  it('returns nothing without a title or a slug', () => {
    expect(resolveAvailableSlug(page('a', '2026-01-01'), [])).toBe('')
  })

  it('hands out base, -2, -3 in creation order', () => {
    const documents = [
      page('c', '2026-01-03', {title}),
      page('a', '2026-01-01', {title}),
      page('b', '2026-01-02', {title}),
      page('d', '2026-01-04', {title}),
    ]

    expect(
      documents.map((document) => [document._id, resolveAvailableSlug(document, documents)]),
    ).toEqual([
      ['c', 'very-cool-function-3'],
      ['a', 'very-cool-function'],
      ['b', 'very-cool-function-2'],
      ['d', 'very-cool-function-4'],
    ])
  })

  it('skips slugs other documents own under any slug field', () => {
    const documents = [
      page('owner', '2026-02-01', {slug: {current: 'very-cool-function'}}),
      page('handle', '2026-02-02', {
        seo: {url: {current: 'very-cool-function-2'}},
        slug: {current: 'old-route'},
      }),
      page('new', '2026-02-03', {title}),
    ]

    expect(resolveAvailableSlug(documents[2], documents)).toBe('very-cool-function-3')
  })

  it('treats a draft and its published document as one', () => {
    const documents = [page('a', '2026-01-02', {title}), page('drafts.a', '2026-01-05', {title})]

    expect(resolveAvailableSlug(documents[1], documents)).toBe('very-cool-function')
  })

  it('uses the current copy of the document over the stored one', () => {
    const stored = [page('a', '2026-01-01', {title: 'Old title'}), page('b', '2026-01-02', {title})]
    const current = page('drafts.a', '2026-01-03', {title})

    // `a` was created first, so it takes the base slug once retitled.
    expect(resolveAvailableSlug(current, stored)).toBe('very-cool-function')
    expect(resolveAvailableSlug(stored[1], [...stored, current])).toBe('very-cool-function-2')
  })

  it('lets saved documents go before one that has not been saved yet', () => {
    const documents = [page('saved', '2026-01-01', {title})]

    expect(resolveAvailableSlug({_id: 'drafts.unsaved', _type: 'page', title}, documents)).toBe(
      'very-cool-function-2',
    )
  })

  it('breaks creation-time ties by document id', () => {
    const documents = [page('b', '2026-01-01', {title}), page('a', '2026-01-01', {title})]

    expect(resolveAvailableSlug(documents[0], documents)).toBe('very-cool-function-2')
  })
})

describe('isSlugTaken', () => {
  const documents = [
    page('a', '2026-01-01', {seo: {url: {current: 'new'}}, slug: {current: 'old'}}),
    page('drafts.b', '2026-01-02', {slug: {current: 'mine'}}),
  ]

  it('checks every slug field of other documents', () => {
    expect(isSlugTaken('new', page('b', ''), documents)).toBe(true)
    expect(isSlugTaken('old', page('b', ''), documents)).toBe(true)
    expect(isSlugTaken('free', page('b', ''), documents)).toBe(false)
  })

  it('ignores the document itself, draft or published', () => {
    expect(isSlugTaken('mine', page('b', ''), documents)).toBe(false)
  })
})
