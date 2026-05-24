import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Unregister any old service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister())
  })
}

const root = createRoot(document.getElementById('root')!)
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Remove the inline HTML loading screen once React has rendered its first frame
requestAnimationFrame(() => {
  const el = document.getElementById('app-loading')
  if (!el) return
  el.classList.add('fade-out')
  setTimeout(() => el.remove(), 320)
})
