import React, { createContext, useContext, useEffect, useState } from 'react'
import { applyNativeAppIcon } from './nativeIcon'

export type Palette = 'hearth' | 'forest' | 'sky'
/** 'system' — как в телефоне. По умолчанию именно она: человек с тёмной темой
 *  в телефоне не должен получать единственное приложение со светлым экраном. */
export type ThemeMode = 'system' | 'light' | 'dark'

export const MIN_SCALE = 1
export const MAX_SCALE = 1.6

interface ThemeState { palette: Palette; mode: ThemeMode; scale: number }
interface ThemeCtx extends ThemeState {
  /** Итоговая тема с учётом системной — то, что реально нарисовано. */
  dark: boolean
  setPalette: (p: Palette) => void
  setMode: (m: ThemeMode) => void
  setScale: (s: number) => void
}

const STORAGE_KEY = 'dragram_theme'
const DEFAULT_STATE: ThemeState = { palette: 'hearth', mode: 'system', scale: 1 }
const Ctx = createContext<ThemeCtx | null>(null)

const systemPrefersDark = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

function load(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const saved = JSON.parse(raw)
    // Раньше тема хранилась как dark: boolean, а масштаб мог быть 0.9 —
    // «Обычный», который на деле мельче обычного. Переносим старые настройки,
    // чтобы после обновления человек не увидел чужой экран.
    const mode: ThemeMode = saved.mode ?? (typeof saved.dark === 'boolean' ? (saved.dark ? 'dark' : 'light') : 'system')
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(saved.scale) || 1))
    return { palette: saved.palette ?? DEFAULT_STATE.palette, mode, scale }
  } catch {
    return DEFAULT_STATE
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ThemeState>(load)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Тема телефона может смениться, пока приложение открыто (по расписанию
  // «с заката до рассвета») — следим за ней, а не читаем один раз при старте.
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const dark = state.mode === 'system' ? systemDark : state.mode === 'dark'

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', state.palette)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    document.documentElement.style.fontSize = `${state.scale * 100}%`
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))

    const favicon = document.getElementById('app-favicon') as HTMLLinkElement | null
    if (favicon) favicon.href = `/icons/icon-${state.palette}.svg`

    const themeColorMeta = document.getElementById('theme-color-meta')
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
    if (themeColorMeta && accent) themeColorMeta.setAttribute('content', accent)

    applyNativeAppIcon(state.palette)
  }, [state, dark])

  const value: ThemeCtx = {
    ...state,
    dark,
    setPalette: p  => setState(s => ({ ...s, palette: p })),
    setMode:    m  => setState(s => ({ ...s, mode: m })),
    setScale:   sc => setState(s => ({ ...s, scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, sc)) })),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
