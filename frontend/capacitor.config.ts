import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.dragram.app',
  appName: 'Dragram',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
}

export default config
