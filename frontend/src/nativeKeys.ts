import { Capacitor, registerPlugin } from '@capacitor/core'
import { exportRawKey } from './crypto'

/**
 * Мост к нативному хранилищу ключей (E2eeKeysPlugin.java).
 *
 * Push приходит, когда WebView не запущен, поэтому WebCrypto в этот момент
 * недоступен. Чтобы уведомление показывало настоящий текст, ключи чатов
 * дублируются в Android Keystore, откуда их берёт DragramMessagingService.
 *
 * На вебе всё это не нужно и не работает — там вызовы просто ничего не делают.
 */
interface E2eeKeysPlugin {
  syncChatKey(options: { chatId: string; key: string }): Promise<void>
  clearKeys(): Promise<void>
  clearChatNotifications(options: { chatId: string }): Promise<void>
}

const E2eeKeys = registerPlugin<E2eeKeysPlugin>('E2eeKeys')

const isNative = () => Capacitor.getPlatform() === 'android'

/** Отдаёт ключ чата нативному коду. Ошибки не критичны: без ключа
 *  уведомление просто останется с общей подписью. */
export async function syncChatKey(chatId: string, aesKey: CryptoKey | null): Promise<void> {
  if (!isNative() || !aesKey) return
  try {
    await E2eeKeys.syncChatKey({ chatId, key: await exportRawKey(aesKey) })
  } catch (e) {
    console.warn('Failed to sync chat key to native store', e)
  }
}

/** Вызывать при выходе из аккаунта: ключи не должны пережить логаут. */
export async function clearNativeKeys(): Promise<void> {
  if (!isNative()) return
  try {
    await E2eeKeys.clearKeys()
  } catch (e) {
    console.warn('Failed to clear native key store', e)
  }
}

/** Снимает уведомления чата — пользователь его открыл и прочитал. */
export async function clearChatNotifications(chatId: string): Promise<void> {
  if (!isNative()) return
  try {
    await E2eeKeys.clearChatNotifications({ chatId })
  } catch (e) {
    console.warn('Failed to clear chat notifications', e)
  }
}
