import { useEffect, useState } from 'react'
import { gateHeaders, mediaSrc } from '../api'
import { getCachedMedia, putCachedMedia, storageKey } from '../mediaCache'

/**
 * Отдаёт адрес картинки, подставляя копию с устройства, если она уже есть.
 *
 * Порядок такой: сначала ищем в кеше, и только не найдя — скачиваем и
 * сохраняем. Не наоборот: показать сетевой адрес сразу, а качать в кеш
 * параллельно — значит скачать один и тот же файл дважды при первом
 * просмотре, а мобильный трафик здесь не бесплатный.
 *
 * Только для картинок. Видео и голосовые остаются потоковыми: тянуть
 * двести мегабайт в память, чтобы потом показать, нельзя.
 */
export function useCachedImage(url?: string | null): string | undefined {
  const [src, setSrc] = useState<string | undefined>(undefined)

  useEffect(() => {
    const net = mediaSrc(url)
    // Не наш файл (или пусто) — отдаём как есть, кешировать нечего.
    if (!url || !storageKey(url)) {
      setSrc(net || undefined)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null

    const show = (blob: Blob) => {
      objectUrl = URL.createObjectURL(blob)
      setSrc(objectUrl)
    }

    ;(async () => {
      const cached = await getCachedMedia(url)
      if (cancelled) return
      if (cached) { show(cached); return }

      try {
        const res = await fetch(net!, { headers: gateHeaders(), credentials: 'include' })
        if (!res.ok) throw new Error(String(res.status))
        const blob = await res.blob()
        if (cancelled) return
        show(blob)
        putCachedMedia(url, blob)
      } catch {
        // Не скачалось (нет сети, протух тикет) — пусть тег сам попробует
        // обычным способом и покажет свою ошибку.
        if (!cancelled) setSrc(net || undefined)
      }
    })()

    return () => {
      cancelled = true
      // Освобождаем ссылку на блоб: иначе картинки копятся в памяти,
      // пока вкладка не будет закрыта.
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  return src
}
