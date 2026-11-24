import React from 'react'

import {type ResolvedFieldOptions, resolveFieldOptions} from './options'
import type {ResolvedFallbacks} from './types'
import {getHost} from './utils'

export const SiteNameContext = React.createContext(null as string | null)
export const PathPrefixContext = React.createContext('/')
export const SlugFallbackContext = React.createContext('')
export const HasHandleContext = React.createContext(true)
export const FallbacksContext = React.createContext<ResolvedFallbacks>({})
export const FieldOptionsContext = React.createContext<ResolvedFieldOptions>(
  resolveFieldOptions({}),
)

/** The site URL from the field's or the plugin's `siteUrl` option, normalized; `null` when unset. */
export const SiteUrlContext = React.createContext<string | null>(null)

/**
 * The site URL the listing shows before its path: the `siteUrl` option (the field's, then the
 * plugin's), or the Studio's own origin when neither is set.
 */
export function useSiteUrl(): string {
  return React.useContext(SiteUrlContext) ?? getHost()
}

/** Provides the site name and site URL the listing preview shows. */
export function SiteProvider(props: {
  siteName: string | null
  siteUrl: string | null
  children: React.ReactNode
}) {
  return React.createElement(
    SiteNameContext.Provider,
    {value: props.siteName},
    React.createElement(SiteUrlContext.Provider, {value: props.siteUrl}, props.children),
  )
}
