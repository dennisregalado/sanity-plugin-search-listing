import {describe, expect, it} from 'vitest'

import type {SlugDocument} from '../resolveSlug'
import {
  canResetHandle,
  getGeneratedSlug,
  getMovedPublishedSlug,
  getPlaceholder,
  withoutHandle,
} from './handle'

const page = (id: string, fields: Record<string, unknown> = {}): SlugDocument => ({
  _id: id,
  _type: 'page',
  _createdAt: '2026-01-01T00:00:00Z',
  ...fields,
})

describe('withoutHandle', () => {
  it('drops seo.url and keeps the rest', () => {
    const document = page('a', {seo: {title: 'T', url: {current: 'x'}}})
    expect(withoutHandle(document)).toEqual(page('a', {seo: {title: 'T'}}))
    expect(document.seo).toHaveProperty('url')
  })

  it('leaves a document without seo alone', () => {
    const document = page('a')
    expect(withoutHandle(document)).toBe(document)
  })
})

describe('getGeneratedSlug', () => {
  it('ignores the handle and uses the title slug', () => {
    const document = page('a', {title: 'About Us', seo: {url: {current: 'our-story'}}})
    expect(getGeneratedSlug(document, [])).toBe('about-us')
  })

  it('ignores the document’s own copies in the candidates', () => {
    const document = page('drafts.a', {title: 'About Us', seo: {url: {current: 'our-story'}}})
    const candidates = [
      page('a', {title: 'About Us', seo: {url: {current: 'our-story'}}}),
      page('drafts.a', {title: 'About Us', seo: {url: {current: 'our-story'}}}),
    ]
    expect(getGeneratedSlug(document, candidates)).toBe('about-us')
  })

  it('numbers past slugs other documents own', () => {
    const document = page('a', {title: 'About Us', seo: {url: {current: 'x'}}})
    const candidates = [page('b', {seo: {url: {current: 'about-us'}}})]
    expect(getGeneratedSlug(document, candidates)).toBe('about-us-2')
  })

  it('prefers a routing slug the document has', () => {
    const document = page('a', {title: 'Contact', slug: {current: 'get-in-touch'}})
    expect(getGeneratedSlug(document, [])).toBe('get-in-touch')
  })

  it('follows the slug options', () => {
    const document = {_id: 'p', _type: 'product', store: {title: 'Canvas Tote'}}
    expect(getGeneratedSlug(document, [], {source: ['store.title']})).toBe('canvas-tote')
  })
})

describe('canResetHandle', () => {
  it('needs a handle that differs from a known generated slug', () => {
    expect(canResetHandle('our-story', 'about-us')).toBe(true)
    expect(canResetHandle('about-us', 'about-us')).toBe(false)
    expect(canResetHandle('', 'about-us')).toBe(false)
    expect(canResetHandle(undefined, 'about-us')).toBe(false)
    expect(canResetHandle('our-story', '')).toBe(false)
  })
})

describe('getMovedPublishedSlug', () => {
  const published = page('a', {seo: {url: {current: 'about-us'}}})

  it('returns the published slug when the handle differs', () => {
    expect(getMovedPublishedSlug(published, 'our-story')).toBe('about-us')
  })

  it('is empty when the handle is unchanged, or there is nothing published', () => {
    expect(getMovedPublishedSlug(published, 'about-us')).toBe('')
    expect(getMovedPublishedSlug(null, 'our-story')).toBe('')
    expect(getMovedPublishedSlug(page('a', {title: 'About Us'}), 'our-story')).toBe('')
  })

  it('uses a published routing slug', () => {
    const routed = page('a', {slug: {current: 'contact'}})
    expect(getMovedPublishedSlug(routed, 'contact-us')).toBe('contact')
  })
})

describe('getPlaceholder', () => {
  it('shows the fallback, home or not', () => {
    expect(getPlaceholder('About Us', false, 'Home')).toBe('About Us')
    expect(getPlaceholder('Acme Store', true, 'Home')).toBe('Acme Store')
  })

  it('uses the home placeholder only without a fallback', () => {
    expect(getPlaceholder('', true, 'Home')).toBe('Home')
    expect(getPlaceholder('', false, 'Home')).toBe('')
  })
})
