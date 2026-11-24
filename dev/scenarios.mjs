/**
 * Screenshot scenarios: a Studio path, optional interactions, and the field to capture
 * (`field`, default `seo`, is waited for; `capture` names another field to capture).
 * `documents` replaces the fixtures for one scenario. Add one for each visual change.
 *
 * `run({page, field})` receives the Playwright page and the `seo` field's locator.
 */
/** The listing's Edit toggle (the pencil in the field's corner). */
export const editButton = (field) => field.locator('button:has([data-sanity-icon="edit"])').first()

export const scenarios = [
  {name: 'page-preview', path: '/structure/page;page-about'},
  {
    name: 'page-editing',
    path: '/structure/page;page-about',
    run: async ({field}) => editButton(field).click(),
  },
  {
    name: 'page-validation',
    path: '/structure/page;page-long',
    run: async ({field}) => editButton(field).click(),
  },
  {name: 'page-empty', path: '/structure/page;page-empty'},
  {name: 'product-preview', path: '/structure/product;product-tote'},
  {
    name: 'product-editing',
    path: '/structure/product;product-tote',
    run: async ({field}) => editButton(field).click(),
  },
  {name: 'home-preview', path: '/structure/settings;settings'},
  {
    name: 'home-editing',
    path: '/structure/settings;settings',
    run: async ({field}) => editButton(field).click(),
  },
]

scenarios.push({
  name: 'page-typing',
  path: '/structure/page;page-about',
  run: async ({page, field}) => {
    await editButton(field).click()
    const title = field.locator('[data-testid="field-seo.title"] input')
    await title.click()
    await title.pressSequentially('Our story', {delay: 20})
    await page.waitForTimeout(4000)
  },
})

scenarios.push({
  name: 'page-handle-moved',
  path: '/structure/page;page-long',
  capture: 'seo.url',
  run: async ({field}) => editButton(field).click(),
})
