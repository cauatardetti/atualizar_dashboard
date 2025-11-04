// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base dinâmica para GitHub Pages (BASE_PATH no build; '/' no dev)
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  plugins: [react()],
  base,
})
