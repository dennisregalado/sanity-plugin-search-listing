import {evaluate, parse} from 'groq-js'
import {beforeEach, describe, expect, test} from 'vitest'

import {omitUrlHandle, prepareDuplicate} from './duplicate'
import {
  autoRedirectEvent,
  autoSlugEvent,
  type FunctionClient,
  getRedirectPaths,
  planRedirectChanges,
  syncRedirects,
  syncSlug,
} from './functions'

/**
 * Runs the handlers against an in-memory dataset: `fetch` evaluates their GROQ, and
 * transactions are applied to the documents so the next query sees them.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose in-memory documents
type Doc = Record<string, any>
let dataset: Doc[] = []

const find = (id: string) => dataset.find((doc) => doc._id === id)

function setPath(doc: Doc, path: string, value: unknown, onlyIfMissing: boolean) {
  const keys = path.split('.')
  const last = keys.pop()!
  let target = doc
  for (const key of keys) {
    target[key] ??= {}
    target = target[key]
  }
  if (!onlyIfMissing || target[last] === undefined) target[last] = value
}

function patchBuilder(doc: Doc) {
  const builder = {
    setIfMissing(values: Doc) {
      for (const [path, value] of Object.entries(values)) setPath(doc, path, value, true)
      return builder
    },
    set(values: Doc) {
      for (const [path, value] of Object.entries(values)) setPath(doc, path, value, false)
      return builder
    },
  }
  return builder
}

const client: FunctionClient = {
  async fetch(query, params = {}) {
    return (await evaluate(parse(query, {params}), {dataset, params})).get()
  },
  transaction() {
    const operations: Array<() => void> = []
    const transaction = {
      patch(id: string, build: (patch: ReturnType<typeof patchBuilder>) => unknown) {
        operations.push(() => {
          const doc = find(id)
          if (!doc) throw new Error(`Cannot patch missing document ${id}`)
          build(patchBuilder(doc))
        })
        return transaction
      },
      delete(id: string) {
        operations.push(() => {
          dataset = dataset.filter((doc) => doc._id !== id)
        })
        return transaction
      },
      createIfNotExists(doc: Doc) {
        operations.push(() => {
          if (!find(doc._id)) dataset.push(structuredClone(doc))
        })
        return transaction
      },
      async commit() {
        for (const operation of operations) operation()
      },
    }
    return transaction as unknown as ReturnType<FunctionClient['transaction']>
  },
}

const autoSlug = autoSlugEvent(['page', 'policy', 'maker'])

/** Whether the Blueprint filter would invoke the function for this document. */
async function matchesFilter(doc: Doc) {
  const value = await evaluate(parse(`*[${autoSlug.filter}]`), {dataset: [doc]})
  return (await value.get()).length === 1
}

/** Publish `doc` the way the platform does: invoke the function only if the filter matches. */
async function run(id: string) {
  const doc = find(id)!
  if (!(await matchesFilter(doc))) return false
  const projected = await evaluate(parse(`*[_id == $id][0]${autoSlug.projection}`), {
    dataset,
    params: {id},
  })
  await syncSlug(client, await projected.get())
  return true
}

const slugs = (id: string) => ({slug: find(id)?.slug?.current, url: find(id)?.seo?.url?.current})

beforeEach(() => {
  dataset = []
})

describe('autoSlugEvent', () => {
  test('lists the types and rejects anything that is not a type name', () => {
    expect(autoSlug.filter).toMatch(/^_type in \['page', 'policy', 'maker'\] && /)
    expect(() => autoSlugEvent([])).toThrow()
    expect(() => autoSlugEvent(["page'] || true || ['"])).toThrow()
  })

  test('takes the fields a slug comes from, and validates them', () => {
    const event = autoSlugEvent(['article'], {source: ['headline', 'title']})
    expect(event.filter).toContain('defined(coalesce(headline, title))')
    expect(event.projection).toContain('headline, title, slug{current}')
    expect(() => autoSlugEvent(['article'], {source: ['title) || true || (x']})).toThrow()
  })

  test('ignores Shopify documents and types without a route', async () => {
    expect(await matchesFilter({_id: 'p', _type: 'product', title: 'Chair'})).toBe(false)
    expect(await matchesFilter({_id: 's', _type: 'showroom', title: 'LA'})).toBe(false)
  })
})

