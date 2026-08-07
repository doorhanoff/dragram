import React, { useState } from 'react'
import { api } from '../api'

/**
 * Дверь перед сайтом: пока на два вопроса нет верных ответов, приложение
 * не показывает даже форму входа.
 *
 * Здесь только форма. Сравнение целиком на сервере — если бы правильные
 * ответы проверялись тут, они лежали бы в бандле и читались через
 * «посмотреть код». Сервер тоже не отвечает, какое из полей не сошлось:
 * иначе их можно было бы подбирать по одному.
 */
export default function Gate({ onUnlocked }: { onUnlocked: () => void }) {
  const [birthday, setBirthday] = useState('')
  const [creator, setCreator]   = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await api.gateUnlock(birthday.trim(), creator.trim())
      onUnlocked()
    } catch (err: any) {
      setError(
        err.message === '429'
          ? 'Слишком много попыток. Попробуйте позже.'
          : 'Не совпало. Проверьте оба ответа.'
      )
    } finally {
      setBusy(false)
    }
  }

  const field = 'flex-1 bg-transparent text-lg font-bold text-primary outline-none placeholder:text-muted placeholder:font-semibold'
  const box   = 'h-14 bg-surface border border-border rounded-2xl flex items-center gap-3 px-[18px]'

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-5">
      <div className="w-full max-w-[400px]">
        <div className="text-center mb-7">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-accent2 to-accent flex items-center justify-center shadow-pop">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent, #fff)" strokeWidth="2" strokeLinecap="round">
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h1 className="text-3xl font-black text-primary tracking-tight">Dragram</h1>
          <p className="text-lg font-bold text-muted mt-1.5">Только для своих</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2.5">
          <label className="text-sm font-bold text-muted px-1">
            День рождения Василия Ивановича
          </label>
          <div className={box}>
            <input value={birthday} onChange={e => setBirthday(e.target.value)}
              placeholder="день и месяц" required maxLength={100}
              autoComplete="off" className={field} />
          </div>

          <label className="text-sm font-bold text-muted px-1 mt-2">
            Имя создателя мессенджера Dragram
          </label>
          <div className={box}>
            <input value={creator} onChange={e => setCreator(e.target.value)}
              placeholder="фамилия, имя, отчество" required maxLength={200}
              autoComplete="off" className={field} />
          </div>

          {error && <p className="text-sm font-bold text-red-500 text-center mt-1">{error}</p>}

          <button type="submit" disabled={busy}
            className="w-full mt-3 h-14 bg-gradient-to-br from-accent2 to-accent text-onAccent rounded-2xl text-lg font-extrabold shadow-pop transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? '…' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  )
}
