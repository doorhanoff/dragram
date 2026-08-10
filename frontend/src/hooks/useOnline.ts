import { useEffect, useState } from 'react'
import { isOnline } from '../api'

/**
 * Есть ли связь с Dragram.
 *
 * navigator.onLine одного мало: он говорит лишь о том, что устройство к
 * чему-то подключено. Телефон, поймавший вайфай в метро, «онлайн» — а сервер
 * при этом недостижим. Поэтому к нему добавлены наши же неудачи: api бросает
 * событие net:offline, когда запрос оборвался, и net:online, когда очередной
 * прошёл.
 */
export function useOnline(): boolean {
  // Начальное значение берём из api, а не из navigator: к моменту, когда
  // полоса впервые рисуется, запросы на старте уже успели упасть, и событие
  // о неудаче она бы не услышала.
  const [online, setOnline] = useState(isOnline)

  useEffect(() => {
    // Пока полоса монтировалась, связь могла успеть измениться ещё раз.
    setOnline(isOnline())
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    window.addEventListener('net:online', up)
    window.addEventListener('net:offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
      window.removeEventListener('net:online', up)
      window.removeEventListener('net:offline', down)
    }
  }, [])

  return online
}
