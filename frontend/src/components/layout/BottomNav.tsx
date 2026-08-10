import React from 'react'
import { IconMessage2, IconLayoutList, IconUserCircle, IconPhoto } from '@tabler/icons-react'
import type { NavSection } from '../../types'

interface BottomNavProps {
  active: NavSection
  onNavigate: (s: NavSection) => void
  unread?: number
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
      aria-current={isActive ? 'page' : undefined}
      className="flex-1 flex flex-col items-center justify-center gap-1 rounded-2xl transition-colors"
      style={{ minHeight: 56, ...(isActive ? { background: 'var(--surface2)' } : {}) }}
    >
      <div className="relative">
        <span className={isActive ? 'text-accent' : 'text-muted'}>{icon}</span>
        {!!badge && (
          <span className="absolute -top-1.5 -right-2.5 bg-badge text-onAccent rounded-full px-1 leading-none font-bold"
            style={{ fontSize: 12, minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      {/* 12 px, как в Telegram и WhatsApp. Было 9 — и 8,1 при уменьшенном
          масштабе, то есть заведомо нечитаемо. */}
      <span className={`text-2xs font-bold ${isActive ? 'text-accent' : 'text-muted'}`}>{label}</span>
    </button>
  )
}

export default function BottomNav({ active, onNavigate, unread }: BottomNavProps) {
  return (
    <nav className="flex items-center gap-1.5 px-2 pt-1.5 pb-safe flex-shrink-0" style={{ background: 'var(--nav)', backdropFilter: 'blur(14px)', borderTop: '1px solid var(--border)' }}>
      <Tab icon={<IconMessage2 size={24} stroke={1.8} />}    label="Чаты"    isActive={active === 'chats'}  badge={unread} onClick={() => onNavigate('chats')} />
      <Tab icon={<IconLayoutList size={24} stroke={1.8} />}  label="Лента"   isActive={active === 'posts'}  onClick={() => onNavigate('posts')} />
      <Tab icon={<IconPhoto size={24} stroke={1.8} />}       label="Альбомы" isActive={active === 'albums'} onClick={() => onNavigate('albums')} />
      {/* Профиль — такая же вкладка, как остальные: открывает свой экран и
          подсвечивается. Раньше она открывала окошко поверх текущего экрана
          и не подсвечивалась никогда. */}
      <Tab icon={<IconUserCircle size={24} stroke={1.8} />}  label="Профиль" isActive={active === 'profile'} onClick={() => onNavigate('profile')} />
    </nav>
  )
}
