// Налаштування: тема оформлення, сітка, резервна копія, кошик, встановлення
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Download, HardDrive, Monitor, Moon, Smartphone, Sun, Trash2, Upload } from 'lucide-react'
import { Header, Progress } from '../components/Chrome'
import { useStore } from '../lib/store'
import { setSetting, useSettings } from '../lib/settings'
import { navigate } from '../lib/nav'
import { choose, toast } from '../lib/ui'
import { applyBackup, buildBackup, readBackup } from '../lib/backup'
import { downloadBlob } from '../lib/share'
import { formatBytes, pluralItems } from '../lib/format'
import { installApp, useInstallState } from '../lib/install'
import { getConn } from '../lib/cloud/state'
import SharedSection from '../components/SharedSection'

function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.v} role="radio" aria-checked={value === o.v} className={value === o.v ? 'is-active' : ''} onClick={() => onChange(o.v)}>
          {o.Icon && <o.Icon size={16} />} {o.label}
        </button>
      ))}
    </div>
  )
}

function Switch({ on, onChange, label, hint }) {
  return (
    <button className="setting-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="setting-text">{label}{hint && <small>{hint}</small>}</span>
      <span className={`switch ${on ? 'is-on' : ''}`} />
    </button>
  )
}

export default function Settings({ joinCode }) {
  const s = useSettings()
  const items = useStore((st) => st.items)
  const trashCount = items.filter((i) => i.deletedAt).length
  const [usage, setUsage] = useState(null)
  const [persisted, setPersisted] = useState(null)
  const [job, setJob] = useState(null) // { label, done, total }
  const importInput = useRef()
  const install = useInstallState()

  useEffect(() => {
    navigator.storage?.estimate?.().then(setUsage).catch(() => {})
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {})
  }, [items.length])

  const exportBackup = async () => {
    try {
      setJob({ label: 'Готую архів…', done: 0, total: 1 })
      const blob = await buildBackup((done, total) => setJob({ label: `Файли: ${done} з ${total}`, done, total }))
      const d = new Date()
      const name = `galereya-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.zip`
      downloadBlob(blob, name)
      toast(`Резервну копію збережено (${formatBytes(blob.size)})`)
    } catch (e) {
      console.error(e)
      toast(e.message || 'Не вдалося створити копію')
    } finally {
      setJob(null)
    }
  }

  const importBackup = async (e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    try {
      const backup = await readBackup(file)
      const n = backup.meta.items?.length || 0
      const mode = await choose({
        title: 'Відновити з копії',
        text: `В архіві: ${pluralItems(n)}, тем: ${backup.meta.themes?.length || 0}.`,
        actions: [
          { id: 'merge', label: 'Додати до наявного' },
          // У спільній галереї «замінити все» стерло б дані лише тут — тому тільки додавання
          ...(getConn() ? [] : [{ id: 'replace', label: 'Замінити все (поточні дані зітруться)', danger: true }]),
        ],
      })
      if (!mode) return
      setJob({ label: 'Відновлюю…', done: 0, total: 1 })
      const r = await applyBackup(backup, mode, (done, total) => setJob({ label: `Файли: ${done} з ${total}`, done, total }))
      toast(`Відновлено: ${pluralItems(r.items)}, тем: ${r.themes}`)
    } catch (err) {
      console.error(err)
      toast(err.message || 'Не вдалося прочитати архів')
    } finally {
      setJob(null)
    }
  }

  const askPersist = async () => {
    const ok = await navigator.storage?.persist?.()
    setPersisted(!!ok)
    toast(ok ? 'Сховище захищено від автоочищення' : 'Браузер не дозволив — встановіть застосунок на головний екран')
  }

  return (
    <>
      <Header title="Налаштування" left={<button className="icon-btn" onClick={() => navigate('/')} aria-label="Назад"><ArrowLeft size={22} /></button>} />
      <div className="pad settings">
        <SharedSection joinCode={joinCode} />

        <section className="card">
          <h3 className="card-title">Вигляд</h3>
          <div className="setting-block">
            <span className="setting-text">Тема оформлення</span>
            <Segmented value={s.themeMode} onChange={(v) => setSetting('themeMode', v)} options={[
              { v: 'system', label: 'Авто', Icon: Monitor }, { v: 'light', label: 'Світла', Icon: Sun }, { v: 'dark', label: 'Темна', Icon: Moon },
            ]} />
          </div>
          <div className="setting-block">
            <span className="setting-text">Мініатюр у ряд<small>Також змінюється щипком у сітці</small></span>
            <Segmented value={s.grid} onChange={(v) => setSetting('grid', v)} options={[{ v: 3, label: '3' }, { v: 5, label: '5' }, { v: 7, label: '7' }]} />
          </div>
          <Switch on={s.galleryAll} onChange={(v) => setSetting('galleryAll', v)} label="Показувати в галереї все" hint="Не лише фото й відео, а й посилання, нотатки, голосові та файли" />
          <Switch on={s.linkPreviews} onChange={(v) => setSetting('linkPreviews', v)} label="Превʼю посилань" hint="Назва й картинка сайту через сервіс microlink.io (адреса посилання передається йому)" />
        </section>

        <section className="card">
          <h3 className="card-title">Дані</h3>
          <button className="setting-row" onClick={() => navigate('/trash')}>
            <Trash2 size={20} /><span className="setting-text">Кошик<small>{trashCount ? pluralItems(trashCount) : 'Порожній'} · зберігається 30 днів</small></span><ChevronRight size={18} />
          </button>
          <button className="setting-row" onClick={exportBackup} disabled={!!job}>
            <Download size={20} /><span className="setting-text">Експорт резервної копії<small>ZIP-архів з усіма файлами й темами</small></span>
          </button>
          <button className="setting-row" onClick={() => importInput.current.click()} disabled={!!job}>
            <Upload size={20} /><span className="setting-text">Імпорт резервної копії<small>Додати до наявного або замінити все</small></span>
          </button>
          <input ref={importInput} type="file" accept=".zip,application/zip" hidden onChange={importBackup} />
          {job && <Progress value={job.done} max={job.total} label={job.label} />}
          <div className="setting-row static">
            <HardDrive size={20} />
            <span className="setting-text">
              Сховище
              <small>
                {usage ? `Зайнято ${formatBytes(usage.usage)}${usage.quota ? ` з ~${formatBytes(usage.quota)}` : ''}` : (getConn() ? 'Копія фото — на цьому пристрої' : 'Дані зберігаються лише на цьому пристрої')}
                {persisted === true && ' · захищено від очищення'}
              </small>
            </span>
            {persisted === false && <button className="chip-btn" onClick={askPersist}>Захистити</button>}
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Застосунок</h3>
          {install.canInstall ? (
            <button className="setting-row" onClick={installApp}>
              <Smartphone size={20} /><span className="setting-text">Встановити на телефон<small>Іконка на головному екрані, робота без інтернету</small></span>
            </button>
          ) : install.installed ? (
            <div className="setting-row static"><Smartphone size={20} /><span className="setting-text">Встановлено як застосунок</span></div>
          ) : (
            <div className="setting-row static">
              <Smartphone size={20} />
              <span className="setting-text">Встановлення<small>{install.ios ? 'Safari → «Поділитися» → «На початковий екран»' : 'Меню браузера → «Встановити застосунок» / «Додати на головний екран»'}</small></span>
            </div>
          )}
          <p className="hint">Розумна галерея · дані зберігаються у браузері (IndexedDB), а в спільній галереї — ще й на сервері. Регулярно робіть резервну копію.</p>
        </section>
      </div>
    </>
  )
}
