#!/usr/bin/env node
/**
 * Screenshots of the `seo` field in the workbench Studio, against the mocked API.
 *
 *   npm run dev:studio            # in another terminal (http://127.0.0.1:3333)
 *   npm run screenshot -- [scenario ...] [--out=dir] [--dark] [--full]
 *
 * With no scenario names, every scenario runs. Images are written to `--out` (default
 * `dev/screenshots`, git-ignored) as `<scenario>[-dark].png`.
 */
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'

import {installMockApi} from './mock-api.mjs'
import {scenarios} from './scenarios.mjs'

// The environment's global Playwright (CommonJS `require` honours NODE_PATH), else a local one.
const {chromium} = createRequire(import.meta.url)('playwright')

const STUDIO = process.env.STUDIO_URL || 'http://127.0.0.1:3333'
const args = process.argv.slice(2)
const flag = (name) => args.find((arg) => arg.startsWith(`--${name}`))
const outDir = flag('out')?.split('=')[1] || join(import.meta.dirname, 'screenshots')
const dark = Boolean(flag('dark'))
const full = Boolean(flag('full'))
const names = args.filter((arg) => !arg.startsWith('--'))
const selected = names.length ? scenarios.filter((s) => names.includes(s.name)) : scenarios

if (!selected.length) {
  console.error(`No such scenario. Available: ${scenarios.map((s) => s.name).join(', ')}`)
  process.exit(1)
}

mkdirSync(outDir, {recursive: true})
const browser = await chromium.launch()

for (const scenario of selected) {
  const context = await browser.newContext({
    viewport: {width: 1280, height: 2200},
    deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installMockApi(page, {documents: scenario.documents})
  await page.goto(`${STUDIO}${scenario.path}`, {waitUntil: 'load'})
  const field = page.locator(`[data-testid="field-${scenario.field ?? 'seo'}"]`).first()
  await field.waitFor({timeout: 30000})
  // Let live queries and the slug lookup settle.
  await page.waitForTimeout(1500)
  if (scenario.run) await scenario.run({page, field})
  await page.waitForTimeout(500)
  const file = join(outDir, `${scenario.name}${dark ? '-dark' : ''}.png`)
  if (full) await page.screenshot({path: file})
  else await field.screenshot({path: file})
  console.log(`${file}${errors.length ? `  (page errors: ${errors.join(' | ')})` : ''}`)
  await context.close()
}

await browser.close()
