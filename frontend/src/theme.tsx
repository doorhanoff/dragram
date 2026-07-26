import React, { createContext, useContext, useEffect, useState } from 'react'
import { applyNativeAppIcon } from './nativeIcon'

export type Palette = 'hearth' | 'forest' | 'sky'
export type Scale = 0.9 | 1 | 1.18

interface ThemeState { palette: Palette; dark: boolean; scale: Scale }
interface ThemeCtx extends ThemeState {
  setPalette: (p: Palette) => void
  setDark: (d: boolean) => void
  setScale: (s: Scale) => void
}

const STORAGE_KEY = 'dragram_theme'
const DEFAULT_STATE: ThemeState = { palette: 'hearth', dark: false, scale: 1 }
const Ctx = createContext<ThemeCtx | null>(null)

function load(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_STATE
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ThemeState>(load)

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', state.palette)
    document.documentElement.setAttribute('data-theme', state.dark ? 'dark' : 'light')
    document.documentElement.style.fontSize = `${state.scale * 100}%`
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))

    const favicon = document.getElementById('app-favicon') as HTMLLinkElement | null
    if (favicon) favicon.href = `/icons/icon-${state.palette}.svg`

    const themeColorMeta = document.getElementById('theme-color-meta')
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    if (themeColorMeta && accent) themeColorMeta.setAttribute('content', accent)

    applyNativeAppIcon(state.palette)
  }, [state])

  const value: ThemeCtx = {
    ...state,
    setPalette: p => setState(s => ({ ...s, palette: p })),
    setDark:    d => setState(s => ({ ...s, dark: d })),
    setScale:   sc => setState(s => ({ ...s, scale: sc })),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
