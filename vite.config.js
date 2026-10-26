import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' — щоб збірка працювала з будь-якої теки (GitHub Pages тощо)
export default defineConfig({
  base: './',
  plugins: [react()],
})
