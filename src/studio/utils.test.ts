import {describe, expect, test} from 'vitest'

import {
  clipText,
  getFallbackImageValue,
  getFieldText,
  getImageOnlyValue,
  hasImage,
  setPathValue,
} from './utils'

describe('clipText', () => {
  test('leaves text that fits alone', () => {
    expect(clipText('Short title', 20)).toBe('Short title')
    expect(clipText('Exactly ten', 11)).toBe('Exactly ten')
  })

  test('cuts at a word and appends the ellipsis within the limit', () => {
    const clipped = clipText('The quick brown fox jumps over the lazy dog', 20)
    expect(clipped).toBe('The quick brown…')
    expect(clipped.length).toBeLessThanOrEqual(20)
  })

  test('cuts mid-word when the last space is too early', () => {
    expect(clipText('A supercalifragilistic word', 12)).toBe('A supercali…')
  })

  test('takes another ellipsis, and survives a limit smaller than it', () => {
    expect(clipText('one two three four', 12, ' ...')).toBe('one two ...')
    expect(clipText('Anything', 0)).toBe('…')
  })
})

describe('getFieldText', () => {
  test('strips HTML and collapses whitespace', () => {
    expect(getFieldText('<p>Hello <strong>world</strong></p>\n\n<p>again</p>')).toBe(
      'Hello world again',
    )
    expect(getFieldText('  plain   text ')).toBe('plain text')
  })

  test('joins Portable Text blocks, skipping non-text blocks and spans', () => {
    expect(
      getFieldText([
        {_type: 'block', children: [{text: 'First '}, {text: 'block'}]},
        {_type: 'image', asset: {_ref: 'image-a-1x1-png'}},
        {_type: 'block', children: [{text: 'Second'}, {_type: 'inline'}, {text: 1}]},
        {_type: 'block', children: 'not an array'},
        null,
      ]),
    ).toBe('First block\n\nSecond')
  })

  test('is empty for anything else', () => {
    expect(getFieldText(undefined)).toBe('')
    expect(getFieldText(42)).toBe('')
    expect(getFieldText({text: 'object'})).toBe('')
  })
})

describe('setPathValue', () => {
  test('returns a copy with the value at a dot path, creating objects on the way', () => {
    const target = {title: 'Old', store: {slug: {current: 'a'}, price: 1}}
    const next = setPathValue(target, 'store.slug.current', 'b')

    expect(next).toEqual({title: 'Old', store: {slug: {current: 'b'}, price: 1}})
    expect(target.store.slug.current).toBe('a')
    expect(setPathValue({}, 'a.b.c', 1)).toEqual({a: {b: {c: 1}}})
    expect(setPathValue({a: 'scalar'}, 'a.b', 1)).toEqual({a: {b: 1}})
    expect(setPathValue({a: 1}, 'b', 2)).toEqual({a: 1, b: 2})
  })
})

describe('hasImage', () => {
  test('is true only for an image with an asset', () => {
    expect(hasImage({image: {_type: 'image', asset: {_ref: 'image-a-1x1-png'}}})).toBe(true)
    expect(hasImage({image: {_type: 'image'}})).toBe(false)
    expect(hasImage({image: {asset: null}})).toBe(false)
    expect(hasImage({image: 'https://example.com/a.png'})).toBe(false)
    expect(hasImage({})).toBe(false)
    expect(hasImage(undefined)).toBe(false)
  })
})

describe('getFallbackImageValue', () => {
  test('turns an image object into a stand-in image value, keeping crop and hotspot', () => {
    const crop = {top: 0, bottom: 0, left: 0.1, right: 0}
    const hotspot = {x: 0.5, y: 0.5, width: 1, height: 1}
    expect(
      getFallbackImageValue({
        _type: 'image',
        asset: {_ref: 'image-abc-10x10-png'},
        crop,
        hotspot,
        alt: 'dropped',
      }),
    ).toEqual({
      _type: 'image',
      asset: {_type: 'reference', _ref: 'image-abc-10x10-png'},
      crop,
      hotspot,
    })
  })

  test('takes an image asset document, by `_id`', () => {
    expect(getFallbackImageValue({_id: 'image-abc-10x10-png', url: 'https://cdn'})).toEqual({
      _type: 'image',
      asset: {_type: 'reference', _ref: 'image-abc-10x10-png'},
    })
  })

  test('is undefined for URLs, files and anything else', () => {
    expect(getFallbackImageValue('https://example.com/a.png')).toBeUndefined()
    expect(getFallbackImageValue({asset: {_ref: 'file-abc-pdf'}})).toBeUndefined()
    expect(getFallbackImageValue({url: 'https://example.com/a.png'})).toBeUndefined()
    expect(getFallbackImageValue(null)).toBeUndefined()
  })
})

describe('getImageOnlyValue', () => {
  test('keeps only the image', () => {
    expect(getImageOnlyValue({image: {asset: {_ref: 'x'}}, title: 'T'})).toEqual({
      image: {asset: {_ref: 'x'}},
    })
    expect(getImageOnlyValue({image: undefined})).toEqual({image: undefined})
    expect(getImageOnlyValue({title: 'T'})).toBeUndefined()
    expect(getImageOnlyValue(undefined)).toBeUndefined()
  })
})
