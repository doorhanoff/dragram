import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Сохранение файла на телефон (DownloadPlugin.java).
 *
 * В приложении ссылка с атрибутом download ничего не сохраняет — внутри
 * WebView файл «скачивается» в никуда. Поэтому на Android качает нативный
 * код и кладёт файл в «Загрузки», откуда он виден в галерее и файловом
 * менеджере. На вебе остаётся обычный способ через blob.
 */
interface DownloaderPlugin {
  download(options: {
    url: string
    filename?: string
    headers?: Record<string, string>
  }): Promise<{ uri: string; name: string }>
}

const Downloader = registerPlugin<DownloaderPlugin>('Downloader')

export const isNativeDownload = () => Capacitor.getPlatform() === 'android'

export async function nativeDownload(
  url: string,
  filename?: string,
  headers?: Record<string, string>,
): Promise<string> {
  const res = await Downloader.download({ url, filename, headers })
  return res.name
}
