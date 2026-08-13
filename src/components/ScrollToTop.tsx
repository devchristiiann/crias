import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ID_CONTEUDO } from '@/components/layout/AppShell'

/**
 * Rota nova sempre comeca no topo.
 *
 * Quem rola agora e o `<main>` da casca, nao a janela. Rolar so a janela
 * deixaria a pagina nova abrindo na posicao da anterior, que e justamente o
 * bug que este componente existe para evitar.
 *
 * A busca conta junto com o caminho. `/grupos` e `/grupos?todos=1` sao a mesma
 * rota para o React Router e telas diferentes para quem usa: o segundo e o
 * Voltar de dentro do grupo, e so com `pathname` na dependencia ele abria na
 * rolagem que a lista tinha antes.
 */
export function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    document.getElementById(ID_CONTEUDO)?.scrollTo({ top: 0 })
    window.scrollTo(0, 0)
  }, [pathname, search])

  return null
}
