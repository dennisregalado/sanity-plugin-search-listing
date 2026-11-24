---
name: search-listing-functions
description: >
  Sanity Functions that persist the URL handle from sanity-plugin-search-listing: auto-slug
  saves the routing slug (`slug.current` by default) from `seo.url` (or the title), and
  auto-redirect writes a redirect when a published routing slug changes, plus the storefront
  redirect lookup. Use when setting up, debugging or migrating slug generation,
  URL handles or automatic redirects in a Sanity project.
---

# Search listing functions

The Studio only previews a slug. Two Sanity Functions make it real:

- **auto-slug** keeps the routing slug, `slug.current` by default (what the frontend routes on), equal to `seo.url.current` (what editors edit), and gives a published document with neither its title slug.
- **auto-redirect** writes a `redirect` document from the old path to the new one whenever a published routing slug changes.

Do `search-listing-setup` first. You need its inventory: routed types and their path prefixes.

## Files

The logic ships in `sanity-plugin-search-listing/functions`: `syncSlug`, `syncRedirects`, and the Blueprint events `autoSlugEvent(types, slug)` / `autoRedirectEvent(types, slug)`. A project's Functions are thin handlers around them. Copy from `references/` into the project, then edit the marked constants:

| Reference                 | Destination                                |
| ------------------------- | ------------------------------------------ |
| `auto-slug/index.ts`      | `functions/auto-slug/`                     |
| `auto-redirect/index.ts`  | `functions/auto-redirect/`                 |
| `blueprint.ts`            | merge into `sanity.blueprint.ts`           |
| `redirect-schema.ts`      | the schema, if there is no `redirect` type |
| `redirect-lookup.ts`      | the frontend's 404 handling                |

Edit:

1. `SLUG_TYPES` in the Blueprint: the routed types. Never Shopify types.
2. `ROUTE_PREFIXES` in `auto-redirect/index.ts`: the same types, each with its `pathPrefix`.
3. `SLUG` in the Blueprint and in `auto-slug/index.ts`: the Studio field's `slug` option, when it is not the default. Keep the two the same.

Each function needs its own `package.json` with `@sanity/client`, `@sanity/functions` and `sanity-plugin-search-listing`. Install each function's dependencies inside its folder: the Functions bundler uses the nearest `node_modules`, and without one it picks up the app's build config. Keep the Functions' plugin version in step with the Studio's.

Never reimplement `slugify`, the duplicate rules or the filters: the Studio preview runs the same code, so the saved slug is always the one the editor saw.

**Slug fields.** Pass the same `slug` option the Studio field uses (`source`, `current`, dot paths) to all three: `autoSlugEvent(types, slug)`, `autoRedirectEvent(types, slug)` and `syncSlug(client, event.data, slug)`. The defaults are `{source: ['title', 'name'], current: ['slug']}`. The first `current` path is the **routing slug**: auto-slug writes it (creating the object, and its parents, if missing) and auto-redirect watches it. Every `current` path counts as a slug the document already owns. Shopify types are never handled here (Sanity Connect writes `store.slug`).

**Duplicates.** The plugin's Duplicate action (registered after `structureTool()`) appends " Copy" to the title (once) and leaves out `seo.url` and `slug`, so the copy matches the `autoSlugEvent` filter (no handle, no slug) and gets its title slug when published: `homepage-copy`, then `homepage-copy-2`. A copy made another way that kept the original's handle is never invoked, and the Studio's uniqueness check blocks publishing it.

## Behaviour to preserve

These are deliberate. Keep them when adapting the code.

**auto-slug**

- The Blueprint filter describes a **state** (`seo.url.current` differs from the routing slug, or no handle and no slug set), not a change. Its own patch leaves the document in sync, so it does not loop. A document that drifts out of sync, for example when a stale draft is published, is repaired on its next publish.
- It runs on published documents only (the default). Drafts never get a slug written.
- A handle typed as `Our Story` is saved as `our-story`.
- A handle another document of the type already owns (as `seo.url`, `slug` or `store.slug`) is refused: nothing is written and an error is logged. The live URL stays put.
- A document with a slug (any `current` path) and no handle is left alone. This keeps legacy URLs.
- Duplicate titles get `base`, `base-2`, `base-3` in `_createdAt` order.
- If a draft is open, its routing slug is updated in the same transaction so publishing it does not restore the old slug. If the draft already has a handle, that handle is used.
- The client uses `perspective: 'raw'` so drafts reserve slugs too.

**auto-redirect**

- Only types in `ROUTE_PREFIXES`; redirects store full paths (`/blog/old`), never bare slugs.
- Moving `/a → /b` when `/x → /a` exists retargets `/x` to `/b`: no chains.
- Moving back to a path deletes the redirect away from it.
- Created redirects get a deterministic id (`redirect-blog-old`) so a retried event cannot duplicate. No dots in ids: they would be private in a public dataset.
- A document's first slug creates no redirect.

**Storefront lookup** (`redirect-lookup.ts`)

- Run it only after the router returned 404, so live pages beat stale redirects.
- Match the path with and without a trailing slash, keep the query string, and honour `permanent` (301, else 302).
- Read `source.current` / `destination.current`. Confirm with TypeGen that the query result is not typed `null`; that means it names fields the schema lacks.

## Test

The plugin's own suite covers `syncSlug`, `syncRedirects` and the events against an in-memory dataset. In the project, check that the Blueprint uses `autoSlugEvent` / `autoRedirectEvent` with the routed types, and that `ROUTE_PREFIXES` matches them. To test the whole flow, duplicate a document in the Studio, publish it, and read `npx sanity functions logs auto-slug`.

Sanity's local runner can execute auto-slug:

```bash
npx sanity functions test auto-slug --document-id <published-id> --with-user-token
```

It cannot evaluate `delta::changedAny`, so it skips auto-redirect; use `npx sanity functions dev` for that one.

## Deploy

```bash
npx sanity blueprints plan
npx sanity blueprints deploy
```

Before deploying to an existing dataset, run the "handles that differ from slugs" audit in `search-listing-setup/migrating.md`: those documents change URL on their next publish.
