// frontend/vite.config.js
// ** UPDATED FILE - Ensure no worker config **
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensure no specific worker block is present
  // worker: { ... } // REMOVE this block if it exists
})