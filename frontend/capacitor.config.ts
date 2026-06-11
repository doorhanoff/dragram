import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.dragram.app',
  appName: 'Dragram',
  webDir: 'dist',
  server: {
    url: 'https://dragram-production.up.railway.app',
    cleartext: false,
  },
}

export default config
