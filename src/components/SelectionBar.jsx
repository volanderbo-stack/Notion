// Панель масових дій для вибраних елементів
import { FolderInput, FolderPlus, Heart, Share2, Trash2, X, CheckCheck } from 'lucide-react'
import { getState, restoreItems, trashItems } from '../lib/store'
import { openHearts, openPicker, toast } from '../lib/ui'
import { shareItems } from '../lib/share'
import { pluralItems } from '../lib/format'

export function SelectionHeader({ selection, allIds }) {
  const all = selection.count === allIds.length
  return (
    <div className="selection-head">
      <button className="icon-btn" onClick={selection.clear} aria-label="Скасувати вибір"><X size={22} /></button>
      <div className="selection-count">Вибрано: {selection.count}</div>
      <button className="chip-btn" onClick={() => selection.setAll(all ? [] : allIds)}>
        <CheckCheck size={16} /> {all ? 'Зняти все' : 'Усі'}
      </button>
    </div>
  )
}

export default function SelectionBar({ selection, themeId }) {
  const ids = selection.ids
  const items = getState().items.filter((i) => selection.has(i.id))
  const share = async () => {
    const r = await shareItems(items)
    if (r === 'downloaded') toast('Файли збережено')
    if (r === 'copied') toast('Скопійовано в буфер обміну')
  }
  const del = async () => {
    await trashItems(ids)
    selection.clear()
    toast(`${pluralItems(ids.length)} у кошику`, 'Повернути', () => restoreItems(ids))
  }

  return (
    <div className="selection-bar">
      <button onClick={() => openHearts(ids)}><Heart size={22} /><span>Сердечко</span></button>
      <button onClick={() => openPicker(ids, 'add', null, selection.clear)}><FolderPlus size={22} /><span>У тему</span></button>
      <button onClick={() => openPicker(ids, 'move', themeId, selection.clear)}><FolderInput size={22} /><span>Перемістити</span></button>
      <button onClick={share}><Share2 size={22} /><span>Поділитися</span></button>
      <button className="danger" onClick={del}><Trash2 size={22} /><span>Видалити</span></button>
    </div>
  )
}
