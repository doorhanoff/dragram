import React, { useState } from 'react'

interface Props {
  onRestore: (password: string) => Promise<void>
  onSkip: () => void
}

export default function KeyRestoreModal({ onRestore, onSkip }: Props) {
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const handleSubmit = async () => {
    if (!password) return
    setLoading(true)
    setError('')
    try {
      await onRestore(password)
    } catch {
      setError('Неверный пароль или повреждённый бэкап')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text">🔑 Восстановление ключей</h2>
          <p className="text-sm text-text-secondary mt-1">
            Это устройство не имеет ключей шифрования. Введи пароль аккаунта чтобы расшифровать сообщения.
          </p>
        </div>

        <input
          type="password"
          placeholder="Пароль аккаунта"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          className="w-full px-4 py-3 rounded-xl bg-bg border border-border text-text outline-none focus:border-accent"
          autoFocus
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary text-sm"
          >
            Пропустить
          </button>
          <button
            onClick={handleSubmit}
            disabled={!password || loading}
            className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Загрузка...' : 'Восстановить'}
          </button>
        </div>
      </div>
    </div>
  )
}
