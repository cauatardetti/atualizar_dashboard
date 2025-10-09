// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// troque REPO_NAME pelo nome real do repositório do frontend
export default defineConfig({
  plugins: [react()],
  base: '/atualizar_dashboard/',
})