describe('syncSlug', () => {
  test('gives a newly published page its title slug, once', async () => {
    dataset.push({_id: 'a', _type: 'page', _createdAt: '2026-01-01', title: 'About Us'})

    expect(await run('a')).toBe(true)
    expect(slugs('a')).toEqual({slug: 'about-us', url: 'about-us'})
    // Its own patch leaves the document in sync, so it is not invoked again.
    expect(await run('a')).toBe(false)
  })

  test('derives a slug from `name` when there is no title', async () => {
    dataset.push({_id: 'm', _type: 'maker', _createdAt: '2026-01-01', name: 'Atelier Été'})

    await run('m')
    expect(slugs('m')).toEqual({slug: 'atelier-ete', url: 'atelier-ete'})
  })

  test('same-title documents are numbered in creation order', async () => {
    dataset.push(
      {_id: 'a', _type: 'policy', _createdAt: '2026-01-01', title: 'Returns'},
      {_id: 'b', _type: 'policy', _createdAt: '2026-01-02', title: 'Returns'},
    )

    await run('b')
    await run('a')
    expect(slugs('a').slug).toBe('returns')
    expect(slugs('b').slug).toBe('returns-2')
  })

  test('a changed URL handle becomes the routing slug', async () => {
    dataset.push({
      _id: 'a',
      _type: 'page',
      _createdAt: '2026-01-01',
      title: 'About',
      slug: {_type: 'slug', current: 'about'},
      seo: {url: {_type: 'slug', current: 'our-story'}},
    })

    expect(await run('a')).toBe(true)
    expect(slugs('a')).toEqual({slug: 'our-story', url: 'our-story'})
  })

  test('normalizes a handle typed with spaces and capitals', async () => {
    dataset.push({
      _id: 'a',
      _type: 'page',
      _createdAt: '2026-01-01',
      title: 'About',
      seo: {url: {_type: 'slug', current: 'Our Story'}},
    })

    await run('a')
    expect(slugs('a')).toEqual({slug: 'our-story', url: 'our-story'})
  })

  test('leaves a legacy slug with no URL handle alone', async () => {
    dataset.push({
      _id: 'a',
      _type: 'page',
      _createdAt: '2026-01-01',
      title: 'About',
      slug: {_type: 'slug', current: 'legacy-slug'},
    })

    expect(await run('a')).toBe(false)
  })

  test('does not take a handle another document routes on', async () => {
    dataset.push(
      {_id: 'a', _type: 'page', _createdAt: '2026-01-01', slug: {current: 'contact'}},
      {
        _id: 'b',
        _type: 'page',
        _createdAt: '2026-01-02',
        slug: {current: 'reach-us'},
        seo: {url: {current: 'contact'}},
      },
    )

    await run('b')
    expect(slugs('b').slug).toBe('reach-us')
  })

  test('repairs a publish that restored the old slug from a stale draft', async () => {
    dataset.push({
      _id: 'a',
      _type: 'page',
      _createdAt: '2026-01-01',
      title: 'About',
      slug: {_type: 'slug', current: 'old'},
      seo: {url: {_type: 'slug', current: 'new'}},
    })

    expect(await run('a')).toBe(true)
    expect(slugs('a').slug).toBe('new')
  })

  test('updates an open draft, adopting a handle the editor has already typed there', async () => {
    dataset.push(
      {_id: 'a', _type: 'page', _createdAt: '2026-01-01', title: 'About'},
      {_id: 'drafts.a', _type: 'page', _createdAt: '2026-01-01', title: 'About'},
      {_id: 'b', _type: 'page', _createdAt: '2026-01-02', title: 'Team'},
      {
        _id: 'drafts.b',
        _type: 'page',
        _createdAt: '2026-01-02',
        title: 'Team',
        seo: {url: {_type: 'slug', current: 'people'}},
      },
    )

    await run('a')
    await run('b')
    expect(slugs('drafts.a')).toEqual({slug: 'about', url: 'about'})
    expect(slugs('b')).toEqual({slug: 'people', url: 'people'})
    expect(slugs('drafts.b')).toEqual({slug: 'people', url: 'people'})
  })
})

