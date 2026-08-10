import React, { useState, useEffect, useRef, useMemo } from 'react'
import { IconSearch, IconPencilPlus } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import ProfileModal from '../ui/ProfileModal'
import GroupChatModal from './GroupChatModal'
import NewChatSheet from './NewChatSheet'
import type { Chat, User } from '../../types'
import { api } from '../../api'
import { fmtListTime } from '../../utils'

function chatName(chat: Chat, myId: string): string {
  if (chat.name) return chat.name
  const other = chat.members?.find(m => String(m.id) !== String(myId))
  return other?.name || `Чат ${chat.id.slice(0, 6)}`
}

/** Момент последней активности: время последнего сообщения, а не дата
 *  создания чата. Прежняя цифра не менялась никогда и всегда врала. */
function activityAt(chat: Chat): string {
  return chat.last_message?.created_at || chat.created_at
}

interface ChatListProps {
  user: User
  chats: Chat[]
  activeChatId: string | null
  /** Расшифрованные превью последних сообщений: ключи чатов есть только в App. */
  previews: Record<string, string>
  onOpenChat: (id: string) => void
  onStartChat: (userId: string | null, data?: any) => void
}

interface ChatItemProps {
  chat: Chat
  myId: string
  isActive: boolean
  preview: string
  onClick: () => void
  onAvatarClick: () => void
}

