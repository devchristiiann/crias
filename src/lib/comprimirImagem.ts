const LADO_MAXIMO = 1080
const QUALIDADE = 0.7

/**
 * Reduz e recodifica a foto no proprio celular antes de subir.
 * Camera de celular entrega 3 a 8 MB por foto; sem isso o upload trava em 4G
 * e o bucket enche em uma semana.
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

    return await new Promise<Blob>((resolver, rejeitar) => {
      canvas.toBlob(
        (blob) => (blob ? resolver(blob) : rejeitar(new Error('Falha ao comprimir a imagem'))),
        'image/webp',
        QUALIDADE,
      )
    })
  } finally {
    bitmap.close()
  }
}
