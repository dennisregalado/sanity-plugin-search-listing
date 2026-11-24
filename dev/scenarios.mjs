/**
 * Screenshot scenarios: a Studio path, optional interactions, and the field to capture.
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

/** Opens the document's validation panel and clicks the message that mentions `text`. */
const clickValidationMessage = async (page, text) => {
  await page.getByRole('button', {name: 'Validation'}).click()
  await page.getByText(text).last().click()
  await page.waitForTimeout(1000)
}

scenarios.push(
  // A warning on a hidden member (the title), with the listing closed.
  {name: 'page-validation-closed', path: '/structure/page;page-long'},
  // The same warning, clicked in the document's validation panel.
  {
    name: 'page-validation-click',
    path: '/structure/page;page-long',
    run: ({page}) => clickValidationMessage(page, 'Longer titles may be truncated'),
  },
  // An error on a hidden member (an invalid URL handle), with nothing clicked.
  {name: 'page-error', path: '/structure/page;page-error'},
  // The fallback-source popover, opened by keyboard: Tab from the field before the listing.
  {
    name: 'page-popover-keyboard',
    path: '/structure/page;page-about',
    run: async ({page}) => {
      await page.locator('[data-testid="field-description"] textarea').focus()
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab')
        await page.waitForTimeout(150)
      }
      await page.waitForTimeout(800)
    },
  },
)

scenarios.push(
  // The error opened edit mode; closing it again leaves the toggle in the error tone.
  {
    name: 'page-error-closed',
    path: '/structure/page;page-error',
    run: async ({field}) => editButton(field).click(),
  },
  // The toggle's tooltip lists the hidden problems (use --full: the tooltip is in a portal).
  {
    name: 'page-validation-tooltip',
    path: '/structure/page;page-long',
    run: async ({page, field}) => {
      await editButton(field).hover()
      await page.waitForTimeout(800)
    },
  },
)
