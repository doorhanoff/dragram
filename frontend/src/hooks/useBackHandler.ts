import { useEffect } from 'react'

// Стек обработчиков "назад" для открытых модалок/оверлеев.
// Аппаратная/жестовая кнопка "назад" на Android должна сначала закрывать
// самый верхний оверлей, а не сворачивать всё приложение или чат.
const stack: Array<() => void> = []

export function useBackHandler(onBack: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return
    stack.push(onBack)
    return () => {
      const i = stack.lastIndexOf(onBack)
      if (i !== -1) stack.splice(i, 1)
    }
  }, [onBack, enabled])
}

// Возвращает true, если нашёлся открытый оверлей и закрыл его
export function consumeBack(): boolean {
  const fn = stack[stack.length - 1]
  if (fn) { fn(); return true }
  return false
}
