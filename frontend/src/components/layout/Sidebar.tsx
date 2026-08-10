import React from 'react'
import { IconMessage2, IconLayoutList, IconUserCircle, IconPhoto } from '@tabler/icons-react'
import type { NavSection, User } from '../../types'
import { mediaSrc } from '../../api'

interface Props {
  user: User
  active: NavSection
  onNavigate: (s: NavSection) => void
}

function NavBtn({ icon, isActive, onClick, title }: {
  icon: React.ReactNode; isActive?: boolean; onClick?: () => void; title?: string
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={[
        'w-12 h-12 rounded-2xl flex items-center justify-center transition-colors',
        isActive
          ? 'bg-accent text-onAccent shadow-pop'
          : 'text-white/55 hover:bg-white/10 hover:text-white/85',
      ].join(' ')}
    >
      {icon}
    </button>
  )
}

export default function Sidebar({ user, active, onNavigate }: Props) {
  const initials = (user.name || '?').split(' ').slice(0, 2).map(w => w[0]?.toUpperCase()).join('')

  return (
    <aside className="w-[72px] flex-shrink-0 bg-sidebar flex flex-col items-center py-4 gap-1.5">
      <button className="mb-3 cursor-pointer" title="Профиль" onClick={() => onNavigate('profile')}>
        {user.image_url
          ? <img src={mediaSrc(user.image_url)} className="w-[42px] h-[42px] rounded-full object-cover" alt={user.name} />
          : <div className="w-[42px] h-[42px] rounded-full bg-accent flex items-center justify-center text-onAccent font-bold select-none" style={{ fontSize: 16 }}>
              {initials}
            </div>
        }
      </button>

      <NavBtn icon={<IconMessage2 size={22} stroke={1.7} />}   isActive={active === 'chats'}   onClick={() => onNavigate('chats')}   title="Чаты" />
      <NavBtn icon={<IconLayoutList size={22} stroke={1.7} />} isActive={active === 'posts'}   onClick={() => onNavigate('posts')}   title="Лента" />
      <NavBtn icon={<IconPhoto size={22} stroke={1.7} />}      isActive={active === 'albums'}  onClick={() => onNavigate('albums')}  title="Альбомы" />

      {/* Выход убран из постоянно видимого ряда: он почти необратим для
          пожилого человека и живёт теперь пунктом внутри профиля. */}
      <div className="mt-auto">
        <NavBtn icon={<IconUserCircle size={22} stroke={1.7} />} isActive={active === 'profile'} onClick={() => onNavigate('profile')} title="Профиль" />
      </div>
    </aside>
  )
}
