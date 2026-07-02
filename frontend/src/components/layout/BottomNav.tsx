import React from 'react'
import { IconMessage2, IconLayoutList, IconUserCircle, IconPhoto } from '@tabler/icons-react'
import type { NavSection } from '../../types'

interface BottomNavProps {
  active: NavSection
  onNavigate: (s: NavSection) => void
  unread?: number
  onProfile?: () => void
}

interface TabProps {
  icon: React.ReactNode
  label: string
  isActive: boolean
  badge?: number
  onClick: () => void
}

function Tab({ icon, label, isActive, badge, onClick }: TabProps) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1 py-2 rounded-2xl transition-colors"
      style={isActive ? { background: 'var(--surface2)' } : undefined}
    >
      <div className="relative">
        <span className={isActive ? 'text-accent' : 'text-muted'}>{icon}</span>
        {!!badge && (
          <span className="absolute -top-1 -right-2 bg-badge text-onAccent rounded-full px-1 leading-none"
            style={{ fontSize: 9, minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className={`text-2xs font-bold ${isActive ? 'text-accent' : 'text-muted'}`}>{label}</span>
    </button>
  )
}

export default function BottomNav({ active, onNavigate, unread, onProfile }: BottomNavProps) {
  return (
    <nav className="flex items-center gap-1.5 px-3 pt-2 pb-safe flex-shrink-0" style={{ background: 'var(--nav)', backdropFilter: 'blur(14px)', borderTop: '1px solid var(--border)' }}>
      <Tab icon={<IconMessage2 size={22} stroke={1.8} />}    label="Чаты"     isActive={active === 'chats'} badge={unread} onClick={() => onNavigate('chats')} />
      <Tab icon={<IconLayoutList size={22} stroke={1.8} />}  label="Посты"    isActive={active === 'posts'} onClick={() => onNavigate('posts')} />
      <Tab icon={<IconPhoto size={22} stroke={1.8} />}       label="Альбомы"  isActive={active === 'albums'} onClick={() => onNavigate('albums')} />
      <Tab icon={<IconUserCircle size={22} stroke={1.8} />}  label="Профиль"  isActive={false} onClick={() => onProfile?.()} />
    </nav>
  )
}
