import React, { useState, useRef } from 'react'
import { IconCamera } from '@tabler/icons-react'
import { api } from '../api'

interface Props { onLogin: (user: any, password: string, isNewAccount?: boolean) => void }

export default function Auth({ onLogin }: Props) {
  const [tab,   setTab]   = useState<'login' | 'register'>('login')
  const [phone, setPhone] = useState('')
  const [pass,  setPass]  = useState('')
  const [name,  setName]  = useState('')
  const [desc,    setDesc]    = useState('')
  const [avatar,  setAvatar]  = useState<File | null>(null)
  const [avatarPv,setAvatarPv]= useState<string | null>(null)
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      await api.login(phone, pass)
      onLogin(await api.getMe(), pass)
    } catch (err: any) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true)
    try {
      await api.register({ name, phone_number: phone, password: pass, description: desc.trim() || null })
      await api.login(phone, pass)
      if (avatar) await api.uploadAvatar(avatar).catch(() => {})
      onLogin(await api.getMe(), pass, true)
    } catch (err: any) { setError(err.message) }
    finally { setBusy(false) }
  }

  function pickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setAvatar(f); setAvatarPv(URL.createObjectURL(f))
    e.target.value = ''
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent mx-auto mb-3 flex items-center justify-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h1 className="text-xl font-medium text-primary">Dragram</h1>
          <p className="text-sm text-muted mt-1">Приватный мессенджер</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-border/30 rounded-xl p-1 mb-6">
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-surface text-primary shadow-sm' : 'text-muted'}`}>
              {t === 'login' ? 'Войти' : 'Регистрация'}
            </button>
          ))}
        </div>

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} className="bg-surface rounded-2xl p-6 shadow-sm border border-border flex flex-col gap-4">
          {tab === 'register' && (
            <>
              {/* Avatar */}
              <div className="flex justify-center">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-16 h-16 rounded-full flex items-center justify-center relative overflow-hidden bg-bg border-2 border-dashed border-border hover:border-accent transition-colors">
                  {avatarPv
                    ? <img src={avatarPv} className="w-full h-full object-cover" alt="" />
                    : <IconCamera size={22} stroke={1.5} className="text-muted" />
                  }
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted uppercase tracking-wider block mb-1.5">Имя *</label>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Иван Иванов" required
                  className="w-full bg-bg rounded-lg px-3 py-2.5 text-md text-primary outline-none border border-transparent focus:border-accent transition-colors placeholder:text-muted" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted uppercase tracking-wider block mb-1.5">
                  О себе <span className="normal-case text-[10px]">(необязательно)</span>
                </label>
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Пара слов о себе"
                  className="w-full bg-bg rounded-lg px-3 py-2.5 text-md text-primary outline-none border border-transparent focus:border-accent transition-colors placeholder:text-muted" />
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wider block mb-1.5">Телефон</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+79001234567" required type="tel"
              className="w-full bg-bg rounded-lg px-3 py-2.5 text-md text-primary outline-none border border-transparent focus:border-accent transition-colors placeholder:text-muted" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted uppercase tracking-wider block mb-1.5">Пароль</label>
            <input value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required type="password" minLength={8}
              className="w-full bg-bg rounded-lg px-3 py-2.5 text-md text-primary outline-none border border-transparent focus:border-accent transition-colors placeholder:text-muted" />
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <button type="submit" disabled={busy}
            className="w-full bg-accent text-white rounded-lg py-2.5 text-sm font-medium hover:bg-accent-text transition-colors disabled:opacity-50">
            {busy ? '…' : tab === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>
      </div>
    </div>
  )
}
