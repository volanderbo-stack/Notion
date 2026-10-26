// Проєкт Supabase для спільної галереї (див. supabase/README.md).
// Обидва значення публічні: дані захищають правила доступу в базі, а не ці ключі.
export const SUPABASE_URL = 'https://hgnhqqtloqmdpkukqhyc.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_ybO3eNI6beEMC16KS_wgdg_1d6IIPMU'

export const cloudConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY)
