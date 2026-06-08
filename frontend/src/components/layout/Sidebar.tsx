import React from 'react'
import { IconMessage2, IconLayoutList, IconLogout } from '@tabler/icons-react'
import type { NavSection, User } from '../../types'

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
        'w-[38px] h-[38px] rounded-[10px] flex items-center justify-center transition-colors',
        isActive
          ? 'bg-accent text-white'
          : 'text-[#6B6B8A] hover:bg-[#24243E] hover:text-[#aaaacc]',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}

export default function Sidebar({ user, active, onNavigate, onLogout, onProfile }: Props) {
  const initials = (user.name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

  return (
    <aside className="w-[62px] flex-shrink-0 bg-sidebar flex flex-col items-center py-3 gap-1">
      {/* Аватар пользователя */}
      <button className="mb-3 cursor-pointer" title="Профиль" onClick={() => onProfile?.()}>
        {user.image_url
          ? <img src={user.image_url} className="w-[34px] h-[34px] rounded-full object-cover" alt={user.name} />
          : <div className="w-[34px] h-[34px] rounded-full bg-accent flex items-center justify-center text-white select-none" style={{ fontSize: 13 }}>
              {initials}
            </div>
        }
      </button>

      {/* Навигация */}
      <NavBtn icon={<IconMessage2 size={20} stroke={1.5} />}   isActive={active === 'chats'} onClick={() => onNavigate('chats')} title="Чаты" />
      <NavBtn icon={<IconLayoutList size={20} stroke={1.5} />}  isActive={active === 'posts'} onClick={() => onNavigate('posts')} title="Посты" />

      {/* Выход внизу */}
      <div className="mt-auto">
        <NavBtn icon={<IconLogout size={20} stroke={1.5} />} onClick={onLogout} title="Выйти" />
      </div>
    </aside>
  )
}
