import React from 'react'
import { useCachedImage } from '../../hooks/useCachedImage'

interface Props extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** Адрес файла, как он лежит в базе — не подписанная ссылка. */
  url?: string | null
}

/**
 * Картинка, которая берётся с устройства, если уже скачивалась.
 *
 * Обёртка нужна из-за правил хуков: картинки рисуются в списках (плитки
 * альбома, вложения поста), а хук в цикле не вызвать — значит на каждую
 * нужен свой компонент.
 */
export default function CachedImg({ url, loading, ...rest }: Props) {
  const src = useCachedImage(url)
  // Файл уже на устройстве — откладывать его до появления в поле зрения нечего:
  // трафика это не экономит, а при быстрой прокрутке даёт пустую плитку.
  // loading="lazy" остаётся только для того, что придётся тянуть из сети.
  const defer = src?.startsWith('blob:') ? undefined : loading
  // Пока адрес не готов, тег рисуется без src — место под картинку уже
  // занято версткой, поэтому ничего не прыгает.
  return <img {...rest} loading={defer} src={src} />
}
