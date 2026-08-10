import React from 'react'
import { IconArrowLeft, IconCheck, IconSun, IconMoon, IconDeviceMobile } from '@tabler/icons-react'
import { useTheme, MIN_SCALE, MAX_SCALE, type Palette, type ThemeMode } from '../../theme'
import { useBackHandler } from '../../hooks/useBackHandler'

interface PaletteInfo { id: Palette; label: string }

const PALETTES: PaletteInfo[] = [
  { id: 'hearth', label: 'Очаг' },
  { id: 'forest', label: 'Лес' },
  { id: 'sky',    label: 'Небо' },
]

/** Цвета палитры в светлой теме — чтобы показать, а не описать словами.
 *  «Терракота и крем» красиво, но требует знать эти слова, а три кружка
 *  рядом не показывают, как будет выглядеть переписка. */
const PREVIEW: Record<Palette, { bg: string; incoming: string; text: string; accent: string; onAccent: string }> = {
  hearth: { bg: '#FAF4EC', incoming: '#FFFFFF', text: '#3A2A1E', accent: '#AC5226', onAccent: '#FFFFFF' },
  forest: { bg: '#F0F4EE', incoming: '#FFFFFF', text: '#2C342A', accent: '#4C6B3C', onAccent: '#FFFFFF' },
  sky:    { bg: '#F1F5F7', incoming: '#FFFFFF', text: '#283238', accent: '#3D6478', onAccent: '#FFFFFF' },
}

const MODES: { id: ThemeMode; label: string; icon: React.ReactNode }[] = [
  // «Как в телефоне» первой и по умолчанию: человек с тёмной темой в телефоне
  // не должен получать единственное приложение со светлым экраном.
  { id: 'system', label: 'Как в телефоне', icon: <IconDeviceMobile size={20} stroke={1.8} /> },
  { id: 'light',  label: 'Светлая',        icon: <IconSun size={20} stroke={1.8} /> },
  { id: 'dark',   label: 'Тёмная',         icon: <IconMoon size={20} stroke={1.8} /> },
]

function ChatPreview({ palette }: { palette: Palette }) {
  const c = PREVIEW[palette]
  return (
    <div className="rounded-2xl p-2.5 flex flex-col gap-1.5 w-[120px] flex-shrink-0" style={{ background: c.bg }}>
      <div className="self-start rounded-[14px] rounded-bl-[4px] px-2.5 py-1.5 text-[11px]" style={{ background: c.incoming, color: c.text }}>
        Как дела?
      </div>
      <div className="self-end rounded-[14px] rounded-br-[4px] px-2.5 py-1.5 text-[11px]" style={{ background: c.accent, color: c.onAccent }}>
        Хорошо!
      </div>
    </div>
  )
}

export default function AppearanceScreen({ onBack }: { onBack: () => void }) {
  const { palette, mode, scale, setPalette, setMode, setScale } = useTheme()
  useBackHandler(onBack)

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-bg">
      <div className="max-w-xl mx-auto px-4 pt-4 pb-8">
        <div className="flex items-center gap-1 mb-4">
          <button onClick={onBack} aria-label="Назад" className="tap rounded-2xl text-accent">
            <IconArrowLeft size={26} stroke={2.2} />
          </button>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Внешний вид</h1>
        </div>

        {/* Палитра */}
        <div className="mb-6">
          <div className="text-md text-muted mb-2">Цвета</div>
          <div className="flex flex-col gap-2.5">
            {PALETTES.map(p => {
              const active = palette === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => setPalette(p.id)}
                  className="flex items-center gap-3.5 bg-surface rounded-card p-3 text-left w-full"
                  style={{ border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}` }}
                >
                  <ChatPreview palette={p.id} />
                  <span className="flex-1 text-xl font-bold text-primary">{p.label}</span>
                  {active && (
                    <span className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-onAccent flex-shrink-0">
                      <IconCheck size={18} stroke={3} />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-sm text-muted mt-2">
            Значок Dragram на рабочем столе сменит цвет, когда вы закроете приложение.
          </p>
        </div>

        {/* Тема */}
        <div className="mb-6">
          <div className="text-md text-muted mb-2">Тема</div>
          <div className="flex flex-col gap-2">
            {MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className="row-item"
                style={mode === m.id ? { background: 'var(--surface2)', border: '2px solid var(--accent)' } : { border: '2px solid transparent' }}
              >
                <span className="text-accent flex-shrink-0">{m.icon}</span>
                <span className="flex-1 text-lg font-bold">{m.label}</span>
                {mode === m.id && <IconCheck size={20} stroke={3} className="text-accent" />}
              </button>
            ))}
          </div>
        </div>

        {/* Размер текста. Ползунок с образцом вместо трёх слов, из которых
            «Обычный» означал ×0,9 — то есть мельче того, что человек уже
            видит, а «Крупный» и «Большой» были синонимами. */}
        <div>
          <div className="text-md text-muted mb-2">Размер текста</div>
          <div className="bg-surface rounded-card p-4">
            <p className="text-primary leading-relaxed mb-4" style={{ fontSize: `${scale}rem` }}>
              Так будет выглядеть текст сообщений.
            </p>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.05}
              value={scale}
              onChange={e => setScale(Number(e.target.value))}
              aria-label="Размер текста"
              className="w-full"
              style={{ accentColor: 'var(--accent)', height: 40 }}
            />
            <div className="flex justify-between text-sm text-muted">
              <span>Обычный</span>
              <span>Очень крупный</span>
            </div>
          </div>
        </div>

        <p className="text-md text-muted leading-relaxed mt-6">
          Настройки применяются сразу ко всему приложению. Каждый член семьи выбирает оформление под себя.
        </p>
      </div>
    </div>
  )
}
