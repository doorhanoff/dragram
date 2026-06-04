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
        'flex items-center gap-2 px-[9px] py-[7px] mx-[5px] my-px rounded-lg cursor-pointer transition-colors',
        isActive ? 'bg-accent-light' : 'hover:bg-bg',
      ].join(' ')}
    >
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-accent text-white' : 'bg-bg text-muted'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className={`text-md font-medium ${isActive ? 'text-accent' : 'text-primary'}`}>{label}</div>
        <div className="text-xs text-muted ellipsis">{sub}</div>
      </div>
    </div>
  )
}

export default function PostList({ filter, onFilter, query, onQuery, onCreatePost }: Props) {
  return (
    <div className="w-[230px] flex-shrink-0 bg-surface border-r border-border flex flex-col">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xl font-medium text-primary mb-3">Посты</h2>
        <div className="flex items-center gap-2 bg-bg rounded-lg px-3 py-[7px]">
          <IconSearch size={14} stroke={1.5} className="text-[#bbb] flex-shrink-0" />
          <input
            value={query}
            onChange={e => onQuery(e.target.value)}
            placeholder="Поиск"
            className="flex-1 bg-transparent outline-none text-primary placeholder:text-muted"
            style={{ fontSize: 12 }}
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
