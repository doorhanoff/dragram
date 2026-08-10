import React, { useState, useRef } from 'react'
import { IconCamera, IconEye, IconEyeOff } from '@tabler/icons-react'
import { api } from '../api'
import { formatPhoneInput, phoneIsComplete, humanAuthError } from '../utils'
import { ask } from './ui/dialogs'

const MIN_PASSWORD = 8

interface Props { onLogin: (user: any, password: string, isNewAccount?: boolean) => void }

export default function Auth({ onLogin }: Props) {
  const [tab,   setTab]   = useState<'login' | 'register'>('login')
  const [phone, setPhone] = useState('')
  const [pass,  setPass]  = useState('')
  const [showPass, setShowPass] = useState(false)
  const [name,  setName]  = useState('')
  const [desc,    setDesc]    = useState('')
  const [avatar,  setAvatar]  = useState<File | null>(null)
  const [avatarPv,setAvatarPv]= useState<string | null>(null)
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Наружу уходят только цифры: маска — это про то, как человеку набирать,
  // а не про то, что хранится.
  const phoneDigits = () => '+' + phone.replace(/\D/g, '')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!phoneIsComplete(phone)) { setError('Введите номер целиком — 10 цифр после +7'); return }
    setBusy(true)
    try {
      await api.login(phoneDigits(), pass)
      onLogin(await api.getMe(), pass)
    } catch (err: any) { setError(humanAuthError(err?.message)) }
    finally { setBusy(false) }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); setError('')
    if (!phoneIsComplete(phone)) { setError('Введите номер целиком — 10 цифр после +7'); return }
    if (pass.length < MIN_PASSWORD) { setError(`Пароль должен быть не короче ${MIN_PASSWORD} символов`); return }

    // Восстановления пароля нет и быть не может: им же расшифровывается
    // переписка. Об этом надо предупредить ДО регистрации, а не после.
    const ok = await ask({
      title: 'Запишите пароль',
      text: 'Восстановить его нельзя: этим же паролем открывается ваша переписка. Забудете — придётся заводить аккаунт заново, и старые сообщения не вернутся. Запишите его на бумаге и уберите в надёжное место.',
      confirmLabel: 'Записал(а), продолжаем',
      cancelLabel: 'Сначала запишу',
    })
    if (!ok) return

    setBusy(true)
    try {
      await api.register({ name, phone_number: phoneDigits(), password: pass, description: desc.trim() || null })
      await api.login(phoneDigits(), pass)
      if (avatar) await api.uploadAvatar(avatar).catch(() => {})
      onLogin(await api.getMe(), pass, true)
    } catch (err: any) { setError(humanAuthError(err?.message)) }
    finally { setBusy(false) }
  }

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setAvatar(f); setAvatarPv(URL.createObjectURL(f))
    e.target.value = ''
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-sm py-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-[88px] h-[88px] rounded-[28px] bg-accent mx-auto mb-4 flex items-center justify-center shadow-pop">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-primary tracking-tight">Dragram</h1>
          <p className="text-lg text-muted mt-1.5">Приватный мессенджер</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-surface2 rounded-2xl p-1.5 mb-4">
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }}
              className="flex-1 rounded-xl text-md font-bold transition-colors"
              style={{ minHeight: 44, ...(tab === t ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 2px 8px -3px var(--shadow)' } : { color: 'var(--muted)' }) }}>
              {t === 'login' ? 'Войти' : 'Регистрация'}
            </button>
          ))}
        </div>

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} className="flex flex-col gap-3">
          {tab === 'register' && (
            <>
              <div className="flex justify-center mb-1">
                <button type="button" onClick={() => fileRef.current?.click()} aria-label="Ваше фото"
                  className="w-24 h-24 rounded-full flex items-center justify-center relative overflow-hidden bg-surface border-2 border-dashed border-border hover:border-accent transition-colors">
                  {avatarPv
                    ? <img src={avatarPv} className="w-full h-full object-cover" alt="" />
                    : <IconCamera size={26} stroke={1.6} className="text-muted" />
                  }
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
              </div>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Как вас зовут" required
                minLength={2} maxLength={50} className="field" />
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="О себе (необязательно)"
                maxLength={200} className="field" />
            </>
          )}

          <div>
            {/* Маска расставляет скобки и дефисы по мере набора, и «+7» уже
                стоит в поле: сомнений «в каком виде писать» не остаётся. */}
            <input
              value={phone}
              onChange={e => setPhone(formatPhoneInput(e.target.value))}
              onFocus={() => { if (!phone) setPhone('+7') }}
              placeholder="+7 (___) ___-__-__"
              required
              type="tel"
              inputMode="numeric"
              className="field tabular-nums"
            />
          </div>

          <div>
            <div className="relative">
              {/* Слово «Пароль», а не •••••••• : прежняя подсказка выглядела
                  ровно как уже введённый пароль, человек жал «Войти» и
                  получал ошибку, не понимая, что не так. */}
              <input
                value={pass}
                onChange={e => setPass(e.target.value)}
                placeholder="Пароль"
                required
                type={showPass ? 'text' : 'password'}
                minLength={MIN_PASSWORD}
                maxLength={128}
                className="field pr-14"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? 'Скрыть пароль' : 'Показать пароль'}
                className="absolute right-0 top-0 h-full tap rounded-2xl text-muted"
              >
                {showPass ? <IconEyeOff size={22} stroke={1.8} /> : <IconEye size={22} stroke={1.8} />}
              </button>
            </div>
            {tab === 'register' && (
              <p className="text-md text-muted mt-1.5 px-1">Не меньше {MIN_PASSWORD} символов.</p>
            )}
          </div>

          {error && <p className="text-md font-bold text-danger text-center">{error}</p>}

          <button type="submit" disabled={busy} className="btn btn-primary w-full mt-1" style={{ minHeight: 56 }}>
            {busy ? '…' : tab === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>

          {tab === 'login' && (
            <p className="text-md text-muted text-center leading-relaxed mt-1">
              Забыли пароль? Восстановить его нельзя — им открывается ваша переписка.
              Попросите того, кто дал вам приложение, помочь завести новый аккаунт.
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
