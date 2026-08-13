import { Outlet } from 'react-router-dom'
import { useBadge } from '@/hooks/useBadge'
import { BottomNav } from './BottomNav'

/** Id do elemento que rola. O ScrollToTop precisa dele para voltar ao topo. */
export const ID_CONTEUDO = 'conteudo'

/**
 * Casca do app: a viewport inteira, com o conteudo rolando por dentro.
 *
 * Historico de duas tentativas que falharam no iPhone, para nao voltarem:
 *
 * 1. `position: fixed` no menu com o body rolando. O menu descia junto com a
 *    pagina e o conteudo passava por baixo dele.
 * 2. Coluna de altura `100dvh`. Ainda dependia do navegador acertar a conta da
 *    altura, e no iOS a barra que aparece e some deixava o menu cortado, so
 *    revelado ao rolar ate o fim.
 *
 * `fixed inset-0` acaba com a conta: a casca E a viewport, por definicao. Nada
 * de vh, nada de dvh, e o documento nunca rola, entao nao existe estado em que
 * o menu esteja fora da tela. Quem rola e so o `<main>`, que ocupa o espaco que
 * sobra depois do menu, e por isso nunca fica escondido atras dele.
 *
 * O respiro final do conteudo entra aqui, e nao no menu, para o toque no menu
 * continuar comecando exatamente onde o dedo ve o botao.
 */
export function AppShell() {
  // Fica na casca, e nao na tela Hoje, para a bolinha ficar certa mesmo quando o
  // usuario abre o app direto na Loja ou nos Grupos.
  useBadge()

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-background">
      <main
        id={ID_CONTEUDO}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <div className="mx-auto w-full max-w-lg px-4 pb-10 pt-6">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
