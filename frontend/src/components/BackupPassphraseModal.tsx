import React, { useState } from 'react'
import { IconShieldLock, IconX } from '@tabler/icons-react'

interface Props {
  mode: 'set' | 'restore'
  onConfirm: (passphrase: string) => Promise<void>
  onSkip: () => void
}

export default function BackupPassphraseModal({ mode, onConfirm, onSkip }: Props) {
  const [pass,    setPass]    = useState('')
  const [confirm, setConfirm] = useState('')
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const isSet = mode === 'set'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (pass.length < 10) { setError('Минимум 10 символов для надёжного бэкапа'); return }
    if (isSet && pass !== confirm) { setError('Пароли не совпадают'); return }
    setLoading(true)
    try {
      await onConfirm(pass)
    } catch (err: any) {
      setError(err.message || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-accent-light px-5 pt-5 pb-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
            <IconShieldLock size={20} stroke={1.5} className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-primary">
              {isSet ? 'Защита ключей E2EE' : 'Восстановление ключей'}
            </h2>
            <p className="text-sm text-muted mt-1 leading-relaxed">
              {isSet
                ? 'Придумайте отдельный пароль для бэкапа ключей шифрования. Он не связан с паролем аккаунта.'
                : 'Введите пароль бэкапа чтобы восстановить ключи шифрования на этом устройстве.'}
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="px-5 py-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wider block mb-1.5">
              {isSet ? 'Пароль бэкапа (≥10 символов)' : 'Пароль бэкапа'}
            </label>
            <input
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Минимум 10 символов"
              className="w-full bg-bg rounded-lg px-3 py-2.5 text-md text-primary outline-none border border-transparent focus:border-accent transition-colors placeholder:text-muted"
              autoFocus
            />
          </div>

          {isSet && (
            <div>
              <label className="text-xs font-medium text-muted uppercase tracking-wider block mb-1.5">Повторите пароль</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Повторите пароль"
                className="w-full bg-bg rounded-lg px-3 py-2.5 text-md text-primary outline-none border border-transparent focus:border-accent transition-colors placeholder:text-muted"
              />
            </div>
          )}

          {isSet && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2.5">
              <p className="text-xs text-yellow-700 leading-relaxed">
                ⚠️ Запомните этот пароль. Без него вы не сможете восстановить переписку на новом устройстве. Он не хранится нигде в открытом виде.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <div className="flex gap-2">
            {isSet && (
              <button type="button" onClick={onSkip}
                className="flex-1 py-2.5 rounded-lg text-sm text-muted border border-border hover:bg-bg transition-colors">
                Пропустить
              </button>
            )}
            <button type="submit" disabled={loading}
              className={`py-2.5 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-text transition-colors disabled:opacity-50 ${isSet ? 'flex-1' : 'w-full'}`}>
              {loading ? '…' : isSet ? 'Сохранить' : 'Восстановить'}
            </button>
          </div>

          {!isSet && (
            <button type="button" onClick={onSkip}
              className="text-xs text-muted text-center hover:text-primary transition-colors">
              Работать без восстановления (старые сообщения будут недоступны)
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
