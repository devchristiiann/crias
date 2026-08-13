import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

/** Id do elemento que rola. O ScrollToTop precisa dele para voltar ao topo. */
export const ID_CONTEUDO = 'conteudo'

/**
 * Casca do app: coluna de altura fixa, conteudo rolando por dentro.
 *
 * A versao anterior usava `position: fixed` no menu com o body rolando, e no
 * Safari do iPhone o menu descia junto com a pagina e o conteudo passava por
 * baixo dele. Com a coluna, o menu e um irmao do conteudo: ele nao pode se
 * mover nem ser coberto, porque nao divide espaco com a area que rola.
 *
 * `100dvh` acompanha a barra do navegador aparecendo e sumindo. `100vh` fica
 * grande demais no iPhone e empurra o menu para fora da tela.
 */
export function AppShell() {
  return (
    <div className="flex h-screen h-[100dvh] flex-col overflow-hidden">
      <main
        id={ID_CONTEUDO}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto w-full max-w-lg px-4 pb-8 pt-6">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  )
}
