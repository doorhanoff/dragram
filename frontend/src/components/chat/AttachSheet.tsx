import React from 'react'
import { IconPhoto, IconFileText } from '@tabler/icons-react'
import { useBackHandler } from '../../hooks/useBackHandler'

/**
 * Что прикрепить — шторка снизу.
 *
 * Раньше скрепка сразу открывала общий системный выбор: на Android это
 * файловый менеджер, где до фотографий ещё надо догадаться дойти через меню
 * слева. Спросить одним понятным вопросом дешевле, чем объяснять это.
 */
interface Props {
  onPhoto: () => void
  onFile: () => void
  onClose: () => void
}

export default function AttachSheet({ onPhoto, onFile, onClose }: Props) {
  useBackHandler(onClose)

  const items = [
    {
      key: 'photo',
      label: 'Фото или видео',
      sub: 'Из галереи телефона',
      icon: <IconPhoto size={24} stroke={1.8} />,
      run: onPhoto,
    },
    {
      key: 'file',
      label: 'Файл',
      sub: 'Документ, таблица, pdf',
      icon: <IconFileText size={24} stroke={1.8} />,
      run: onFile,
    },
  ]

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="py-2 pb-safe">
          {items.map(item => (
            <button
              key={item.key}
              onClick={item.run}
              className="flex items-center gap-4 w-full px-5 text-left hover:bg-bg transition-colors"
              style={{ minHeight: 64 }}
            >
              <span className="w-11 h-11 rounded-full bg-surface2 text-accent flex items-center justify-center flex-shrink-0">
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold text-primary">{item.label}</span>
                <span className="block text-sm text-muted">{item.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