function ChatItem({ chat, myId, isActive, preview, onClick, onAvatarClick }: ChatItemProps) {
  const name     = chatName(chat, myId)
  const other    = chat.members?.find(m => String(m.id) !== String(myId))
  const isGroup  = (chat.members?.length || 0) > 2
  const imgUrl   = isGroup ? chat.image_url : other?.image_url
  const isOnline = !isGroup && other?.is_active

  return (
    <div
      onClick={onClick}
      className={[
        'flex items-center gap-3.5 px-3 py-3 mx-1.5 my-px rounded-2xl cursor-pointer transition-colors',
        isActive ? 'shadow-soft' : 'hover:bg-bg',
      ].join(' ')}
      style={isActive ? { background: 'var(--surface2)' } : undefined}
    >
      {/* 48×48 вокруг аватара и так есть — он сам 52 px */}
      <div onClick={e => { e.stopPropagation(); onAvatarClick() }} className="cursor-pointer flex-shrink-0">
        <Avatar name={name} id={chat.id} imageUrl={imgUrl} isActive={isOnline} size={52} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-bold ellipsis text-primary">{name}</span>
          <span className="text-xs font-bold text-muted flex-shrink-0">{fmtListTime(activityAt(chat))}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className={`text-md ellipsis ${chat.unread_count ? 'text-primary font-bold' : 'text-muted'}`}>
            {preview}
          </div>
          {!!chat.unread_count && (
            <span className="bg-badge text-onAccent rounded-full px-1.5 leading-none flex-shrink-0 font-bold"
              style={{ fontSize: 13, minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {chat.unread_count > 99 ? '99+' : chat.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ChatList({ user, chats, activeChatId, previews, onOpenChat, onStartChat }: ChatListProps) {
  const [query,       setQuery]       = useState('')
  const [searchUsers, setSearch]      = useState<any[]>([])
  const [searching,   setSearching]   = useState(false)
  const [directory,   setDirectory]   = useState<any[] | null>(null)
  const [showGroup,   setShowGroup]   = useState(false)
  const [showNewChat, setShowNewChat] = useState(false)
  const [profileId,   setProfileId]   = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Справочник родных — чтобы поиск отвечал с первой буквы, прямо на
  // устройстве. Сервер по-прежнему спрашиваем только от трёх букв: там
  // ищется по-настоящему, с опечатками и по номеру.
  useEffect(() => {
    api.getDirectory()
      .then((list: any[]) => setDirectory((list || []).filter(u => String(u.id) !== String(user.id))))
      .catch(() => setDirectory([]))
  }, [user.id])

  useEffect(() => {
    clearTimeout(timer.current)
    if (query.trim().length < 3) { setSearch([]); setSearching(false); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await api.searchUsers(query.trim())
        setSearch((res || []).filter((u: any) => u.id !== user.id))
      } catch {}
      finally { setSearching(false) }
    }, 300)
  }, [query, user.id])

  const isSearch = query.trim().length > 0

  // Что показать в поиске: свои совпадения по справочнику плюс всё, что
  // дополнительно нашёл сервер. Раньше на одной-двух буквах экран был пуст
  // без единого слова — выглядело так, будто человека нет в приложении.
  const found = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const local = (directory || []).filter(u => u.name.toLowerCase().includes(q))
    const seen = new Set(local.map(u => String(u.id)))
    return [...local, ...searchUsers.filter(u => !seen.has(String(u.id)))]
  }, [query, directory, searchUsers])

  // Свежий разговор — сверху. Сервер уже отдаёт в этом порядке; сортируем и
  // здесь, чтобы порядок не «прыгал» между обновлениями списка.
  const ordered = useMemo(
    () => [...chats].sort((a, b) => activityAt(b).localeCompare(activityAt(a))),
    [chats],
  )

  return (
    <>
      <div className="w-full md:w-[320px] flex-1 md:flex-shrink-0 bg-surface md:border-r border-border flex flex-col relative min-h-0">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <h2 className="text-3xl font-bold text-primary tracking-tight mb-3">Чаты</h2>
          <div className="flex items-center gap-2.5 bg-bg rounded-full px-[18px] h-[48px] shadow-soft">
            <IconSearch size={20} stroke={1.8} className="text-muted flex-shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск"
              className="flex-1 bg-transparent outline-none text-primary placeholder:text-muted text-md"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-none py-1 pb-24">
          {isSearch ? (
            <>
              {found.map(u => (
                <div key={u.id} onClick={() => { onStartChat(u.id); setQuery('') }}
                  className="flex items-center gap-3.5 px-3 py-2.5 mx-1.5 my-px rounded-2xl cursor-pointer hover:bg-bg transition-colors">
                  <div onClick={e => { e.stopPropagation(); setProfileId(u.id) }} className="flex-shrink-0">
                    <Avatar name={u.name} id={u.id} imageUrl={u.image_url} isActive={u.is_active} size={48} />
                  </div>
                  <div className="text-lg font-bold text-primary ellipsis">{u.name}</div>
                </div>
              ))}
              {found.length === 0 && (
                <p className="text-md text-muted px-4 py-4 text-center">
                  {searching ? 'Ищем…' : 'Никого с таким именем нет'}
                </p>
              )}
            </>
          ) : (
            <>
              {/* Один список без деления на «Личные» и «Группы»: группа и так
                  узнаётся — у неё название вместо имени и общее фото. */}
              {ordered.map(c => (
                <ChatItem key={c.id} chat={c} myId={user.id} isActive={c.id === activeChatId}
                  preview={previews[c.id] || ''}
                  onClick={() => onOpenChat(c.id)}
                  onAvatarClick={() => {
                    const isGroup = (c.members?.length || 0) > 2
                    const other = c.members?.find(m => String(m.id) !== String(user.id))
                    if (!isGroup && other) setProfileId(other.id)
                  }}
                />
              ))}
              {chats.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <p className="text-lg font-bold text-primary mb-1">Здесь пока пусто</p>
                  <p className="text-md text-muted">Нажмите кнопку с карандашом внизу справа и выберите, кому написать.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* «Написать» — то, ради чего мессенджер и открывают */}
        <button
          onClick={() => setShowNewChat(true)}
          aria-label="Написать"
          className="absolute right-4 bottom-4 w-16 h-16 rounded-full bg-accent text-onAccent flex items-center justify-center shadow-pop transition-opacity hover:opacity-90"
        >
          <IconPencilPlus size={26} stroke={1.9} />
        </button>
      </div>

      {showNewChat && (
        <NewChatSheet
          myId={user.id}
          onClose={() => setShowNewChat(false)}
          onPick={uid => { setShowNewChat(false); onStartChat(uid) }}
          onNewGroup={() => { setShowNewChat(false); setShowGroup(true) }}
        />
      )}

      {showGroup && (
        <GroupChatModal
          currentUserId={user.id}
          onClose={() => setShowGroup(false)}
          onCreate={async (data) => {
            await onStartChat(null, data)
            setShowGroup(false)
          }}
        />
      )}

      {profileId && (
        <ProfileModal
          userId={profileId}
          isMe={profileId === user.id}
          onClose={() => setProfileId(null)}
          onStartChat={uid => { onStartChat(uid); setProfileId(null) }}
        />
      )}
    </>
  )
}
