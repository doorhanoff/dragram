import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { api } from './api'

let initialized = false

export async function initPushNotifications() {
  if (initialized) return
  if (Capacitor.getPlatform() !== 'android') return
  initialized = true

  let perm = await PushNotifications.checkPermissions()
  if (perm.receive === 'prompt') {
    perm = await PushNotifications.requestPermissions()
  }
  if (perm.receive !== 'granted') return

  PushNotifications.addListener('registration', token => {
    api.registerPushToken(token.value, 'android').catch(() => {})
  })
  PushNotifications.addListener('registrationError', err => {
    console.error('Push registration error', err)
  })

  await PushNotifications.register()
}
