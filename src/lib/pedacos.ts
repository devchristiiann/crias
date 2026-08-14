import { lazy, type ComponentType } from 'react'

/**
 * Marca de que ESTA versao do app ja gastou a recarga dela.
 *
 * `sessionStorage` e nao `localStorage`: a marca vale para esta aba e some
 * quando o app e fechado, entao abrir de novo comeca com a tentativa de volta.
 */
const CHAVE = 'crias:recarga-de-pedaco'

/**
 * Marca do vigia de versao, separada da marca do pedaco faltando.
 *
 * Uma marca so para as duas coisas parecia economia e era perda: uma recarga
 * disparada pelo vigia gastava a unica ficha, e um 404 de pedaco logo depois
 * caia direto na tela de erro fatal, sem a recarga que o conserta.
 */
const CHAVE_VERSAO = 'crias:recarga-de-versao'

/**
 * Identidade do build. `import.meta.url` aponta para o proprio arquivo servido,
 * e no build ele carrega o hash do conteudo do pedaco de entrada: muda a cada
 * deploy, e so a cada deploy. E o que faz "uma recarga por versao" ser uma
 * conta e nao um relogio.
 */
const VERSAO = import.meta.url

/**
 * Pagina em pedaco proprio, com o conserto que o deploy novo exige.
 *
 * Todo deploy troca o nome de todo arquivo de `assets/`. Quem tem o PWA
 * instalado fica com o app aberto por dias, com um `index.html` velho na
 * memoria apontando para nomes que o deploy ja apagou, e `assets/` esta de fora
 * do rewrite do `vercel.json`: a resposta e 404 de verdade, o `import()` falha
 * e a arvore inteira cai na tela de erro fatal. Antes do code splitting isso
 * nao existia, porque o pacote era unico e toda carga revalidava o `index.html`.
 *
 * O conserto e o do caso: recarregar busca o `index.html` novo e o app volta na
 * versao que esta no ar. A recarga acontece no maximo uma vez por versao, senao
 * um 404 permanente viraria laco infinito de recarga; gasta a marca, o erro
 * sobe e a tela de erro fatal aparece, com saida.
 */
/**
 * Marca a recarga desta versao e diz se ela ja tinha sido gasta.
 *
 * Safari privado, WebView do Instagram e cookie de terceiro bloqueado fazem o
 * `sessionStorage` lancar na leitura, e nao so na escrita. Sem guarda, esse
 * erro subia de dentro do tratamento do pedaco faltando e trocava a causa: a
 * tela de erro fatal falava de armazenamento quando o problema era um deploy
 * novo. Sem armazenamento nao da para contar recarga, e recarregar sem conta e
 * laco infinito, entao o ramo fechado e considerar a marca gasta.
 */
function marcaGasta(chave: string, valor: string) {
  try {
    if (sessionStorage.getItem(chave) === valor) return true
    sessionStorage.setItem(chave, valor)
    return false
  } catch {
    return true
  }
}

/**
 * Endereco do pedaco de entrada declarado por um HTML do app.
 *
 * O nome do arquivo carrega o hash do conteudo, entao ele muda a cada deploy e
 * so a cada deploy. `DOMParser` em vez de expressao regular porque a ordem dos
 * atributos do `<script>` e escolha do empacotador, e o navegador ja sabe ler
 * HTML.
 */
function pedacoDeEntrada(documento: Document): string | null {
  return documento.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null
}

/**
 * Minimo entre duas conferencias de versao. Trocar de app e voltar e gesto de
 * segundo, e o `index.html` seria buscado a cada volta sem nenhum ganho.
 */
const INTERVALO_CONFERENCIA_MS = 5 * 60 * 1000

let ultimaConferencia = 0

/**
 * Recarrega quando o deploy no ar deixou de ser o que esta rodando aqui.
 *
 * O `pagina` acima so age quando um pedaco preguicoso da 404, e isso exige que
 * a pessoa navegue para uma tela que ainda nao carregou. Quem fica na Hoje com
 * o PWA instalado nunca pede pedaco nenhum: o iPhone guarda o app na memoria e
 * volta a ele por dias sem uma unica carga de pagina. Foi assim que um usuario
 * ficou com o cliente anterior a 47d37f0 e todo check-in com foto morreu em
 * `foto_invalida`: ele gravava a foto no caminho antigo, `<uid>/<ocorrencia>`,
 * e o servidor novo exige a ocorrencia como PASTA. Nenhuma foto ia funcionar, e
 * a tela pedia para tentar outra.
 *
 * A conferencia acontece quando o app volta para a frente, que e o instante em
 * que nada esta em voo e recarregar nao custa trabalho de ninguem.
 *
 * A marca de recarga e chaveada no pedaco ALVO, nao no que esta rodando, e por
 * isso ela sobrevive a propria recarga: se a origem estiver servindo dois
 * builds alternados, a segunda volta reencontra o mesmo alvo, ve a marca gasta
 * e para. Chaveada no build em uso ela se apagaria a cada recarga, e o app
 * ficaria recarregando sem fim.
 */
export function vigiarVersao() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    void conferirVersao()
  })
}

async function conferirVersao() {
  const agora = Date.now()
  if (agora - ultimaConferencia < INTERVALO_CONFERENCIA_MS) return
  ultimaConferencia = agora

  const emUso = pedacoDeEntrada(document)
  if (!emUso) return

  try {
    // `no-store` e nao `no-cache`: o proprio ponto da conferencia e nao aceitar
    // a copia que o aparelho ja tem.
    const resposta = await fetch('/index.html', { cache: 'no-store' })
    if (!resposta.ok) return
    const noAr = pedacoDeEntrada(
      new DOMParser().parseFromString(await resposta.text(), 'text/html'),
    )
    if (!noAr || noAr === emUso) return
    if (marcaGasta(CHAVE_VERSAO, noAr)) return
    window.location.reload()
  } catch {
    // Sem rede, ou resposta que nao da para ler: a versao de pe continua de pe.
    // Recarregar as cegas trocaria um app velho que funciona por uma tela em
    // branco.
  }
}

export function pagina(carregar: () => Promise<{ default: ComponentType }>) {
  return lazy(() =>
    carregar().catch((erro: unknown) => {
      if (marcaGasta(CHAVE, VERSAO)) throw erro
      window.location.reload()
      // A recarga ja esta a caminho. Uma promessa que nunca resolve segura o
      // `Suspense` de pe ate a pagina trocar, em vez de piscar a tela de erro
      // por um quadro antes de o navegador sair daqui.
      return new Promise<{ default: ComponentType }>(() => {})
    }),
  )
}
