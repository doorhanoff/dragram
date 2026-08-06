import React from 'react'
import { IconMessage2, IconLayoutList, IconLogout, IconPhoto } from '@tabler/icons-react'
import type { NavSection, User } from '../../types'
import { mediaSrc } from '../../api'

interface Props {
  user: User
  active: NavSection
  onNavigate: (s: NavSection) => void
  onLogout: () => void
  onProfile?: () => void
}

function NavBtn({ icon, isActive, onClick, title }: {
  icon: React.ReactNode; isActive?: boolean; onClick?: () => void; title?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={[
        'w-[40px] h-[40px] rounded-2xl flex items-center justify-center transition-colors',
        isActive
          ? 'bg-gradient-to-br from-accent2 to-accent text-onAccent shadow-pop'
          : 'text-white/50 hover:bg-white/10 hover:text-white/80',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}

export default function Sidebar({ user, active, onNavigate, onLogout, onProfile }: Props) {
  const initials = (user.name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

  return (
    <aside className="w-[68px] flex-shrink-0 bg-sidebar flex flex-col items-center py-4 gap-1.5">
      {/* Аватар пользователя */}
      <button className="mb-3 cursor-pointer" title="Профиль" onClick={() => onProfile?.()}>
        {user.image_url
          ? <img src={mediaSrc(user.image_url)} className="w-[38px] h-[38px] rounded-full object-cover" alt={user.name} />
          : <div className="w-[38px] h-[38px] rounded-full bg-gradient-to-br from-accent2 to-accent flex items-center justify-center text-onAccent font-extrabold select-none" style={{ fontSize: 14 }}>
              {initials}
            </div>
        }
      </button>

      {/* Навигация */}
      <NavBtn icon={<IconMessage2 size={20} stroke={1.5} />}   isActive={active === 'chats'} onClick={() => onNavigate('chats')} title="Чаты" />
      <NavBtn icon={<IconLayoutList size={20} stroke={1.5} />}  isActive={active === 'posts'} onClick={() => onNavigate('posts')} title="Посты" />
      <NavBtn icon={<IconPhoto size={20} stroke={1.5} />}       isActive={active === 'albums'} onClick={() => onNavigate('albums')} title="Альбомы" />

      {/* Выход внизу */}
      <div className="mt-auto">
        <NavBtn icon={<IconLogout size={20} stroke={1.5} />} onClick={onLogout} title="Выйти" />
      </div>
    </aside>
  )
}
