// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base din�mica para GitHub Pages (BASE_PATH no build; '/' no dev)

export default defineConfig({
  plugins: [react()],
  base: '/atualizar_dashboard/',
})
