import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Repo is github.com/aadyash24/FMCSA, so the site lives at
  // https://aadyash24.github.io/FMCSA/ and assets must be prefixed with /FMCSA/.
  base: '/FMCSA/',
  plugins: [react()],
})
