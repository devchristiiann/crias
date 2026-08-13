import { Component, type ReactNode } from 'react'
import { Botao } from './ui/Botao'

interface Props {
  children: ReactNode
}

interface Estado {
  quebrou: boolean
}

/**
 * Sem um limite de erro, qualquer throw durante o render deixa o `#root` vazio
 * e o usuario ve uma tela preta, indistinguivel de app fora do ar. Componente
 * de classe porque e a unica forma de capturar erro de render no React.
 */
export class ErroFatal extends Component<Props, Estado> {
  state: Estado = { quebrou: false }

  static getDerivedStateFromError(): Estado {
    return { quebrou: true }
  }

  render() {
    if (!this.state.quebrou) return this.props.children

    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-5 text-center">
        {/* A marca aqui nao e enfeite: esta e a unica tela que aparece com o
            app quebrado, e sem ela nada distingue o erro do Crias de um erro do
            navegador. */}
        <img src="/logo.png" alt="" width={56} height={56} className="size-14" />
        <h1 className="text-2xl font-semibold tracking-tight">Algo deu errado</h1>
        <p className="text-sm text-muted-foreground">
          O app parou no meio do caminho. Recarregue para voltar de onde estava.
        </p>
        <Botao tamanho="lg" onClick={() => window.location.reload()}>
          Recarregar
        </Botao>
        {/* Recarregar volta para a MESMA rota, e se foi ela que quebrou a tela
            aparece de novo: sem esta segunda saida o usuario fica preso aqui.
            E navegacao de verdade, e nao do roteador, que morreu junto. */}
        <Botao variante="secundario" onClick={() => window.location.assign('/hoje')}>
          Ir para o início
        </Botao>
      </main>
    )
  }
}
