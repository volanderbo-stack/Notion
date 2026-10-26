// Налаштування спільної галереї: створити, приєднатися, запросити, учасники
import { useEffect, useState } from 'react'
import { Cloud, CloudOff, Copy, LogOut, RefreshCw, Share2, UserMinus, UserPlus, Users } from 'lucide-react'
import { getState } from '../lib/store'
import { confirm, prompt, toast } from '../lib/ui'
import { cloudConfigured } from '../lib/cloud/config'
import { useCloudStatus, useConn } from '../lib/cloud/state'
import {
  createSpace, inviteLink, joinSpace, leaveSpace, listMembers, newInviteCode, refreshSpace, removeMember, renameMe, syncNow,
} from '../lib/cloud/sync'
import { pluralItems } from '../lib/format'

const time = (ms) => new Date(ms).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })

export default function SharedSection({ joinCode }) {
  const conn = useConn()
  if (!cloudConfigured()) {
    return (
      <section className="card">
        <h3 className="card-title">Спільна галерея</h3>
        <div className="setting-row static">
          <CloudOff size={20} />
          <span className="setting-text">Ще не налаштована<small>Потрібен проєкт Supabase — інструкція в supabase/README.md</small></span>
        </div>
      </section>
    )
  }
  return conn ? <Connected conn={conn} /> : <Connect joinCode={joinCode} />
}

