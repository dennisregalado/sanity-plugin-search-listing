import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'

import {searchListing} from '../../src'
import {norwegianLocale} from './nbLocale'
import {schemaTypes} from './schema'

export default defineConfig({
  name: 'default',
  title: 'Workbench',
  projectId: 'mock1234',
  dataset: 'production',
  plugins: [
    structureTool(),
    searchListing({siteName: 'Acme Store', siteUrl: 'https://acme.example'}),
  ],
  schema: {types: schemaTypes},
  // Before US English: the Studio opens in the last locale unless one was picked.
  i18n: {locales: (prev) => [norwegianLocale, ...prev]},
})
