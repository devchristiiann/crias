const LADO_MAXIMO = 1080
const QUALIDADE = 0.7
/**
 * Teto do arquivo COMO ELE CHEGA, antes de comprimir. Nao e o limite do bucket,
 * que e de 3 MB e vale para o blob ja reduzido: aqui o numero e generoso de
 * proposito, porque camera de celular moderno entrega 3 a 8 MB e precisa passar.
 * O que ele barra e o que a galeria passou a permitir escolher: um ProRAW de 70
 * MB tem tipo de imagem, passa pelo teste de tipo e trava a aba na decodificacao.
 */
const TAMANHO_MAXIMO = 25 * 1024 * 1024

function codificar(canvas: HTMLCanvasElement, tipo: string): Promise<Blob> {
  return new Promise((resolver, rejeitar) => {
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rejeitar(new Error('Falha ao comprimir a imagem'))),
      tipo,
      QUALIDADE,
    )
  })
}

/**
 * Reduz e recodifica a foto no proprio celular antes de subir.
 * Camera de celular entrega 3 a 8 MB por foto; sem isso o upload trava em 4G
 * e o bucket enche em uma semana.
 *
 * O tipo pedido nao e o tipo entregue. `toBlob` com um formato que o navegador
 * nao sabe codificar cai em PNG, e PNG ignora o argumento de qualidade: era
 * isso que acontecia no Safari do iPhone, e as fotos de producao chegaram ao
 * bucket com 1,4 MB cada, quinze vezes o alvo, sem nenhum erro na tela. Por
 * isso o retorno e conferido e o JPEG entra como segunda tentativa: ele honra a
 * qualidade em todo navegador que existe.
 *
 * As tres recusas daqui viram mensagem na tela do check-in, nunca texto cru do
 * navegador. Elas existem porque o campo de foto aceita a galeria: `image/heic`
 * do iPhone passa pelo `accept` e pelo teste de tipo, e so quebra na
 * decodificacao, num navegador que nao sabe abrir HEIC. Sem o `try` a
 * `DOMException` subia pelo `mutationFn` e derrubava o check-in inteiro com o
 * erro do navegador escrito na folha.
 */
export async function comprimirImagem(arquivo: File): Promise<Blob> {
  // Tipo VAZIO passa de proposito. Varios gerenciadores de arquivo do Android
  // entregam `type` em branco, e esse caminho ficou comum agora que a folha
  // nativa abre o seletor de arquivos junto com a galeria: recusar aqui barraria
  // foto boa com um recado de que o arquivo nao e imagem. Quem decide nesse caso
  // e o `createImageBitmap` logo abaixo, que ou abre ou cai no recado certo.
  if (arquivo.type !== '' && !arquivo.type.startsWith('image/')) {
    throw new Error('Esse arquivo não é uma imagem. Escolha uma foto, ou tire uma na hora.')
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw new Error('Essa imagem é pesada demais. Escolha outra, ou tire uma foto na hora.')
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(arquivo)
  } catch {
    throw new Error('Não deu para abrir essa imagem. Escolha outra, ou tire uma foto na hora.')
  }

  try {
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * escala))
    canvas.height = Math.max(1, Math.round(bitmap.height * escala))

    const contexto = canvas.getContext('2d')
    if (!contexto) throw new Error('Canvas indisponível neste navegador')
    contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    const webp = await codificar(canvas, 'image/webp')
    if (webp.type === 'image/webp') return webp
    return await codificar(canvas, 'image/jpeg')
  } finally {
    bitmap.close()
  }
}
