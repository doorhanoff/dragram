import React from 'react'
import { IconArrowBackUp, IconCopy, IconShare3, IconTrash } from '@tabler/icons-react'
import { useBackHandler } from '../../hooks/useBackHandler'

/**
 * Что можно сделать с сообщением — шторка снизу на всю ширину.
 *
 * Раньше единственным действием было удаление, и то красным крестиком 20 px
 * в углу пузыря. «Ответить на конкретное сообщение» — главный способ не
 * запутаться в разговоре, и его не было вовсе.
 */
interface Props {
  canDelete: boolean
  canForward: boolean
  canCopy: boolean
  onReply: () => void
  onCopy: () => void
  onForward: () => void
  onDelete: () => void
  onClose: () => void
}

export default function MessageActions({
  canDelete, canForward, canCopy, onReply, onCopy, onForward, onDelete, onClose,
}: Props) {
  useBackHandler(onClose)

  const items = [
    { key: 'reply',   label: 'Ответить',  icon: <IconArrowBackUp size={22} stroke={1.8} />, show: true,       run: onReply },
    { key: 'copy',    label: 'Копировать', icon: <IconCopy size={22} stroke={1.8} />,       show: canCopy,    run: onCopy },
    { key: 'forward', label: 'Переслать', icon: <IconShare3 size={22} stroke={1.8} />,      show: canForward, run: onForward },
    // «Удалить» — красным и последним: чтобы не нажать по инерции.
    { key: 'delete',  label: 'Удалить',   icon: <IconTrash size={22} stroke={1.8} />,       show: canDelete,  run: onDelete, danger: true },
  ].filter(i => i.show)

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet">
        <div className="py-2 pb-safe">
          {items.map(item => (
            <button
              key={item.key}
              onClick={item.run}
              className="flex items-center gap-4 w-full px-5 text-left hover:bg-bg transition-colors"
              style={{ minHeight: 56, color: item.danger ? 'var(--danger)' : 'var(--text)' }}
            >
              {item.icon}
              <span className="text-lg font-bold">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
