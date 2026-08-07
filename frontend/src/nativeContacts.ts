import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Поиск знакомых по телефонной книге (ContactsPlugin.java).
 *
 * Номера не уходят на сервер в открытом виде: адресная книга — это данные
 * людей, которые про Dragram ничего не знают и согласия не давали. Здесь
 * номера нормализуются и хешируются, а наружу едут только хеши; сервер
 * отвечает совпадениями и ничего не сохраняет.
 */
interface ContactsPlugin {
  hasPermission(): Promise<{ granted: boolean }>
  getPhoneNumbers(): Promise<{ granted: boolean; numbers: string[] }>
}

const Contacts = registerPlugin<ContactsPlugin>('Contacts')

export const canReadContacts = () => Capacitor.getPlatform() === 'android'

/**
 * Приводит номер к виду 79XXXXXXXXX — ровно так же, как сервер приводит
 * номера из базы. Без общего вида не совпадёт ничего: в книге номера
 * записаны как угодно, а в базе лежат в национальном формате.
 */
export function normalizePhone(raw: string): string | null {
  let digits = (raw || '').replace(/\D/g, '')
  if (digits.length === 11 && digits[0] === '8') digits = '7' + digits.slice(1)
  else if (digits.length === 10) digits = '7' + digits
  if (digits.length !== 11 || digits[0] !== '7') return null
  return digits
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Хеши номеров из телефонной книги. null — разрешение не дали. */
export async function collectContactHashes(): Promise<string[] | null> {
  if (!canReadContacts()) return null
  const { granted, numbers } = await Contacts.getPhoneNumbers()
  if (!granted) return null

  const normalized = new Set<string>()
  for (const n of numbers) {
    const norm = normalizePhone(n)
    if (norm) normalized.add(norm)
  }
  return Promise.all([...normalized].map(sha256Hex))
}

export async function contactsPermissionGranted(): Promise<boolean> {
  if (!canReadContacts()) return false
  try {
    return (await Contacts.hasPermission()).granted
  } catch {
    return false
  }
}
