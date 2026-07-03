import React from 'react'
import { IconX, IconCheck } from '@tabler/icons-react'
import { useTheme, type Palette, type Scale } from '../../theme'
import { useBackHandler } from '../../hooks/useBackHandler'

interface PaletteInfo { id: Palette; label: string; sub: string; dots: [string, string, string] }

const PALETTES: PaletteInfo[] = [
  { id: 'hearth', label: 'Очаг',  sub: 'Терракота и крем',  dots: ['#E89B6A', '#D9824E', '#7C9070'] },
  { id: 'forest', label: 'Лес',   sub: 'Шалфей и мох',      dots: ['#90B57C', '#6F8F5C', '#C8B6A6'] },
  { id: 'sky',    label: 'Небо',  sub: 'Спокойный голубой', dots: ['#7FA6BA', '#5E89A0', '#C5CEE0'] },
]

const SCALES: { id: Scale; label: string }[] = [
  { id: 0.9,  label: 'Обычный' },
  { id: 1,    label: 'Крупный' },
  { id: 1.18, label: 'Большой' },
]

interface Props { onClose: () => void }

export default function AppearanceModal({ onClose }: Props) {
  const { palette, dark, scale, setPalette, setDark, setScale } = useTheme()
  useBackHandler(onClose)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-surface rounded-card w-full max-w-md shadow-xl overflow-hidden max-h-[90dvh] flex flex-col">
        <div className="flex justify-between items-center px-5 py-3.5 border-b border-border flex-shrink-0">
          <span className="text-lg font-extrabold text-primary">Внешний вид</span>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-muted hover:bg-bg transition-colors">
            <IconX size={18} stroke={1.5} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 flex flex-col gap-6">
          {/* Палитра */}
          <div>
            <div className="text-xs font-extrabold text-muted uppercase tracking-widest mb-3">Палитра</div>
            <div className="flex flex-col gap-2.5">
              {PALETTES.map(p => {
                const active = palette === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => setPalette(p.id)}
                    className="cursor-pointer flex items-center gap-3.5 bg-bg rounded-2xl px-4 py-3.5 transition-colors"
                    style={{ border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}` }}
                  >
                    <div className="flex flex-shrink-0">
                      {p.dots.map((c, i) => (
                        <div key={i} className="w-7 h-7 rounded-full border-2 border-bg" style={{ background: c, marginLeft: i === 0 ? 0 : -10 }} />
                      ))}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-extrabold text-primary">{p.label}</div>
                      <div className="text-sm font-semibold text-muted">{p.sub}</div>
                    </div>
                    {active && (
                      <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-onAccent flex-shrink-0">
                        <IconCheck size={14} stroke={3} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Тема */}
          <div>
            <div className="text-xs font-extrabold text-muted uppercase tracking-widest mb-3">Тема</div>
            <div className="flex gap-2 bg-surface2 rounded-2xl p-1.5">
              <button
                onClick={() => setDark(false)}
                className="flex-1 text-center rounded-xl py-2.5 text-md font-bold transition-colors"
                style={!dark ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 2px 8px -3px var(--shadow)' } : { color: 'var(--muted)' }}
              >☀️ Светлая</button>
              <button
                onClick={() => setDark(true)}
                className="flex-1 text-center rounded-xl py-2.5 text-md font-bold transition-colors"
                style={dark ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 2px 8px -3px var(--shadow)' } : { color: 'var(--muted)' }}
              >🌙 Тёмная</button>
            </div>
          </div>

          {/* Размер текста */}
          <div>
            <div className="flex justify-between mb-3">
              <span className="text-xs font-extrabold text-muted uppercase tracking-widest">Размер текста</span>
              <span className="text-sm font-extrabold text-accent">{SCALES.find(s => s.id === scale)?.label}</span>
            </div>
            <div className="flex gap-2 bg-surface2 rounded-2xl p-1.5">
              {SCALES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setScale(s.id)}
                  className="flex-1 text-center rounded-xl py-2 font-bold transition-colors"
                  style={scale === s.id ? { background: 'var(--surface)', color: 'var(--text)' } : { color: 'var(--muted)' }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-bg rounded-2xl px-4 py-3.5 text-sm font-semibold text-muted leading-relaxed">
            Настройки применяются сразу ко всему приложению. Каждый член семьи выбирает оформление под себя.
          </div>
        </div>
      </div>
    </div>
  )
}
