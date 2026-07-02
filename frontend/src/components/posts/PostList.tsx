import React from 'react'
import { IconWorld, IconUsers, IconBookmark, IconSearch, IconPlus } from '@tabler/icons-react'

type Filter = 'all' | 'friends' | 'saved'

interface Props {
  filter: Filter
  onFilter: (f: Filter) => void
  query: string
  onQuery: (q: string) => void
  onCreatePost: () => void
}

interface FilterItemProps {
  icon: React.ReactNode
  label: string
  sub: string
  isActive: boolean
  onClick: () => void
}

function FilterItem({ icon, label, sub, isActive, onClick }: FilterItemProps) {
  return (
    <div
      onClick={onClick}
      className={[
        'flex items-center gap-3 px-3 py-[9px] mx-1.5 my-px rounded-2xl cursor-pointer transition-colors',
        isActive ? 'shadow-soft' : 'hover:bg-bg',
      ].join(' ')}
      style={isActive ? { background: 'var(--surface2)' } : undefined}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-gradient-to-br from-accent2 to-accent text-onAccent' : 'bg-bg text-muted'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className={`text-md font-extrabold ${isActive ? 'text-accent' : 'text-primary'}`}>{label}</div>
        <div className="text-xs font-semibold text-muted ellipsis">{sub}</div>
      </div>
    </div>
  )
}

export default function PostList({ filter, onFilter, query, onQuery, onCreatePost }: Props) {
  return (
    <div className="w-[280px] flex-shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="px-5 pt-5 pb-2">
        <h2 className="text-3xl font-black text-primary tracking-tight mb-4">Посты</h2>
        <div className="flex items-center gap-2.5 bg-bg rounded-full px-[18px] h-[46px] shadow-soft">
          <IconSearch size={18} stroke={1.8} className="text-muted flex-shrink-0" />
          <input
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="Поиск"
            className="flex-1 bg-transparent outline-none text-primary placeholder:text-muted font-semibold text-md"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-none py-1">
        <FilterItem icon={<IconWorld size={15} stroke={1.5} />}    label="Все посты"    sub="от всех"          isActive={filter === 'all'}     onClick={() => onFilter('all')} />
        <FilterItem icon={<IconUsers size={15} stroke={1.5} />}    label="Друзья"       sub="только контакты" isActive={filter === 'friends'} onClick={() => onFilter('friends')} />
        <FilterItem icon={<IconBookmark size={15} stroke={1.5} />} label="Сохранённые" sub="мои закладки"    isActive={filter === 'saved'}   onClick={() => onFilter('saved')} />
      </div>
    </div>
  )
}
