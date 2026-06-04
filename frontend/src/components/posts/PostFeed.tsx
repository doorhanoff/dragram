import React, { useState, useEffect, useRef, useCallback } from 'react'
import { IconPlus, IconSearch, IconWorld, IconUsers, IconBookmark } from '@tabler/icons-react'
import PostCard from './PostCard'
import type { Post } from '../../types'
import { api } from '../../api'

type Filter = 'all' | 'friends' | 'saved'

interface Props {
  query: string
  filter?: string
  onSelectPost: (id: string) => void
  onCreatePost: () => void
  onQuery?: (q: string) => void
  onFilter?: (f: Filter) => void
}

export default function PostFeed({ query, filter = 'all', onSelectPost, onCreatePost, onQuery, onFilter }: Props) {
  const [posts,   setPosts]   = useState<Post[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const offsetRef = useRef(0)
  const timerRef  = useRef<ReturnType<typeof setTimeout>>()

  const load = useCallback(async (text: string, reset = false) => {
    setLoading(true)
    try {
      const offset = reset ? 0 : offsetRef.current
      const items: Post[] = await api.getPosts(text || null, 20, offset, filter)
      if (reset) { setPosts(items || []); offsetRef.current = (items || []).length }
      else       { setPosts(p => [...p, ...(items || [])]); offsetRef.current += (items || []).length }
      setHasMore((items || []).length === 20)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { offsetRef.current = 0; load(query, true) }, [filter])

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { offsetRef.current = 0; load(query, true) }, 350)
  }, [query])

  return (
    <div className="flex-1 overflow-y-auto bg-bg">
      {/* Header */}
      <div className="bg-surface border-b border-border flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center px-5 py-3">
          <span className="text-lg font-medium text-primary flex-1">
            {query ? `Поиск: ${query}` : 'Все посты'}
          </span>
          <button
            onClick={onCreatePost}
            className="flex items-center gap-1.5 bg-accent text-white text-base font-medium px-3 py-[6px] rounded-lg transition-colors hover:bg-accent-text"
          >
            <IconPlus size={14} stroke={2} />
            <span className="hidden sm:inline">Новый пост</span>
            <span className="sm:hidden">Пост</span>
          </button>
        </div>

        {/* Мобильный поиск + фильтры — показываем только когда есть колбэки (т.е. на мобильном) */}
        {(onQuery || onFilter) && (
          <div className="px-4 pb-3 flex flex-col gap-2 md:hidden">
            {onQuery && (
              <div className="flex items-center gap-2 bg-bg rounded-lg px-3 py-2">
                <IconSearch size={14} stroke={1.5} className="text-muted flex-shrink-0" />
                <input
                  value={query}
                  onChange={e => onQuery(e.target.value)}
                  placeholder="Поиск по постам"
                  className="flex-1 bg-transparent outline-none text-primary placeholder:text-muted"
                />
              </div>
            )}
            {onFilter && (
              <div className="flex gap-2">
                {([
                  { id: 'all',     icon: <IconWorld size={13} stroke={1.5} />,    label: 'Все' },
                  { id: 'friends', icon: <IconUsers size={13} stroke={1.5} />,    label: 'Друзья' },
                  { id: 'saved',   icon: <IconBookmark size={13} stroke={1.5} />, label: 'Сохранённые' },
                ] as const).map(f => (
                  <button
                    key={f.id}
                    onClick={() => onFilter(f.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      filter === f.id
                        ? 'bg-accent text-white'
                        : 'bg-bg text-muted hover:text-primary'
                    }`}
                  >
                    {f.icon}{f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="max-w-2xl mx-auto px-4 py-4 flex flex-col gap-3">
        {loading && posts.length === 0 && (
          <p className="text-sm text-muted text-center py-12">Загрузка…</p>
        )}
        {!loading && posts.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-3">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#D0D0E0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p className="text-sm text-muted">Нет публикаций</p>
          </div>
        )}
        {posts.map(p => (
          <PostCard key={p.id} post={p} onClick={() => onSelectPost(p.id)} />
        ))}
        {hasMore && posts.length > 0 && (
          <button
            onClick={() => load(query)}
            disabled={loading}
            className="self-center text-sm text-muted border border-border rounded-full px-5 py-2 hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            {loading ? 'Загрузка…' : 'Загрузить ещё'}
          </button>
        )}
      </div>
    </div>
  )
}
