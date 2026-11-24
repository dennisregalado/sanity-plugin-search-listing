/// <reference types="node" />

import {readdirSync, readFileSync} from 'node:fs'
import {join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

import {describe, expect, it} from 'vitest'

import resources from './resources'

const SRC = fileURLToPath(new URL('..', import.meta.url))

/** Every non-test source file under `src/`. */
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/**
 * Keys passed as string literals to `t('…')` and `getValidationMessage(context, '…')`, by file.
 * Keys are always literals, so a missing or unused key can be found by reading the source.
 */
function findUsedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>()
  const pattern = /\b(?:t|getValidationMessage)\(\s*(?:[\w.]+,\s*)?'([^']+)'/g

  for (const file of listSourceFiles(SRC)) {
    if (file.endsWith(join('i18n', 'resources.ts'))) continue
    for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
      const key = match[1]
      used.set(key, [...(used.get(key) ?? []), relative(SRC, file)])
    }
  }

  return used
}

describe('search-listing locale resources', () => {
  const used = findUsedKeys()
  const defined = Object.keys(resources)

  it('finds the keys used in the source', () => {
    expect(used.size).toBeGreaterThan(10)
  })

  it('defines every key the source uses', () => {
    const missing = [...used.keys()].filter((key) => !(key in resources))
    expect(missing).toEqual([])
  })

  it('has no unused keys', () => {
    const unused = defined.filter((key) => !used.has(key))
    expect(unused).toEqual([])
  })

  it('uses flat, dot-separated, kebab-case keys', () => {
    for (const key of defined) expect(key).toMatch(/^[a-z]+(-[a-z]+)*(\.[a-z]+(-[a-z]+)*)+$/)
  })
})