function Connect({ joinCode }) {
  const [mode, setMode] = useState(joinCode ? 'join' : null) // join | create
  const [code, setCode] = useState(joinCode || '')
  const [me, setMe] = useState('')
  const [name, setName] = useState('Спільна галерея')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    if (!me.trim()) return toast('Вкажіть своє ім\'я — його бачитимуть інші')
    const n = getState().items.length
    if (n && !(await confirm({
      title: 'Ваші дані теж стануть спільними',
      text: `${pluralItems(n)} з цього телефону з'являться в спільній галереї. Усі учасники бачитимуть їх, зокрема документи й картки.`,
      ok: 'Продовжити',
    }))) return
    setBusy(true)
    try {
      if (mode === 'join') await joinSpace(code, me.trim())
      else await createSpace(name, me.trim())
      toast(mode === 'join' ? 'Ви в спільній галереї 🎉' : 'Спільну галерею створено — запросіть інших')
    } catch (e) {
      toast(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h3 className="card-title">Спільна галерея</h3>
      <p className="hint">Діліться фото й сердечками з родиною чи колегами: усі бачать те саме, додають і сортують. Фото лишаються й на телефоні — відкриваються без інтернету.</p>
      {!mode ? (
        <div className="shared-actions">
          <button className="btn btn-primary block" onClick={() => setMode('join')}><UserPlus size={18} /> Приєднатися за кодом</button>
          <button className="btn block" onClick={() => setMode('create')}><Users size={18} /> Створити спільну галерею</button>
        </div>
      ) : (
        <div className="form">
          {mode === 'join' ? (
            <input className="input code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Код запрошення" autoCapitalize="characters" spellCheck={false} />
          ) : (
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Назва галереї" maxLength={60} />
          )}
          <input className="input" value={me} onChange={(e) => setMe(e.target.value)} placeholder="Ваше ім'я (бачать інші)" maxLength={40} />
          <button className="btn btn-primary block" onClick={go} disabled={busy || (mode === 'join' && code.trim().length < 6)}>
            {busy ? 'Зачекайте…' : mode === 'join' ? 'Приєднатися' : 'Створити'}
          </button>
          <button className="link-btn" onClick={() => setMode(null)}>Скасувати</button>
        </div>
      )}
    </section>
  )
}

function Connected({ conn }) {
  const status = useCloudStatus()
  const [members, setMembers] = useState(null)

  const loadMembers = () => listMembers().then(setMembers).catch(() => setMembers(null))
  useEffect(() => {
    refreshSpace().catch(() => {})
    loadMembers()
  }, [])

  const link = inviteLink(conn.inviteCode)
  const share = async () => {
    const text = `Приєднуйся до галереї «${conn.spaceName}»: ${link}\nКод: ${conn.inviteCode}`
    if (navigator.share) {
      try { await navigator.share({ title: 'Розумна галерея', text }) } catch { /* скасовано */ }
    } else copy(text)
  }
  const copy = async (text = link) => {
    try { await navigator.clipboard.writeText(text); toast('Скопійовано') } catch { toast(text) }
  }
  const regen = async () => {
    if (!(await confirm({ title: 'Новий код запрошення?', text: 'Старе посилання перестане працювати. Хто вже в галереї — лишиться.', ok: 'Змінити код' }))) return
    try { await newInviteCode(); toast('Код змінено') } catch (e) { toast(e.message) }
  }
  const kick = async (m) => {
    if (!(await confirm({ title: `Прибрати ${m.name || 'учасника'}?`, text: 'Він більше не бачитиме галерею. Щоб не повернувся за старим посиланням — змініть код.', ok: 'Прибрати', danger: true }))) return
    try { await removeMember(m.user_id); loadMembers() } catch (e) { toast(e.message) }
  }
  const rename = async () => {
    const name = await prompt({ title: 'Ваше ім\'я', value: conn.memberName })
    if (name?.trim()) {
      try { await renameMe(name.trim()); loadMembers() } catch (e) { toast(e.message) }
    }
  }
  const leave = async () => {
    if (!(await confirm({ title: 'Вийти зі спільної галереї?', text: 'Фото лишаться на цьому телефоні, але більше не синхронізуватимуться з іншими.', ok: 'Вийти', danger: true }))) return
    await leaveSpace()
    toast('Ви вийшли зі спільної галереї')
  }

  const statusText = {
    syncing: 'Синхронізація…',
    offline: `Без інтернету${status.pending ? ` · ${status.pending} змін чекають` : ''}`,
    error: status.error,
    idle: status.lastSync ? `Синхронізовано о ${time(status.lastSync)}` : 'Підключено',
    off: 'Підключено',
  }[status.state]

  return (
    <section className="card">
      <h3 className="card-title">Спільна галерея</h3>
      <div className="setting-row static">
        {status.state === 'offline' || status.state === 'error' ? <CloudOff size={20} /> : <Cloud size={20} />}
        <span className="setting-text">{conn.spaceName}<small className={status.state === 'error' ? 'danger-text' : ''}>{statusText}</small></span>
        <button className="icon-btn" onClick={syncNow} aria-label="Синхронізувати"><RefreshCw size={18} className={status.state === 'syncing' ? 'spin' : ''} /></button>
      </div>
      {status.tooBig > 0 && <p className="hint">Деякі файли більші за 50 МБ — вони лишились лише на цьому телефоні.</p>}

      <div className="invite">
        <span className="label">Запросити</span>
        <div className="invite-code" onClick={() => copy(conn.inviteCode)}>{conn.inviteCode}</div>
        <div className="shared-actions row">
          <button className="btn btn-primary" onClick={share}><Share2 size={18} /> Надіслати запрошення</button>
          <button className="btn" onClick={() => copy()} aria-label="Копіювати посилання"><Copy size={18} /></button>
        </div>
        <button className="link-btn" onClick={regen}>Змінити код</button>
      </div>

      <span className="label">Учасники{members ? ` · ${members.length}` : ''}</span>
      <div className="members">
        {members?.map((m) => (
          <div key={m.user_id} className="member">
            <span className="member-avatar">{(m.name || '?').slice(0, 1).toUpperCase()}</span>
            <span className="member-name">{m.name || 'Без імені'}{m.me && <small> (ви)</small>}</span>
            {m.me ? (
              <button className="link-btn" onClick={rename}>Змінити</button>
            ) : (
              <button className="icon-btn" onClick={() => kick(m)} aria-label="Прибрати"><UserMinus size={18} /></button>
            )}
          </div>
        ))}
        {!members && <p className="hint">Список з'явиться, коли буде інтернет.</p>}
      </div>

      <button className="setting-row danger-text" onClick={leave}><LogOut size={20} /><span className="setting-text">Вийти зі спільної галереї</span></button>
    </section>
  )
}
