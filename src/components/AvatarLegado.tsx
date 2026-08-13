import { BASES, BASE_PADRAO, ITENS, LADO, type Sprite } from '@/lib/sprites'

/**
 * Caminho antigo do Avatar: as bases 16x16 escritas como matriz de caracteres.
 *
 * A arte de verdade hoje sao os PNG do catalogo, mas quem escolheu personagem
 * antes da troca continua com `base-0X` gravado em `profiles.avatar_base`.
 * Apagar isto apagaria o boneco dessas contas, entao o codigo fica de pe do
 * jeito que estava, inclusive o cache.
 *
 * A versao anterior a esta emitia um `<rect>` por pixel aceso, ate 256 por
 * sprite e mais de 500 com o acessorio por cima. No ranking de um grupo isso
 * virava milhares de nos no DOM para desenhar bonecos de 40 pixels. Aqui cada
 * combinacao vira uma string uma vez so e o navegador recebe uma imagem.
 */
const cache = new Map<string, string>()

function retangulos(sprite: Sprite): string {
  let saida = ''
  for (let y = 0; y < sprite.grade.length; y += 1) {
    const linha = sprite.grade[y]
    // Pixels vizinhos da mesma cor viram um retangulo so. Corta boa parte do
    // tamanho da string sem mudar um pixel do resultado.
    let x = 0
    while (x < linha.length) {
      const cor = sprite.paleta[linha[x]]
      if (!cor) {
        x += 1
        continue
      }
      let largura = 1
      while (x + largura < linha.length && linha[x + largura] === linha[x]) largura += 1
      saida += `<rect x="${x}" y="${y}" width="${largura}" height="1" fill="${cor}"/>`
      x += largura
    }
  }
  return saida
}

/** Data URI do SVG de uma base antiga, com o item antigo por cima se houver. */
export function fonteLegado(base: string, item: string | null): string {
  const chave = `${base}|${item ?? ''}`
  const pronto = cache.get(chave)
  if (pronto) return pronto

  const spriteBase = BASES[base] ?? BASES[BASE_PADRAO]
  const spriteItem = item ? ITENS[item] : undefined

  const corpo = retangulos(spriteBase) + (spriteItem ? retangulos(spriteItem) : '')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LADO} ${LADO}" ` +
    `shape-rendering="crispEdges">${corpo}</svg>`

  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`
  cache.set(chave, url)
  return url
}