describe('duplicating a document', () => {
  const original = {
    _id: 'orig',
    _type: 'page',
    _createdAt: '2026-01-01',
    title: 'Homepage',
    slug: {_type: 'slug', current: 'homepage'},
    seo: {title: 'Kept', url: {_type: 'slug', current: 'homepage'}},
  }

  /** Duplicate `id` the way the plugin's Duplicate action does, then publish the copy. */
  async function duplicate(id: string, copyId: string, createdAt: string) {
    dataset.push({
      ...prepareDuplicate(structuredClone(find(id)!)),
      _id: copyId,
      _createdAt: createdAt,
    })
    expect(await run(copyId)).toBe(true)
    return {title: find(copyId)!.title, ...slugs(copyId)}
  }

  test('omitUrlHandle leaves out only the URL handle and routing slug', () => {
    expect(omitUrlHandle(original)).toEqual({
      _id: 'orig',
      _type: 'page',
      _createdAt: '2026-01-01',
      title: 'Homepage',
      seo: {title: 'Kept'},
    })
    expect(
      omitUrlHandle(
        {title: 'No seo', listing: {url: 'x', title: 'y'}},
        {seoFields: ['listing'], omit: []},
      ),
    ).toEqual({title: 'No seo', listing: {title: 'y'}})
  })

  test('prepareDuplicate appends " Copy" once, to the title or else the name', () => {
    expect(prepareDuplicate(original).title).toBe('Homepage Copy')
    expect(prepareDuplicate({...original, title: 'Homepage Copy'}).title).toBe('Homepage Copy')
    expect(prepareDuplicate({...original, title: 'Homepage copy '}).title).toBe('Homepage copy ')
    expect(prepareDuplicate({_type: 'maker', name: 'Atelier Été'}).name).toBe('Atelier Été Copy')
    expect(prepareDuplicate(original, {titleSuffix: false}).title).toBe('Homepage')
    expect(prepareDuplicate(original, {titleSuffix: ' (copy)'}).title).toBe('Homepage (copy)')
    expect(prepareDuplicate({_type: 'page', title: ''}).title).toBe('')
  })

  test('copies read "Homepage Copy" and take homepage-copy, -2, -3; the original keeps its URL', async () => {
    dataset.push(structuredClone(original))

    expect(await duplicate('orig', 'dup1', '2026-02-01')).toEqual({
      title: 'Homepage Copy',
      slug: 'homepage-copy',
      url: 'homepage-copy',
    })
    // Duplicating the original again, then duplicating a copy.
    expect(await duplicate('orig', 'dup2', '2026-03-01')).toMatchObject({
      title: 'Homepage Copy',
      slug: 'homepage-copy-2',
    })
    expect(await duplicate('dup1', 'dup3', '2026-04-01')).toMatchObject({
      title: 'Homepage Copy',
      slug: 'homepage-copy-3',
    })
    expect(slugs('orig')).toEqual({slug: 'homepage', url: 'homepage'})
    expect(await run('orig')).toBe(false)
  })

  test('the URL follows the title, not the original handle', async () => {
    dataset.push({
      ...structuredClone(original),
      title: 'Rich text template',
      slug: {_type: 'slug', current: 'rich-text-page'},
      seo: {url: {_type: 'slug', current: 'rich-text-page'}},
    })

    expect(await duplicate('orig', 'dup', '2026-02-01')).toMatchObject({
      title: 'Rich text template Copy',
      slug: 'rich-text-template-copy',
    })
  })

  test('a copy that kept the original URL is never invoked, which is why the Studio strips it', async () => {
    dataset.push(structuredClone(original), {...structuredClone(original), _id: 'raw'})
    expect(await run('raw')).toBe(false)
  })
})

describe('auto-redirect', () => {
  const routes = {page: '/pages/', post: '/blog/'}

  test('autoRedirectEvent fires only when a routed slug changes', () => {
    expect(autoRedirectEvent(['page']).filter).toBe(
      "_type in ['page'] && delta::changedAny(slug.current)",
    )
  })

  test('getRedirectPaths prefixes both slugs with the type route', () => {
    expect(getRedirectPaths(routes, 'page', 'about', 'about-us')).toEqual({
      source: '/pages/about',
      destination: '/pages/about-us',
    })
    expect(getRedirectPaths(routes, 'post', 'a', 'b')?.destination).toBe('/blog/b')
    expect(getRedirectPaths(routes, 'product', 'a', 'b')).toBeNull()
    expect(getRedirectPaths(routes, 'page', undefined, 'b')).toBeNull()
    expect(getRedirectPaths(routes, 'page', 'a', 'a')).toBeNull()
  })

  test('planRedirectChanges retargets instead of chaining and drops a redirect when moving back', () => {
    expect(planRedirectChanges('/pages/a', '/pages/b', [])).toEqual([
      {action: 'create', source: '/pages/a', destination: '/pages/b'},
    ])
    expect(
      planRedirectChanges('/pages/b', '/pages/c', [
        {_id: 'r1', source: '/pages/a', destination: '/pages/b'},
      ]),
    ).toEqual([
      {action: 'retarget', id: 'r1', destination: '/pages/c'},
      {action: 'create', source: '/pages/b', destination: '/pages/c'},
    ])
    expect(
      planRedirectChanges('/pages/b', '/pages/a', [
        {_id: 'r1', source: '/pages/a', destination: '/pages/b'},
      ]),
    ).toEqual([
      {action: 'delete', id: 'r1'},
      {action: 'create', source: '/pages/b', destination: '/pages/a'},
    ])
    expect(
      planRedirectChanges('/pages/a', '/pages/b', [
        {_id: 'same', source: '/pages/a', destination: '/pages/b'},
      ]),
    ).toEqual([])
  })

  test('syncRedirects writes one redirect per path and retargets earlier ones', async () => {
    await syncRedirects(client, routes, {_type: 'page', beforeSlug: 'a', slug: 'b'})
    await syncRedirects(client, routes, {_type: 'page', beforeSlug: 'b', slug: 'c'})
    // A retried event changes nothing.
    await syncRedirects(client, routes, {_type: 'page', beforeSlug: 'b', slug: 'c'})

    const redirects = dataset
      .filter((doc) => doc._type === 'redirect')
      .map((doc) => [doc._id, doc.source.current, doc.destination.current])
      .sort()
    expect(redirects).toEqual([
      ['redirect-pages-a', '/pages/a', '/pages/c'],
      ['redirect-pages-b', '/pages/b', '/pages/c'],
    ])
  })
})

