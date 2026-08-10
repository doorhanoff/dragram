import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Сохранение файла на телефон (DownloadPlugin.java).
 *
 * В приложении ссылка с атрибутом download ничего не сохраняет — внутри
 * WebView файл «скачивается» в никуда. Поэтому на Android качает нативный
 * код: фото и видео кладёт в галерею, остальное — в «Загрузки». На вебе
 * остаётся обычный способ через blob.
 */
export type SaveKind = 'gallery' | 'downloads'

interface DownloaderPlugin {
  download(options: {
    url: string
    filename?: string
    headers?: Record<string, string>
  }): Promise<{ uri: string; name: string; kind?: SaveKind }>
}

const Downloader = registerPlugin<DownloaderPlugin>('Downloader')

export const isNativeDownload = () => Capacitor.getPlatform() === 'android'

export async function nativeDownload(
  url: string,
  filename?: string,
  headers?: Record<string, string>,
): Promise<SaveKind> {
  const res = await Downloader.download({ url, filename, headers })
  // Старая сборка плагина kind не присылает — считаем, что это «Загрузки».
  return res.kind === 'gallery' ? 'gallery' : 'downloads'
}
