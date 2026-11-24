import React from 'react'

import {type ResolvedFieldOptions, resolveFieldOptions} from './options'
import type {ResolvedFallbacks} from './types'

export const SiteNameContext = React.createContext(null as string | null)
export const PathPrefixContext = React.createContext('/')
export const SlugFallbackContext = React.createContext('')
export const HasHandleContext = React.createContext(true)
export const FallbacksContext = React.createContext<ResolvedFallbacks>({})
export const FieldOptionsContext = React.createContext<ResolvedFieldOptions>(
  resolveFieldOptions({}),
)
