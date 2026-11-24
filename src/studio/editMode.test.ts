import type {FormNodeValidation, FormPatch, ObjectMember} from 'sanity'
import {describe, expect, it} from 'vitest'

import {
  getFocusedMemberName,
  getHiddenProblems,
  getHighestLevel,
  getLevelTone,
  guardFallbackImagePatches,
  isFocusOnHiddenMember,
} from './editMode'

function field(name: string, title: string | undefined, validation: FormNodeValidation[]) {
  return {
    kind: 'field',
    name,
    field: {schemaType: {title}, validation},
  } as unknown as ObjectMember
}

/** A patch as the image input sends it (the `patchType` marker doesn't matter here). */
const patch = (value: {type: string; path: FormPatch['path']; value?: unknown}) =>
  value as unknown as FormPatch

const warning = (message: string) => ({level: 'warning', message, path: []}) as FormNodeValidation
const error = (message: string) => ({level: 'error', message, path: []}) as FormNodeValidation

describe('getHiddenProblems', () => {
  it('lists each member’s messages with its title, errors first', () => {
    const problems = getHiddenProblems([
      field('title', 'Page title', [warning('Too long')]),
      field('url', 'URL handle', [error('Already in use')]),
      field('description', undefined, []),
    ])
    expect(problems).toEqual([
      {title: 'URL handle', message: 'Already in use', level: 'error'},
      {title: 'Page title', message: 'Too long', level: 'warning'},
    ])
  })

  it('falls back to the member name and skips non-field members', () => {
    const problems = getHiddenProblems([
      field('description', undefined, [warning('Too long')]),
      {kind: 'error', key: 'x'} as unknown as ObjectMember,
    ])
    expect(problems).toEqual([{title: 'description', message: 'Too long', level: 'warning'}])
  })

  it('names members with getTitle, falling back to the schema title', () => {
    const problems = getHiddenProblems(
      [
        field('title', 'Page title', [warning('For lang')]),
        field('url', 'URL handle', [error('x')]),
      ],
      (name) => (name === 'title' ? 'Sidetittel' : undefined),
    )
    expect(problems.map((problem) => problem.title)).toEqual(['URL handle', 'Sidetittel'])
  })
})

describe('getHighestLevel and getLevelTone', () => {
  it('picks the most severe level and its tone', () => {
    const warn = {title: 'a', message: 'm', level: 'warning'} as const
    const err = {title: 'b', message: 'm', level: 'error'} as const
    const info = {title: 'c', message: 'm', level: 'info'} as const
    expect(getHighestLevel([])).toBeUndefined()
    expect(getHighestLevel([info, warn])).toBe('warning')
    expect(getHighestLevel([warn, err, info])).toBe('error')
    expect(getLevelTone('error')).toBe('critical')
    expect(getLevelTone('warning')).toBe('caution')
    expect(getLevelTone('info')).toBe('default')
    expect(getLevelTone(undefined)).toBe('default')
  })
})

describe('focus paths', () => {
  it('names the member a focus path points into', () => {
    expect(getFocusedMemberName(['url', 'current'])).toBe('url')
    expect(getFocusedMemberName([])).toBeUndefined()
    expect(getFocusedMemberName(undefined)).toBeUndefined()
    expect(getFocusedMemberName([{_key: 'a'}])).toBeUndefined()
  })

  it('treats every member but the image as hidden', () => {
    expect(isFocusOnHiddenMember(['title'])).toBe(true)
    expect(isFocusOnHiddenMember(['url', 'current'])).toBe(true)
    expect(isFocusOnHiddenMember(['image'])).toBe(false)
    expect(isFocusOnHiddenMember(['image', 'asset'])).toBe(false)
    expect(isFocusOnHiddenMember([])).toBe(false)
  })
})

describe('guardFallbackImagePatches', () => {
  const asset = {_type: 'reference', _ref: 'image-abc-10x10-png'}

  it('drops Clear field', () => {
    expect(guardFallbackImagePatches([patch({type: 'unset', path: []})])).toEqual([])
  })

  it('drops hotspot and crop edits without an asset', () => {
    const patches: FormPatch[] = [
      patch({type: 'setIfMissing', path: [], value: {_type: 'image'}}),
      patch({type: 'set', path: ['hotspot'], value: {x: 0.5, y: 0.5, width: 1, height: 1}}),
      patch({type: 'set', path: ['crop'], value: {top: 0, bottom: 0, left: 0, right: 0}}),
    ]
    expect(guardFallbackImagePatches(patches)).toEqual([])
  })

  it('drops upload progress', () => {
    expect(
      guardFallbackImagePatches([patch({type: 'set', path: ['_upload'], value: {progress: 2}})]),
    ).toEqual([])
    expect(guardFallbackImagePatches([patch({type: 'unset', path: ['_upload']})])).toEqual([])
  })

  it('lets Select through whole', () => {
    const patches: FormPatch[] = [
      patch({type: 'setIfMissing', path: [], value: {_type: 'image'}}),
      patch({type: 'unset', path: ['hotspot']}),
      patch({type: 'unset', path: ['crop']}),
      patch({type: 'set', path: ['asset'], value: asset}),
    ]
    expect(guardFallbackImagePatches(patches)).toEqual(patches)
  })

  it('lets a finished upload through without its progress', () => {
    const setAsset: FormPatch = patch({type: 'set', path: ['asset'], value: asset})
    const patches: FormPatch[] = [
      setAsset,
      patch({type: 'set', path: ['_upload', 'progress'], value: 100}),
      patch({type: 'set', path: ['_upload', 'updatedAt'], value: '2026-01-01T00:00:00Z'}),
    ]
    expect(guardFallbackImagePatches(patches)).toEqual([setAsset])
  })

  it('accepts a whole image value with an asset', () => {
    const patches: FormPatch[] = [patch({type: 'set', path: [], value: {_type: 'image', asset}})]
    expect(guardFallbackImagePatches(patches)).toEqual(patches)
    expect(
      guardFallbackImagePatches([patch({type: 'set', path: [], value: {_type: 'image'}})]),
    ).toEqual([])
  })
})
