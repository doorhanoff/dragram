import React, { useState, useEffect, useRef } from 'react'
import { IconSearch, IconUsersGroup } from '@tabler/icons-react'
import Avatar from '../ui/Avatar'
import ProfileModal from '../ui/ProfileModal'
import GroupChatModal from './GroupChatModal'
import type { Chat, User } from '../../types'
import { api } from '../../api'

function chatName(chat: Chat, myId: string): string {
  if (chat.name) return chat.name
  const other = chat.members?.find(m => String(m.id) !== String(myId))
  return other?.name || `Чат ${chat.id.slice(0, 6)}`
}

function fmtTime(dt?: string): string {
  if (!dt) return ''
  const d = new Date(dt)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

interface ChatListProps {
  user: User
  chats: Chat[]
  activeChatId: string | null
  onOpenChat: (id: string) => void
  onStartChat: (userId: string | null, data?: any) => void
}

interface ChatItemProps {
  chat: Chat
  myId: string
  isActive: boolean
  onClick: () => void
  onAvatarClick: () => void
}

function ChatItem({ chat, myId, isActive, onClick, onAvatarClick }: ChatItemProps) {
  const name     = chatName(chat, myId)
  const other    = chat.members?.find(m => String(m.id) !== String(myId))
  const isGroup  = (chat.members?.length || 0) > 2
  const imgUrl   = isGroup ? chat.image_url : other?.image_url
  const isOnline = !isGroup && other?.is_active

  return (
    <div
      onClick={onClick}
      className={[
        'flex items-center gap-2 px-[9px] py-[7px] mx-[5px] my-px rounded-lg cursor-pointer transition-colors',
        isActive ? 'bg-accent-light' : 'hover:bg-bg',
      ].join(' ')}
    >
      <div onClick={e => { e.stopPropagation(); onAvatarClick() }} className="cursor-pointer">
        <Avatar name={name} id={chat.id} imageUrl={imgUrl} isActive={isOnline} size={34} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span className={`text-md font-medium ellipsis ${isActive ? 'text-accent' : 'text-primary'}`}>{name}</span>
          <span className="text-xs text-[#ccc] flex-shrink-0">{fmtTime(chat.created_at)}</span>
        </div>
        <div className="text-sm text-muted ellipsis">
          {isGroup ? `${chat.members?.length || 0} участн.` : (other?.phone_number || '')}
        </div>
      </div>
    </div>
  )
}

export default function ChatList({ user, chats, activeChatId, onOpenChat, onStartChat }: ChatListProps) {
  const [query,       setQuery]       = useState('')
  const [searchUsers, setSearch]      = useState<any[]>([])
  const [searching,   setSearching]   = useState(false)
  const [showGroup,   setShowGroup]   = useState(false)
  const [profileId,   setProfileId]   = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(timer.current)
    if (!query.trim()) { setSearch([]); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await api.searchUsers(query.trim())
        setSearch((res || []).filter((u: any) => u.id !== user.id))
      } catch {}
      finally { setSearching(false) }
    }, 300)
  }, [query, user.id])

  const personal = chats.filter(c => (c.members?.length || 0) <= 2)
  const groups   = chats.filter(c => (c.members?.length || 0) > 2)
  const isSearch = query.trim().length > 0

  return (
    <>
      <div className="w-full md:w-[230px] flex-1 md:flex-shrink-0 bg-surface border-r border-border flex flex-col">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-medium text-primary">Чаты</h2>
            <button
              onClick={() => setShowGroup(true)}
              title="Новая группа"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:bg-bg hover:text-accent transition-colors"
            >
              <IconUsersGroup size={16} stroke={1.5} />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-bg rounded-lg px-3 py-[7px]">
            <IconSearch size={14} stroke={1.5} className="text-[#bbb] flex-shrink-0" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск"
              className="flex-1 bg-transparent outline-none text-primary placeholder:text-muted"
              style={{ fontSize: 12 }}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-none py-1">
          {isSearch ? (
            <>
              {searching && <p className="text-xs text-muted px-4 py-2">Поиск…</p>}
              {searchUsers.map(u => (
                <div key={u.id} onClick={() => { onStartChat(u.id); setQuery('') }}
                  className="flex items-center gap-2 px-[9px] py-[7px] mx-[5px] my-px rounded-lg cursor-pointer hover:bg-bg transition-colors">
                  <div onClick={e => { e.stopPropagation(); setProfileId(u.id) }}>
                    <Avatar name={u.name} id={u.id} imageUrl={u.image_url} isActive={u.is_active} size={34} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-md font-medium text-primary ellipsis">{u.name}</div>
                    <div className="text-sm text-muted ellipsis">{u.phone_number}</div>
                  </div>
                </div>
              ))}
              {!searching && searchUsers.length === 0 && <p className="text-xs text-muted px-4 py-2">Никого не найдено</p>}
            </>
          ) : (
            <>
              {personal.length > 0 && (
                <>
                  <p className="text-xs font-medium text-[#bbb] uppercase tracking-wider px-4 pt-3 pb-1">Личные</p>
                  {personal.map(c => (
                    <ChatItem key={c.id} chat={c} myId={user.id} isActive={c.id === activeChatId}
                      onClick={() => onOpenChat(c.id)}
                      onAvatarClick={() => {
                        const other = c.members?.find(m => String(m.id) !== String(user.id))
                        if (other) setProfileId(other.id)
                      }}
                    />
                  ))}
                </>
              )}
              {groups.length > 0 && (
                <>
                  <p className="text-xs font-medium text-[#bbb] uppercase tracking-wider px-4 pt-3 pb-1">Группы</p>
                  {groups.map(c => (
                    <ChatItem key={c.id} chat={c} myId={user.id} isActive={c.id === activeChatId}
                      onClick={() => onOpenChat(c.id)}
                      onAvatarClick={() => {}}
                    />
                  ))}
                </>
              )}
              {chats.length === 0 && (
                <p className="text-xs text-muted px-4 py-4 text-center">Нет чатов.<br/>Найдите кого-нибудь через поиск.</p>
              )}

            </>
          )}
        </div>
      </div>

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
