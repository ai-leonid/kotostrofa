import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  root: '.',
  build: {
    outDir: 'dist',
    target: 'es2020'
  },
  server: {
    port: 5173
  }
})
