import React, { useState, useEffect, useRef, useCallback } from 'react'
import { IconPencilPlus, IconSearch, IconX, IconArrowLeft } from '@tabler/icons-react'
import PostCard from './PostCard'
import type { Post } from '../../types'
import { api } from '../../api'
import { withCache } from '../../dataCache'

type Filter = 'all' | 'saved'

interface Props {
  query: string
  filter?: Filter
  /** Заголовок раздела: «Лента» или «Сохранённые». */
  title?: string
  onSelectPost: (id: string) => void
  onCreatePost?: () => void
  onQuery: (q: string) => void
  /** Показан как отдельный раздел (Сохранённые из профиля) — нужна стрелка назад. */
  onBack?: () => void
}

export default function PostFeed({
  query, filter = 'all', title = 'Лента', onSelectPost, onCreatePost, onQuery, onBack,
}: Props) {
  const [posts,   setPosts]   = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  // Поиск свёрнут в иконку: по десятку записей не ищут, а строка занимала
  // место на первом экране постоянно.
  const [searchOpen, setSearchOpen] = useState(!!query)
  const offsetRef = useRef(0)
  const timerRef  = useRef<ReturnType<typeof setTimeout>>()

  const load = useCallback(async (text: string, reset = false) => {
    setLoading(true)
    try {
      const offset = reset ? 0 : offsetRef.current
      // Кешируем только первую страницу без поиска: она и открывается при
      // каждом заходе. Хранить все страницы смысла нет — дальше человек
      // всё равно листает с сетью.
      const cacheable = reset && !text
      const apply = (items: Post[]) => {
        setPosts(items || [])
        offsetRef.current = (items || []).length
        setHasMore((items || []).length === 20)
      }

      if (cacheable) {
        await withCache<Post[]>(
          `posts:${filter}`,
          async () => (await api.getPosts(null, 20, 0, filter)) || [],
          apply,
        )
        return
      }

      const items: Post[] = await api.getPosts(text || null, 20, offset, filter)
      if (reset) apply(items)
      else {
        setPosts(p => [...p, ...(items || [])])
        offsetRef.current += (items || []).length
        setHasMore((items || []).length === 20)
      }
    } catch {}
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { offsetRef.current = 0; load(query, true) }, [filter])

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { offsetRef.current = 0; load(query, true) }, 350)
  }, [query])

  return (
    <div className="flex-1 overflow-y-auto bg-bg">
      {/* Header */}
      <div className="bg-bg flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center gap-1 px-2 pt-3 pb-2">
          {onBack && (
            <button onClick={onBack} aria-label="Назад" className="tap rounded-2xl text-accent">
              <IconArrowLeft size={26} stroke={2.2} />
            </button>
          )}
          <h2 className="text-3xl font-bold text-primary tracking-tight flex-1 px-2 ellipsis">{title}</h2>
          <button
            onClick={() => { if (searchOpen) onQuery(''); setSearchOpen(v => !v) }}
            aria-label={searchOpen ? 'Закрыть поиск' : 'Найти'}
            className="tap rounded-2xl text-muted hover:text-accent transition-colors"
          >
            {searchOpen ? <IconX size={24} stroke={2} /> : <IconSearch size={24} stroke={2} />}
          </button>
          {onCreatePost && (
            <button onClick={onCreatePost} className="btn btn-primary ml-1">
              <IconPencilPlus size={20} stroke={2} />
              {/* Глагол, а не существительное: «+ Пост» на узком экране
                  обрезался до слова «Пост» и не говорил, что произойдёт. */}
              <span>Написать</span>
            </button>
          )}
        </div>

        {searchOpen && (
          <div className="px-4 pb-3">
            <div className="flex items-center gap-2.5 bg-surface rounded-full px-[18px] h-[48px] shadow-soft">
              <IconSearch size={20} stroke={1.8} className="text-muted flex-shrink-0" />
              <input
                value={query}
                onChange={e => onQuery(e.target.value)}
                placeholder="Найти среди записей"
                autoFocus
                className="flex-1 bg-transparent outline-none text-primary placeholder:text-muted text-md"
              />
            </div>
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="max-w-2xl mx-auto px-4 py-2 pb-8 flex flex-col gap-3">
        {loading && posts.length === 0 && (
          <p className="text-md text-muted text-center py-12">Загрузка…</p>
        )}
        {!loading && posts.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-2 px-6">
            <p className="text-xl font-bold text-primary">
              {query ? 'Ничего не нашлось' : filter === 'saved' ? 'Здесь пока пусто' : 'Записей пока нет'}
            </p>
            <p className="text-md text-muted leading-relaxed">
              {query
                ? 'Попробуйте другое слово.'
                : filter === 'saved'
                  ? 'Нажмите закладку под записью — и она появится здесь.'
                  : 'Расскажите родным, как дела: нажмите «Написать».'}
            </p>
          </div>
        )}
        {posts.map(p => (
          <PostCard key={p.id} post={p} onClick={() => onSelectPost(p.id)} />
        ))}
        {hasMore && posts.length > 0 && (
          <button
            onClick={() => load(query)}
            disabled={loading}
            className="self-center text-md text-muted border border-border rounded-full px-5 py-2.5 hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            {loading ? 'Загрузка…' : 'Показать ещё'}
          </button>
        )}
      </div>
    </div>
  )
}
