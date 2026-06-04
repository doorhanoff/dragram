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
