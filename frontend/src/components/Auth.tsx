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
          <div className="w-[88px] h-[88px] rounded-[28px] bg-gradient-to-br from-accent2 to-accent mx-auto mb-4 flex items-center justify-center shadow-pop">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <h1 className="text-3xl font-black text-primary tracking-tight">Dragram</h1>
          <p className="text-lg font-bold text-muted mt-1.5">Приватный мессенджер</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-surface2 rounded-2xl p-1.5 mb-4">
          {(['login', 'register'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setError('') }}
              className="flex-1 py-2.5 rounded-xl text-md font-extrabold transition-colors"
              style={tab === t ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 2px 8px -3px var(--shadow)' } : { color: 'var(--muted)' }}>
              {t === 'login' ? 'Войти' : 'Регистрация'}
            </button>
          ))}
        </div>

        <form onSubmit={tab === 'login' ? handleLogin : handleRegister} className="flex flex-col gap-2.5">
          {tab === 'register' && (
            <>
              {/* Avatar */}
              <div className="flex justify-center mb-2">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-full flex items-center justify-center relative overflow-hidden bg-surface border-2 border-dashed border-border hover:border-accent transition-colors">
                  {avatarPv
                    ? <img src={avatarPv} className="w-full h-full object-cover" alt="" />
                    : <IconCamera size={24} stroke={1.5} className="text-muted" />
                  }
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickAvatar} />
              </div>
              <div className="h-14 bg-surface border border-border rounded-2xl flex items-center gap-3 px-[18px]">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Имя" required
                  className="flex-1 bg-transparent text-lg font-bold text-primary outline-none placeholder:text-muted placeholder:font-semibold" />
              </div>
              <div className="h-14 bg-surface border border-border rounded-2xl flex items-center gap-3 px-[18px]">
                <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="О себе (необязательно)"
                  className="flex-1 bg-transparent text-lg font-bold text-primary outline-none placeholder:text-muted placeholder:font-semibold" />
              </div>
            </>
          )}
          <div className="h-14 bg-surface border border-border rounded-2xl flex items-center gap-3 px-[18px]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M22 16.9v2a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 1h2a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.8 2 2 0 0 1-.5 2.1L7.1 8.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4 12.8 12.8 0 0 0 2.8.7 2 2 0 0 1 1.7 2z"/></svg>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 916 555-08-21" required type="tel"
              className="flex-1 bg-transparent text-lg font-bold text-primary outline-none placeholder:text-muted placeholder:font-semibold" />
          </div>
          <div className="h-14 bg-surface border border-border rounded-2xl flex items-center gap-3 px-[18px]">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
            <input value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" required type="password" minLength={8}
              className="flex-1 bg-transparent text-lg font-bold text-primary outline-none placeholder:text-muted placeholder:font-semibold" />
          </div>

          {error && <p className="text-sm font-bold text-red-500 text-center mt-1">{error}</p>}

          <button type="submit" disabled={busy}
            className="w-full mt-2 h-14 bg-gradient-to-br from-accent2 to-accent text-onAccent rounded-2xl text-lg font-extrabold shadow-pop transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? '…' : tab === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>
      </div>
    </div>
  )
}
