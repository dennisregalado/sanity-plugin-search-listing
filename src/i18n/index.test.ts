import {describe, expect, it, vi} from 'vitest'

import {getValidationMessage, searchListingLocaleNamespace} from '.'

describe('getValidationMessage', () => {
  it('translates through the validation context’s i18n, loading the namespace first', async () => {
    const loadNamespaces = vi.fn(async () => undefined)
    const t = vi.fn(() => 'Lengre titler kan bli forkortet av søkemotorer')
    const message = await getValidationMessage(
      {i18n: {loadNamespaces, t}},
      'validation.title-too-long',
    )
    expect(message).toBe('Lengre titler kan bli forkortet av søkemotorer')
    expect(loadNamespaces).toHaveBeenCalledWith([searchListingLocaleNamespace])
    expect(t).toHaveBeenCalledWith('validation.title-too-long', {ns: searchListingLocaleNamespace})
  })

  it('falls back to English without i18n', async () => {
    expect(await getValidationMessage({}, 'validation.url-handle-invalid')).toBe(
      'Use lowercase letters, numbers and hyphens only',
    )
  })

  it('falls back to English when i18n has no search-listing strings (it returns the key)', async () => {
    const i18n = {loadNamespaces: async () => undefined, t: (key: string) => key}
    expect(await getValidationMessage({i18n}, 'validation.description-too-long')).toBe(
      'Longer descriptions may be truncated by search engines',
    )
  })

  it('falls back to English when i18n throws', async () => {
    const i18n = {
      t: () => {
        throw new Error('not ready')
      },
    }
    expect(await getValidationMessage({i18n}, 'validation.title-too-long')).toBe(
      'Longer titles may be truncated by search engines',
    )
  })
})
