import { lazy, type ComponentType } from 'react'

/**
 * Marca de que ESTA versao do app ja gastou a recarga dela.
 *
 * `sessionStorage` e nao `localStorage`: a marca vale para esta aba e some
 * quando o app e fechado, entao abrir de novo comeca com a tentativa de volta.
 */
const CHAVE = 'crias:recarga-de-pedaco'

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
function marcaGasta() {
  try {
    if (sessionStorage.getItem(CHAVE) === VERSAO) return true
    sessionStorage.setItem(CHAVE, VERSAO)
    return false
  } catch {
    return true
  }
}

export function pagina(carregar: () => Promise<{ default: ComponentType }>) {
  return lazy(() =>
    carregar().catch((erro: unknown) => {
      if (marcaGasta()) throw erro
      window.location.reload()
      // A recarga ja esta a caminho. Uma promessa que nunca resolve segura o
      // `Suspense` de pe ate a pagina trocar, em vez de piscar a tela de erro
      // por um quadro antes de o navegador sair daqui.
      return new Promise<{ default: ComponentType }>(() => {})
    }),
  )
}
