# Workbench

A real Sanity Studio with the plugin from `src/`, running against a mocked Content Lake, for
seeing and screenshotting UI changes without a Sanity project or login.

```sh
npm run dev:studio      # http://127.0.0.1:3333 (leave running)
npm run screenshot      # every scenario, into dev/screenshots/
npm run screenshot -- product-preview page-editing --dark --out=/some/dir
```

- `studio/` – the Studio config and schema (page, product with the Shopify preset, settings
  with `home: true`).
- `fixtures.mjs` – the dataset. GROQ queries are evaluated with `groq-js`, so fallbacks, slug
  lookups and uniqueness checks return real results.
- `mock-api.mjs` – the mocked project API, Content Lake and image CDNs, installed on a
  Playwright page. Mutations are accepted but not stored; typed values still show, since the
  Studio applies edits locally.
- `scenarios.mjs` – what to capture. Add a scenario for every visual change and capture it
  before and after.

`--full` captures the whole window instead of the `seo` field. Opening the Studio in a plain
browser does not work: it only has data under Playwright, where the API is mocked.

Known mock limits: list search (`text::query`) matches everything, nothing is saved (edits stay
in the form), uploads are not mocked, and listeners only send `welcome`. The Sanity version
check logs a console error; ignore it.
