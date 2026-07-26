import { Capacitor, registerPlugin } from '@capacitor/core'
import type { Palette } from './theme'

interface AppIconPlugin {
  setTheme(options: { theme: string }): Promise<{ theme: string }>
}

const AppIcon = registerPlugin<AppIconPlugin>('AppIcon')

export function applyNativeAppIcon(theme: Palette) {
  if (Capacitor.getPlatform() !== 'android') return
  AppIcon.setTheme({ theme }).catch(() => {})
}