describe('custom slug fields', () => {
  const options = {source: ['headline'], current: ['route.slug', 'legacySlug']}
  const event = autoSlugEvent(['article'], options)

  async function runCustom(id: string) {
    const doc = find(id)!
    const matches = await evaluate(parse(`*[${event.filter}]`), {dataset: [doc]})
    if ((await matches.get()).length !== 1) return false
    const projected = await evaluate(parse(`*[_id == $id][0]${event.projection}`), {
      dataset,
      params: {id},
    })
    await syncSlug(client, await projected.get(), options)
    return true
  }

  test('the events read the first `current` path, and validate every path', () => {
    expect(event.filter).toContain('seo.url.current != route.slug.current')
    expect(event.filter).toContain('!defined(route.slug.current) && !defined(legacySlug.current)')
    expect(event.projection).toBe(
      '{_id, _createdAt, _type, headline, route{slug{current}}, legacySlug{current}, seo{url{current}}}',
    )
    const redirect = autoRedirectEvent(['article'], {current: ['route.slug']})
    expect(redirect.filter).toContain('delta::changedAny(route.slug.current)')
    expect(redirect.projection).toContain("'beforeSlug': before().route.slug.current")
    expect(() => autoSlugEvent(['article'], {current: ['slug) || true || (x']})).toThrow()
    expect(() => autoRedirectEvent(['article'], {current: ['a b']})).toThrow()
  })

  test('the defaults are unchanged', () => {
    expect(autoSlugEvent(['page']).projection).toBe(
      '{_id, _createdAt, _type, title, name, slug{current}, seo{url{current}}}',
    )
    expect(autoRedirectEvent(['page']).filter).toBe(
      "_type in ['page'] && delta::changedAny(slug.current)",
    )
  })

  test('writes the routing slug at its path, creating its parents', async () => {
    dataset.push(
      {_id: 'a', _type: 'article', _createdAt: '2026-01-01', headline: 'Launch Day'},
      {_id: 'drafts.a', _type: 'article', _createdAt: '2026-01-01', headline: 'Launch Day'},
      {
        _id: 'b',
        _type: 'article',
        _createdAt: '2026-01-02',
        headline: 'Launch Day',
      },
    )

    expect(await runCustom('a')).toBe(true)
    expect(find('a')?.route?.slug).toEqual({_type: 'slug', current: 'launch-day'})
    expect(find('a')?.slug).toBeUndefined()
    expect(find('drafts.a')?.route?.slug?.current).toBe('launch-day')
    expect(await runCustom('a')).toBe(false)

    expect(await runCustom('b')).toBe(true)
    expect(find('b')?.route?.slug?.current).toBe('launch-day-2')
  })

  test('syncs a handle to the routing slug and refuses one another path owns', async () => {
    dataset.push(
      {
        _id: 'a',
        _type: 'article',
        headline: 'A',
        route: {slug: {current: 'a'}},
        seo: {url: {current: 'news'}},
      },
      {_id: 'b', _type: 'article', headline: 'B', legacySlug: {current: 'taken'}},
      {_id: 'c', _type: 'article', headline: 'C', seo: {url: {current: 'taken'}}},
    )

    await runCustom('a')
    expect(find('a')?.route?.slug?.current).toBe('news')

    // `b` routes on its legacy slug and has no handle: left alone, never invoked.
    expect(await runCustom('b')).toBe(false)

    await runCustom('c')
    expect(find('c')?.route?.slug).toBeUndefined()
  })
})
