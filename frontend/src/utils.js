import { isNativeDownload, nativeDownload } from './nativeDownload'
import { gateHeaders } from './api'

const PALETTE = ['#5865f2','#57c7a4','#e8803a','#e04c4c','#9b59b6','#1abc9c','#e67e22','#3498db']

export function colorFromId(id = '') {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return PALETTE[h % PALETTE.length]
}

/* Цвет имени в групповом чате закреплён за человеком: в группе он узнаётся
   по цвету, не вчитываясь в имя. Два набора, потому что один не годится для
   обеих тем — тёмный оттенок на тёмном пузыре даёт 2,4:1 вместо 4,5:1.
   Замеры: светлая тема 4,9–7,1:1 на белом пузыре, тёмная 6,1–8,4:1. */
const NAME_COLORS_LIGHT = ['#B03A2E', '#1F6F8B', '#2E7247', '#7D3C98', '#9C6510', '#1A5FB4', '#A03D6E', '#4A6B3C']
const NAME_COLORS_DARK  = ['#F2938A', '#79C7DE', '#7FD3A0', '#D3A3E8', '#E8B860', '#8FB8F0', '#EE9CC4', '#A8D18E']

export function nameColor(id = '', dark = false) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  const palette = dark ? NAME_COLORS_DARK : NAME_COLORS_LIGHT
  return palette[h % palette.length]
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

/**
 * Разбирает дату с сервера.
 *
 * Строку без указания пояса («2026-08-08T15:19:18») браузер считает МЕСТНЫМ
 * временем. База отдавала именно такие — значения в ней UTC, а колонка про
 * это не знала, — и в Москве сообщения показывались на три часа раньше, чем
 * были отправлены. Сама причина устранена (колонки переведены в timestamptz),
 * но разбор оставляем устойчивым: смещение дописывается, только если его нет,
 * поэтому корректную дату функция не портит.
 */
export function parseDate(dt) {
  if (!dt) return null
  const s = String(dt)
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)
  const d = new Date(hasZone || !s.includes('T') ? s : s + 'Z')
  return isNaN(d.getTime()) ? null : d
}

export function fmtTime(dt) {
  const d = parseDate(dt)
  return d ? d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' }) : ''
}

export function fmtDay(dt) {
  const d = parseDate(dt)
  if (!d) return ''
  const today = new Date()
  const yest  = new Date(); yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yest.toDateString())  return 'Вчера'
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'long' })
}

function isSameDay(a, b) { return a.toDateString() === b.toDateString() }
function yesterday() { const d = new Date(); d.setDate(d.getDate() - 1); return d }

/** Время в списке чатов: сегодня — «15:17», вчера — «вчера», раньше — «8 авг.». */
export function fmtListTime(dt) {
  const d = parseDate(dt)
  if (!d) return ''
  const now = new Date()
  if (isSameDay(d, now)) return fmtTime(dt)
  if (isSameDay(d, yesterday())) return 'вчера'
  const opts = { day: 'numeric', month: 'short' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('ru', opts)
}

/** Время с датой: «14:32», «вчера, 14:32», «3 авг., 14:32».
 *  Без даты комментарий недельной давности выглядит написанным сегодня. */
export function fmtDateTime(dt) {
  const d = parseDate(dt)
  if (!d) return ''
  const now = new Date()
  if (isSameDay(d, now)) return fmtTime(dt)
  if (isSameDay(d, yesterday())) return `вчера, ${fmtTime(dt)}`
  const opts = { day: 'numeric', month: 'short' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return `${d.toLocaleDateString('ru', opts)}, ${fmtTime(dt)}`
}

/**
 * Строка под именем в шапке чата. Она есть ВСЕГДА — иначе шапка прыгает по
 * высоте, а человеку непонятно, ждать ли ответа сейчас.
 */
export function fmtPresence(isOnline, lastSeen) {
  if (isOnline) return 'в сети'
  const d = parseDate(lastSeen)
  if (!d) return 'не в сети'
  const now = new Date()
  const minutes = Math.floor((now - d) / 60000)
  if (minutes < 1) return 'был(а) только что'
  if (minutes < 60) return 'был(а) недавно'
  if (isSameDay(d, now)) return `был(а) сегодня в ${fmtTime(lastSeen)}`
  if (isSameDay(d, yesterday())) return `был(а) вчера в ${fmtTime(lastSeen)}`
  const opts = { day: 'numeric', month: 'short' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return `был(а) ${d.toLocaleDateString('ru', opts)}`
}

/**
 * Российский номер по мере набора: +7 (999) 123-45-67.
 *
 * Раньше подсказка показывала один формат, поле принимало любой, а профиль
 * показывал третий — сомнения «в каком виде писать» оставались до конца.
 * Здесь остаются только цифры, «8» в начале считается за «7».
 */
export function formatPhoneInput(raw) {
  let digits = String(raw || '').replace(/\D/g, '')
  if (digits.startsWith('8')) digits = '7' + digits.slice(1)
  if (!digits.startsWith('7')) digits = '7' + digits
  digits = digits.slice(0, 11)

  const rest = digits.slice(1)
  let out = '+7'
  if (rest.length) out += ` (${rest.slice(0, 3)}`
  if (rest.length > 3) out += `) ${rest.slice(3, 6)}`
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`
  return out
}

/** Номер целиком набран — можно отправлять форму. */
export function phoneIsComplete(formatted) {
  return String(formatted || '').replace(/\D/g, '').length === 11
}

/**
 * Ошибка входа по-человечески. Технические коды («401», «Invalid credentials»)
 * на экране не говорят ничего — они уходят в консоль.
 */
export function humanAuthError(message) {
  const raw = String(message ?? '')
  console.warn('Ответ сервера:', raw)
  if (raw === '401' || /invalid credentials/i.test(raw)) {
    return 'Неверный номер или пароль. Проверьте раскладку и попробуйте ещё раз.'
  }
  if (raw === '409' || /already exists/i.test(raw)) {
    return 'Этот номер уже зарегистрирован. Попробуйте войти.'
  }
  if (raw === '429') return 'Слишком много попыток. Попробуйте через несколько минут.'
  if (raw === '422') return 'Проверьте номер телефона: он должен быть российским, 11 цифр.'
  if (/network|failed to fetch/i.test(raw)) return 'Нет связи с интернетом. Проверьте подключение.'
  return 'Не получилось. Попробуйте ещё раз.'
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
  // уходит в никуда. Поэтому на Android качает нативный код: фото и видео
  // кладёт в галерею, остальное — в «Загрузки». Заголовок с пропуском
  // передаём явно — куки там не работают.
  if (isNativeDownload()) {
    try {
      const kind = await nativeDownload(url, name, gateHeaders())
      showToast(kind === 'gallery' ? 'Сохранено в галерею' : 'Сохранено в «Загрузки»')
      return
    } catch (e) {
      // Не вышло (старая Android без разрешения, сбой сети) — пробуем обычным
      // способом, чем молча ничего не сделать.
      console.warn('Нативное сохранение не удалось:', e)
    }
  }

  try {
    // Пропуск нужен и здесь: в вебе его донесёт кука, а в приложении, если
    // нативное сохранение не сработало и мы дошли до запасного пути, — нет.
    const res = await fetch(url, { headers: gateHeaders() })
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
