import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErroFatal } from './components/ErroFatal'
import { vigiarVersao } from './lib/pedacos'
import './index.css'

vigiarVersao()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErroFatal>
      <App />
    </ErroFatal>
  </StrictMode>,
)
