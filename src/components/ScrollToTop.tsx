import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Rota nova sempre comeca no topo. Sem isso a proxima pagina abre na posicao da anterior. */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
