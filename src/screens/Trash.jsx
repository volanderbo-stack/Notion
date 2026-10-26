// Кошик: видалене зберігається 30 днів; можна відновити або видалити назавжди
import { useMemo } from 'react'
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react'
import { Header, Empty } from '../components/Chrome'
import ItemGrid from '../components/ItemGrid'
import { SelectionHeader } from '../components/SelectionBar'
import { TRASH_DAYS, purgeItems, restoreItems, useStore } from '../lib/store'
import { useSelection } from '../lib/hooks'
import { confirm, toast } from '../lib/ui'
import { navigate } from '../lib/nav'
import { plural, pluralItems } from '../lib/format'

const daysLeft = (i) => Math.max(0, Math.ceil((i.deletedAt + TRASH_DAYS * 864e5 - Date.now()) / 864e5))

export default function Trash() {
  const items = useStore((s) => s.items)
  const list = useMemo(() => items.filter((i) => i.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt), [items])
  const ids = useMemo(() => list.map((i) => i.id), [list])
  const sel = useSelection()

  const purge = async (target) => {
    const ok = await confirm({
      title: target.length === list.length ? 'Очистити кошик?' : `Видалити назавжди ${pluralItems(target.length)}?`,
      text: 'Цю дію не можна скасувати.',
      ok: 'Видалити назавжди',
      danger: true,
    })
    if (!ok) return
    await purgeItems(target)
    sel.clear()
    toast('Видалено назавжди')
  }
  const restore = async (target) => {
    await restoreItems(target)
    sel.clear()
    toast(`Відновлено: ${pluralItems(target.length)}`)
  }

  return (
    <>
      {sel.active ? (
        <header className="header is-selecting"><SelectionHeader selection={sel} allIds={ids} /></header>
      ) : (
        <Header
          title="Кошик"
          subtitle={list.length ? pluralItems(list.length) : null}
          left={<button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Назад"><ArrowLeft size={22} /></button>}
          right={list.length > 0 && <button className="chip-btn danger" onClick={() => purge(ids)}>Очистити</button>}
        />
      )}
      {list.length ? (
        <>
          <p className="pad-x hint">Елементи видаляються назавжди через {TRASH_DAYS} днів. Торкніться, щоб вибрати.</p>
          <ItemGrid
            items={list}
            grouped={false}
            selection={sel}
            onTap={(it) => sel.start(it.id)}
            badge={(it) => plural(daysLeft(it), ['день', 'дні', 'днів'])}
          />
        </>
      ) : (
        <Empty Icon={Trash2} title="Кошик порожній" text={`Видалене зберігається тут ${TRASH_DAYS} днів.`} />
      )}
      {sel.active && (
        <div className="selection-bar">
          <button onClick={() => restore(sel.ids)}><RotateCcw size={22} /><span>Відновити</span></button>
          <button className="danger" onClick={() => purge(sel.ids)}><Trash2 size={22} /><span>Видалити назавжди</span></button>
        </div>
      )}
    </>
  )
}
