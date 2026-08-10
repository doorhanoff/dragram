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

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-5 overflow-y-auto">
      <div className="w-full max-w-[420px] py-8">
        <div className="text-center mb-7">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-accent flex items-center justify-center shadow-pop">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent, #fff)" strokeWidth="2" strokeLinecap="round">
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Dragram</h1>
          <p className="text-lg text-muted mt-1.5">Только для своих</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2">
          <label className="text-md text-muted px-1" htmlFor="gate-birthday">
            День рождения Василия Ивановича
          </label>
          {/* Пример формата прямо в подсказке: даже зная ответ, непонятно,
              писать «16.08» или «16 августа». Сервер принимает и то и другое,
              но человек об этом не знает. */}
          <input id="gate-birthday" value={birthday} onChange={e => setBirthday(e.target.value)}
            placeholder="например, 16.08" required maxLength={100}
            autoComplete="off" className="field" />

          <label className="text-md text-muted px-1 mt-3" htmlFor="gate-creator">
            Имя создателя мессенджера Dragram
          </label>
          <input id="gate-creator" value={creator} onChange={e => setCreator(e.target.value)}
            placeholder="например, Иванов Иван Иванович" required maxLength={200}
            autoComplete="off" className="field" />

          {error && <p className="text-md font-bold text-danger text-center mt-1">{error}</p>}

          <button type="submit" disabled={busy} className="btn btn-primary w-full mt-3" style={{ minHeight: 56 }}>
            {busy ? '…' : 'Войти'}
          </button>

          {/* Из-за двери раньше не было выхода: не знаешь ответ — тупик. */}
          <p className="text-md text-muted text-center leading-relaxed mt-4">
            Не знаете ответ? Спросите у того, кто дал вам приложение — он подскажет.
            Регистр букв, «ё» и лишние пробелы значения не имеют.
          </p>
        </form>
      </div>
    </div>
  )
}
