/**
 * A mocked Content Lake and project API for the workbench Studio, installed on a Playwright
 * page with `installMockApi(page)`. Queries are evaluated with groq-js against `fixtures.mjs`,
 * so the plugin's live queries (fallbacks, slug checks, uniqueness) return real results.
 */
import {evaluate, parse} from 'groq-js'

import {documents as fixtures} from './fixtures.mjs'

const USER = {
  id: 'p-dev',
  name: 'Dev Editor',
  email: 'dev@example.com',
  profileImage: null,
  role: 'administrator',
  roles: [{name: 'administrator', title: 'Administrator'}],
}

const ACL = [
  {
    filter: '_id in path("**")',
    permissions: ['read', 'update', 'create', 'history', 'editHistory', 'manage'],
  },
]

function svgImage(label, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="600" y="335" font-family="sans-serif" font-size="64" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>
</svg>`
}

function applyPerspective(docs, perspective) {
  if (perspective === 'raw') return docs
  const published = docs.filter(
    (doc) => !doc._id.startsWith('drafts.') && !doc._id.startsWith('versions.'),
  )
  if (perspective !== 'drafts' && perspective !== 'previewDrafts') return published
  const byId = new Map(published.map((doc) => [doc._id, doc]))
  for (const doc of docs) {
    if (!doc._id.startsWith('drafts.')) continue
    const id = doc._id.slice('drafts.'.length)
    byId.set(id, {...doc, _id: id, _originalId: doc._id})
  }
  return [...byId.values()]
}

async function runQuery(store, query, params, perspective) {
  // groq-js has no text::query (the Studio's list search): match everything.
  const supported = query.replace(/\[@, _id\] match text::query\(\$__query\)/g, 'true')
  const tree = parse(supported, {params})
  const result = await evaluate(tree, {dataset: applyPerspective(store, perspective), params})
  return result.get()
}

function parseParams(url) {
  const params = {}
  for (const [key, value] of url.searchParams) {
    if (!key.startsWith('$')) continue
    try {
      params[key.slice(1)] = JSON.parse(value)
    } catch {
      params[key.slice(1)] = value
    }
  }
  return params
}

/** Install the mocked API on `page`. Returns the in-memory dataset. */
export async function installMockApi(page, {documents = fixtures} = {}) {
  const store = structuredClone(documents)

  // Listeners: the client reads server-sent events through `fetch`. Answer them in the page
  // with a stream that says "welcome" and stays open, so the Studio stays connected.
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url
      if (!String(url).includes('/data/listen/')) return nativeFetch(input, init)
      const encoder = new TextEncoder()
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('event: welcome\ndata: {"listenerName":"workbench"}\n\n'),
          )
          init?.signal?.addEventListener('abort', () => {
            try {
              controller.close()
            } catch {
              // Already closed.
            }
          })
        },
      })
      return Promise.resolve(
        new Response(body, {status: 200, headers: {'content-type': 'text/event-stream'}}),
      )
    }
  })

  await page.route(/^https:\/\/cdn\.sanity\.io\//, (route) =>
    route.fulfill({contentType: 'image/svg+xml', body: svgImage('Settings image', '#4f46e5')}),
  )
  await page.route(/^https:\/\/cdn\.shopify\.com\//, (route) =>
    route.fulfill({contentType: 'image/svg+xml', body: svgImage('Shopify image', '#059669')}),
  )
  // Version checks, telemetry, the Studio bridge: not needed offline.
  await page.route(/^https:\/\/(core\.)?sanity-cdn\.com\//, (route) =>
    route.fulfill({contentType: 'application/javascript', body: ''}),
  )
  await page.route(/^https:\/\/api\.sanity\.io\//, (route) => route.fulfill({json: {}}))

  await page.route(/^https:\/\/mock1234\.api(cdn)?\.sanity\.io\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/v[^/]+/, '')

    if (path.startsWith('/users/me/keyvalue/')) {
      const keys = decodeURIComponent(path.slice('/users/me/keyvalue/'.length)).split(',')
      return route.fulfill({json: keys.map((key) => ({key, value: null}))})
    }
    if (path === '/users/me') return route.fulfill({json: USER})
    if (path.startsWith('/users/')) return route.fulfill({json: [USER]})
    if (path.endsWith('/acl')) return route.fulfill({json: ACL})
    if (path.endsWith('/grants')) return route.fulfill({json: {}})
    if (path === '/features') return route.fulfill({json: []})
    if (path.startsWith('/projects/mock1234/datasets')) return route.fulfill({json: []})
    if (path.startsWith('/projects/mock1234/user-applications')) return route.fulfill({json: []})
    if (path === '/projects/mock1234') {
      return route.fulfill({
        json: {
          id: 'mock1234',
          displayName: 'Workbench',
          organizationId: null,
          members: [],
          features: [],
        },
      })
    }
    if (path.startsWith('/journey/') || path.startsWith('/schedules/') || path === '/help') {
      return route.fulfill({json: {}})
    }
    if (path === '/ping') return route.fulfill({json: {}})

    if (path.startsWith('/data/listen/')) {
      return route.fulfill({
        status: 200,
        headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache'},
        body: 'retry: 600000\nevent: welcome\ndata: {"listenerName":"workbench"}\n\n',
      })
    }

    if (path.startsWith('/data/doc/')) {
      const ids = decodeURIComponent(path.split('/').pop()).split(',')
      const found = store.filter((doc) => ids.includes(doc._id))
      return route.fulfill({
        json: {
          documents: found,
          omitted: ids
            .filter((id) => !found.some((doc) => doc._id === id))
            .map((id) => ({id, reason: 'existence'})),
        },
      })
    }

    if (path.startsWith('/data/query/')) {
      let query = url.searchParams.get('query')
      let params = parseParams(url)
      let perspective = url.searchParams.get('perspective') || 'raw'
      if (request.method() === 'POST') {
        const body = request.postDataJSON() || {}
        query = body.query ?? query
        params = body.params ?? params
        perspective = body.perspective ?? perspective
      }
      try {
        const result = await runQuery(store, query, params, perspective)
        return route.fulfill({json: {ms: 1, query, result: result ?? null}})
      } catch (error) {
        if (process.env.MOCK_DEBUG) console.error(`[mock] ${error}\n  ${query}`)
        return route.fulfill({status: 400, json: {error: {description: String(error)}}})
      }
    }

    if (path.startsWith('/data/mutate/')) {
      return route.fulfill({json: {transactionId: `tx-${Date.now()}`, results: []}})
    }

    if (path.startsWith('/data/history/')) return route.fulfill({json: {documents: []}})

    return route.fulfill({json: {}})
  })

  return store
}
