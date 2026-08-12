import { useEffect, useState } from 'react'
import { gateHeaders, mediaSrc } from '../api'
import { getCachedMedia, putCachedMedia, storageKey, getLiveUrl, putLiveUrl } from '../mediaCache'

/**
 * Отдаёт адрес картинки, подставляя копию с устройства, если она уже есть.
 *
 * Порядок такой: сначала ищем в кеше, и только не найдя — скачиваем и
 * сохраняем. Не наоборот: показать сетевой адрес сразу, а качать в кеш
 * параллельно — значит скачать один и тот же файл дважды при первом
 * просмотре, а мобильный трафик здесь не бесплатный.
 *
 * Один раз увиденная картинка дальше показывается мгновенно: готовая ссылка
 * лежит в общей памяти приложения (mediaCache.liveUrls) и берётся синхронно,
 * до первой отрисовки. Раньше хук на каждом монтировании начинал с пустоты и
 * заново читал хранилище — от этого аватарки и плитки альбома моргали при
 * каждой прокрутке, будто грузятся заново.
 *
 * Только для картинок. Видео и голосовые остаются потоковыми: тянуть
 * двести мегабайт в память, чтобы потом показать, нельзя.
 */

/** Один и тот же файл не качаем дважды, если его попросили сразу несколько
 *  плиток списка. */
const inflight = new Map<string, Promise<string | null>>()

function resolveNow(url?: string | null): string | undefined {
  if (!url) return undefined
  const key = storageKey(url)
  // Не наш файл — отдаём как есть, кешировать нечего.
  if (!key) return mediaSrc(url) || undefined
  return getLiveUrl(key)
}

async function load(url: string, key: string): Promise<string | null> {
  const running = inflight.get(key)
  if (running) return running

  const task = (async () => {
    const cached = await getCachedMedia(url)
    if (cached) return putLiveUrl(key, cached)
    try {
      const net = mediaSrc(url)
      const res = await fetch(net!, { headers: gateHeaders(), credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      putCachedMedia(url, blob)
      return putLiveUrl(key, blob)
    } catch {
      // Не скачалось (нет сети, протух тикет) — пусть тег сам попробует
      // обычным способом и покажет свою ошибку.
      return null
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task)
  return task
}

export function useCachedImage(url?: string | null): string | undefined {
  // Синхронное начальное значение: если картинку уже видели, пустого кадра
  // не будет вовсе.
  const [src, setSrc] = useState<string | undefined>(() => resolveNow(url))

  useEffect(() => {
    const ready = resolveNow(url)
    if (ready) { setSrc(ready); return }
    if (!url) { setSrc(undefined); return }

    const key = storageKey(url)
    if (!key) { setSrc(mediaSrc(url) || undefined); return }

    let cancelled = false
    // Прежнюю картинку НЕ стираем: пусть висит, пока не готова новая. Пустой
    // кадр посреди списка и читается как «загружается заново».
    load(url, key).then(objectUrl => {
      if (cancelled) return
      setSrc(objectUrl ?? mediaSrc(url) ?? undefined)
    })

    // Ссылку НЕ отзываем: она общая и переживает этот компонент. Отзывом
    // занимается mediaCache, когда упрётся в потолок или при выходе.
    return () => { cancelled = true }
  }, [url])

  return src
}
