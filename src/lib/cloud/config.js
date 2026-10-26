// Проєкт Supabase для спільної галереї (див. supabase/README.md).
// Обидва значення публічні: дані захищають правила доступу в базі, а не ці ключі.
export const SUPABASE_URL = ''
export const SUPABASE_KEY = ''

export const cloudConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY)
