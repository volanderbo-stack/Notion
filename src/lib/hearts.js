// Кольорові сердечка — швидкі категорії («Картки», «QR-коди», «Документи»...).
// Назви спільні для всієї галереї й зберігаються разом з даними (store: hearts.labels).

export const HEARTS = [
  { id: 'red', color: '#ff3b5c', name: 'Червоне' },
  { id: 'green', color: '#1fb860', name: 'Зелене' },
  { id: 'blue', color: '#2f80ff', name: 'Синє' },
  { id: 'yellow', color: '#f2b200', name: 'Жовте' },
  { id: 'purple', color: '#a259ff', name: 'Фіолетове' },
  { id: 'orange', color: '#ff7a1a', name: 'Помаранчеве' },
]

export const DEFAULT_HEART_LABELS = {
  red: 'Улюблене',
  green: 'Картки магазинів',
  blue: 'QR-коди',
  yellow: 'Документи',
  purple: '',
  orange: '',
}

export const heartColor = (id) => (HEARTS.find((h) => h.id === id) || HEARTS[0]).color

export function heartLabel(id, labels) {
  const l = labels?.[id]
  return l?.trim() || HEARTS.find((h) => h.id === id)?.name || id
}

// Порядок сердечок на елементі — як у HEARTS
export const sortHearts = (ids) => HEARTS.filter((h) => ids.includes(h.id)).map((h) => h.id)
