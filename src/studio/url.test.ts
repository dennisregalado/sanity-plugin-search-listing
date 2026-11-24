import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  getPathSegments,
  getPricePreview,
  getUrlPreview,
  normalizeSiteUrl,
  parsePathname,
  resolveSiteUrlOption,
} from './utils'

describe('getPricePreview', () => {
  it('uses the currency’s normal format, not compact notation', () => {
    expect(getPricePreview(1299, 'USD')).toBe('$1,299.00')
    expect(getPricePreview(1234567.5, 'USD')).toBe('$1,234,567.50')
  })

  it('formats in the given locale', () => {
    expect(getPricePreview(1299, 'EUR', 'de-DE')).toBe('1.299,00 €')
    expect(getPricePreview(1299, 'JPY', 'ja-JP')).toBe('￥1,299')
  })

  it('reads numeric strings', () => {
    expect(getPricePreview('49.5', 'USD')).toBe('$49.50')
  })

  it('shows nothing for a missing, zero, negative or non-numeric amount', () => {
    for (const value of [undefined, null, 0, -5, '', '  ', 'abc', Number.NaN, Infinity]) {
      expect(getPricePreview(value, 'USD')).toBeUndefined()
    }
  })

  it('shows nothing for an unknown currency', () => {
    expect(getPricePreview(10, 'NOPE')).toBeUndefined()
  })

  it('falls back to en-US for a malformed locale', () => {
    expect(getPricePreview(10, 'USD', 'en_US!')).toBe('$10.00')
  })
})

describe('normalizeSiteUrl', () => {
  it('accepts absolute http(s) URLs with or without a trailing slash', () => {
    expect(normalizeSiteUrl('https://acme.com')).toBe('https://acme.com')
    expect(normalizeSiteUrl('https://acme.com/')).toBe('https://acme.com')
    expect(normalizeSiteUrl(' http://localhost:3000/ ')).toBe('http://localhost:3000')
  })

  it('keeps a base path and drops the query and hash', () => {
    expect(normalizeSiteUrl('https://acme.com/shop/')).toBe('https://acme.com/shop')
    expect(normalizeSiteUrl('https://acme.com/shop?x=1#top')).toBe('https://acme.com/shop')
  })

  it('rejects anything that is not an absolute http(s) URL', () => {
    for (const value of [
      undefined,
      null,
      42,
      '',
      'acme.com',
      '/about',
      'ftp://acme.com',
      'mailto:hi@acme.com',
      'data:text/plain,hi',
    ]) {
      expect(normalizeSiteUrl(value)).toBeUndefined()
    }
  })
})

describe('resolveSiteUrlOption', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the normalized URL without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(resolveSiteUrlOption('https://acme.com/', 'plugin')).toBe('https://acme.com')
    expect(warn).not.toHaveBeenCalled()
  })

  it('treats an unset option as unset, silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(resolveSiteUrlOption(undefined, 'plugin')).toBeUndefined()
    expect(resolveSiteUrlOption('', 'plugin')).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  it('ignores an invalid value and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(resolveSiteUrlOption('acme.com', 'field')).toBeUndefined()
    expect(resolveSiteUrlOption('acme.com', 'field')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('"acme.com"')
  })
})

describe('getUrlPreview', () => {
  it('joins the site URL, route and handle', () => {
    expect(getUrlPreview('about', '/pages', 'https://acme.com')).toBe(
      'https://acme.com/pages/about',
    )
    expect(getUrlPreview(undefined, '/', 'https://acme.com/shop')).toBe('https://acme.com/shop')
  })

  it('drops the host of a full URL used as a handle or prefix', () => {
    expect(getUrlPreview('https://other.com/a/b?x=1', '/', 'https://acme.com')).toBe(
      'https://acme.com/a/b',
    )
  })
})

describe('parsePathname', () => {
  it('reads the path of a path or a URL without depending on the window', () => {
    expect(parsePathname('/pages/about?x=1#y')).toBe('/pages/about')
    expect(parsePathname('about')).toBe('/about')
    expect(parsePathname('https://acme.com/products/tote')).toBe('/products/tote')
    expect(parsePathname('  ')).toBe('')
  })
})

describe('getPathSegments', () => {
  it('shows segments as typed, not percent-encoded', () => {
    expect(getPathSegments('/pages/Join Us!')).toEqual(['pages', 'Join Us!'])
    expect(getPathSegments('/pages/caf%C3%A9')).toEqual(['pages', 'café'])
  })

  it('keeps a segment that is not valid percent-encoding', () => {
    expect(getPathSegments('/pages/100%')).toEqual(['pages', '100%'])
  })
})
