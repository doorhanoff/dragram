import React from 'react'
import { IconAddressBook } from '@tabler/icons-react'
import { useBackHandler } from '../../hooks/useBackHandler'

/**
 * Свой экран перед системным запросом на контакты.
 *
 * Первое, что видел человек, войдя в семейный мессенджер, — системное окно
 * «Allow Dragram to access contacts and accounts on this device?»: на
 * английском, без объяснения и без связи с тем, что он только что сделал.
 * Для пожилого пользователя это выглядит как то, на что нельзя соглашаться.
 */
interface Props {
  onAllow: () => void
  onSkip: () => void
}

export default function ContactsIntro({ onAllow, onSkip }: Props) {
  useBackHandler(onSkip)

  return (
    <div className="sheet-backdrop" style={{ zIndex: 70 }}>
      <div className="sheet">
        <div className="p-6 pb-safe flex flex-col items-center text-center gap-3">
          <span className="w-16 h-16 rounded-3xl bg-surface2 flex items-center justify-center text-accent">
            <IconAddressBook size={30} stroke={1.7} />
          </span>
          <h2 className="text-2xl font-bold text-primary">Найти родных, которые уже здесь?</h2>
          <p className="text-md text-muted leading-relaxed">
            Мы посмотрим телефонную книгу и покажем, кто из ваших знакомых уже
            пользуется Dragram. Сами номера никуда не отправляются и нигде не
            сохраняются.
          </p>
          <div className="flex flex-col gap-2 w-full mt-2">
            <button onClick={onAllow} className="btn btn-primary w-full">Найти</button>
            <button onClick={onSkip} className="btn btn-secondary w-full">Не сейчас</button>
          </div>
        </div>
      </div>
    </div>
  )
}
