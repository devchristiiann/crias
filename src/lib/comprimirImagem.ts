const LADO_MAXIMO = 1080
const QUALIDADE = 0.7

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
 */
export async function comprimirImagem(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo)
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
