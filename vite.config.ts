import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: process.env.BASE ?? '/',
  define: {
    'import.meta.env.BASE': JSON.stringify(process.env.BASE ?? '/')
  }
})