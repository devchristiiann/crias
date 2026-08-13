import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ID_CONTEUDO } from '@/components/layout/AppShell'

/**
 * Rota nova sempre comeca no topo.
 *
 * Quem rola agora e o `<main>` da casca, nao a janela. Rolar so a janela
 * deixaria a pagina nova abrindo na posicao da anterior, que e justamente o
 * bug que este componente existe para evitar.
 */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.getElementById(ID_CONTEUDO)?.scrollTo({ top: 0 })
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
