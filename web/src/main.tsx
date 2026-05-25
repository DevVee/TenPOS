import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ─── Build ID ─────────────────────────────────────────────────────────────────
// Stamped at compile time — open DevTools Console to verify which build is live.
// Format: [TenPOS] build 2026-05-25T14:30:00.000Z
console.info(
  `%c[TenPOS] build ${__BUILD_TIME__}`,
  'color:#C0392B;font-weight:bold;font-size:11px',
)

// ─── Service worker lifecycle ─────────────────────────────────────────────────
// Register the fixed v2 service worker (network-first for HTML, cache-first for
// hashed /assets/*).  On first load after a deploy, skipWaiting + clientsClaim
// in the new SW ensures it activates immediately and clears stale caches.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.info('[TenPOS] SW registered:', reg.scope)

        // If a new SW is waiting, tell it to take over immediately.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            // New SW installed and waiting → activate it right away
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.info('[TenPOS] New SW available — activating…')
              newWorker.postMessage({ type: 'SKIP_WAITING' })
            }
          })
        })
      })
      .catch((err) => console.warn('[TenPOS] SW registration failed:', err))
  })

  // When the SW controller changes (new SW took over), reload to get fresh assets
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true
      window.location.reload()
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
