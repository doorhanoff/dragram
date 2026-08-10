import React from 'react'
import { IconWifiOff } from '@tabler/icons-react'
import { useOnline } from '../../hooks/useOnline'

/**
 * Полоса «нет интернета».
 *
 * Без неё офлайн выглядит как поломка: сообщения не уходят, новые не
 * приходят, а почему — непонятно. Слова подобраны так, чтобы человек не решил,
 * что сломалось приложение или пропала переписка: она на месте, её видно.
 */
export default function OfflineBar() {
  const online = useOnline()
  if (online) return null

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 px-4 py-2 flex-shrink-0 text-center"
      style={{ background: 'var(--surface2)', color: 'var(--text)' }}
    >
      <IconWifiOff size={18} stroke={1.9} className="flex-shrink-0" />
      <span className="text-md font-bold">
        Нет интернета. Показано сохранённое
      </span>
    </div>
  )
}
