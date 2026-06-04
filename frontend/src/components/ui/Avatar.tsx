import React from 'react'

const PALETTE = [
  ['#DDE4FF','#3730A3'], ['#D1FAE5','#065F46'], ['#FEE2E2','#991B1B'],
  ['#FEF3C7','#92400E'], ['#EDE9FE','#5B21B6'], ['#CFFAFE','#0E7490'],
  ['#FCE7F3','#9D174D'], ['#F0FDF4','#14532D'],
]

function paletteFrom(id = '') {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return PALETTE[h % PALETTE.length]
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

interface AvatarProps {
  name?: string
  id?: string
  imageUrl?: string | null
  isActive?: boolean
  size?: number
  className?: string
}

export default function Avatar({ name = '', id = '', imageUrl, isActive, size = 34, className = '' }: AvatarProps) {
  const [bg, fg] = paletteFrom(id)
  const style = { width: size, height: size, fontSize: Math.round(size * 0.36) }

  return (
    <div className={`relative flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={name}
          className="rounded-full object-cover w-full h-full"
        />
      ) : (
        <div
          className="rounded-full flex items-center justify-center font-medium select-none"
          style={{ ...style, backgroundColor: bg, color: fg }}
        >
          {initials(name)}
        </div>
      )}
      {isActive && (
        <span
          className="absolute bottom-0 right-0 rounded-full bg-online border-2 border-surface"
          style={{ width: 9, height: 9 }}
        />
      )}
    </div>
  )
}
