import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErroFatal } from './components/ErroFatal'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErroFatal>
      <App />
    </ErroFatal>
  </StrictMode>,
)
