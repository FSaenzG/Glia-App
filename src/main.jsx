import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import './i18n'

// Force-update any waiting Service Worker so all users get the latest build.
// Thanks to skipWaiting + clientsClaim in vite.config.js, the new SW activates
// immediately and the page reloads once to serve fresh assets.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((reg) => {
      reg.update()          // check for a new SW version right now
    })
  })

  // If a new SW takes over, reload the page exactly once to clear old cache
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true
      window.location.reload()
    }
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
