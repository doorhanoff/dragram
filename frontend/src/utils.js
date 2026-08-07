import { isNativeDownload, nativeDownload } from './nativeDownload'
import { gateHeaders } from './api'

const PALETTE = ['#5865f2','#57c7a4','#e8803a','#e04c4c','#9b59b6','#1abc9c','#e67e22','#3498db']

export function colorFromId(id = '') {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return PALETTE[h % PALETTE.length]
}

export function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

export function chatName(chat, myId) {
  if (chat?.name) return chat.name
  const members = chat?.members || []
  if (myId && members.length > 0) {
    const other = members.find(m => String(m.id) !== String(myId))
    if (other) return other.name
    // личный чат с собой
    return members[0]?.name || 'Я'
  }
  return `Чат ${String(chat?.id || '').slice(0, 6)}`
}

export function fmtTime(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  return isNaN(d) ? '' : d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDay(dt) {
  if (!dt) return ''
  const d = new Date(dt)
  if (isNaN(d)) return ''
  const today = new Date()
  const yest  = new Date(); yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yest.toDateString())  return 'Вчера'
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })
}

/** Короткое сообщение поверх интерфейса — подтверждение, что файл сохранён.
 *  В приложении своего окна загрузок нет, и без такого ответа непонятно,
 *  случилось ли вообще что-нибудь. */
export function showToast(text, ms = 2600) {
  const el = document.createElement('div')
  el.textContent = text
  el.style.cssText = [
    'position:fixed', 'left:50%', 'transform:translateX(-50%)',
    'bottom:calc(env(safe-area-inset-bottom, 0px) + 84px)',
    'background:rgba(20,20,20,.92)', 'color:#fff', 'padding:10px 16px',
    'border-radius:14px', 'font-size:14px', 'font-weight:700', 'z-index:1000',
    'max-width:88vw', 'text-align:center', 'pointer-events:none',
    'opacity:0', 'transition:opacity .18s ease',
  ].join(';')
  document.body.appendChild(el)
  requestAnimationFrame(() => { el.style.opacity = '1' })
  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 200)
  }, ms)
}

// Скачивает файл по URL как вложение (а не открывает в новой вкладке)
export async function downloadUrl(url, filename) {
  // Ссылки на медиа подписаны тикетом (?t=...) — в имя файла он попасть не должен.
  const name = filename || url.split('?')[0].split('/').pop() || 'file'

  // В приложении ссылка с download ничего не сохраняет: внутри WebView файл
  // уходит в никуда. Поэтому на Android качает нативный код и кладёт файл в
  // «Загрузки». Заголовок с пропуском передаём явно — куки там не работают.
  if (isNativeDownload()) {
    try {
      await nativeDownload(url, name, gateHeaders())
      showToast('Сохранено в «Загрузки»')
      return
    } catch (e) {
      // Не вышло (старая Android без разрешения, сбой сети) — пробуем обычным
      // способом, чем молча ничего не сделать.
      console.warn('Нативное сохранение не удалось:', e)
    }
  }

  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  } catch {
    window.open(url, '_blank')
  }
}
