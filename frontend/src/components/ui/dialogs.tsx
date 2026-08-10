import React, { useEffect, useState } from 'react'
import { useBackHandler } from '../../hooks/useBackHandler'

/**
 * Свои диалоги вместо window.confirm / alert.
 *
 * Браузерное окно внутри приложения Android рисуется с заголовком вроде
 * «На странице localhost сказано» — для человека это выглядит как сообщение
 * вируса, а не как вопрос от Dragram. Плюс кнопки там всегда «ОК / Отмена»,
 * а называть их надо действием: «Удалить» и «Оставить».
 *
 * Вызов остаётся императивным (`if (await ask(...))`), чтобы места вызова
 * не пришлось переписывать на состояние и колбэки.
 */

interface DialogSpec {
  title: string
  text?: string
  /** Что произойдёт, если согласиться. Не «ОК». */
  confirmLabel?: string
  /** Как отказаться. Не «Отмена». */
  cancelLabel?: string
  /** Действие необратимо — подтверждение красным. */
  danger?: boolean
  /** Сообщение без выбора: одна кнопка «Понятно». */
  infoOnly?: boolean
}

type Entry = DialogSpec & { id: number; resolve: (ok: boolean) => void }

let nextId = 1
let publish: ((queue: Entry[]) => void) | null = null
const queue: Entry[] = []

function push(spec: DialogSpec): Promise<boolean> {
  return new Promise(resolve => {
    queue.push({ ...spec, id: nextId++, resolve })
    publish?.([...queue])
  })
}

function settle(entry: Entry, ok: boolean) {
  const i = queue.findIndex(e => e.id === entry.id)
  if (i !== -1) queue.splice(i, 1)
  publish?.([...queue])
  entry.resolve(ok)
}

/** Вопрос с выбором. true — согласились. */
export function ask(spec: DialogSpec): Promise<boolean> {
  return push(spec)
}

/** Сообщение без выбора. */
export function say(title: string, text?: string): Promise<boolean> {
  return push({ title, text, infoOnly: true, confirmLabel: 'Понятно' })
}

/** Ошибка от сервера, показанная по-человечески. Код — только в консоль. */
export function sayError(title: string, error?: unknown): Promise<boolean> {
  if (error) console.warn(title, error)
  return say(title, 'Попробуйте ещё раз. Если не получится — попробуйте позже.')
}

function Dialog({ entry }: { entry: Entry }) {
  const close = () => settle(entry, false)
  useBackHandler(close)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
      onClick={e => e.target === e.currentTarget && close()}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-sm bg-surface rounded-t-[24px] sm:rounded-card p-6 pb-safe shadow-pop">
        <h2 className="text-xl font-bold text-primary mb-2">{entry.title}</h2>
        {entry.text && <p className="text-md text-muted leading-relaxed mb-5">{entry.text}</p>}
        {!entry.text && <div className="mb-5" />}
        <div className="flex flex-col gap-2">
          <button
            className="btn btn-primary w-full"
            style={entry.danger ? { background: 'var(--danger)', color: '#fff' } : undefined}
            onClick={() => settle(entry, true)}
            autoFocus
          >
            {entry.confirmLabel || 'Продолжить'}
          </button>
          {!entry.infoOnly && (
            <button className="btn btn-secondary w-full" onClick={close}>
              {entry.cancelLabel || 'Не надо'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function DialogHost() {
  const [entries, setEntries] = useState<Entry[]>([])

  useEffect(() => {
    publish = setEntries
    setEntries([...queue])
    return () => { publish = null }
  }, [])

  // Показываем по одному: два вопроса разом человека только запутают.
  const top = entries[entries.length - 1]
  return top ? <Dialog key={top.id} entry={top} /> : null
}
