import { beforeEach, describe, expect, it, vi } from 'vitest'

const criarSignedUrl = vi.fn()

vi.mock('./supabase', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: criarSignedUrl }) } },
}))

const { assinarEmLote } = await import('./storage')

const MINIATURA = { largura: 160, qualidade: 70 }
const GRANDE = { largura: 1024, qualidade: 70 }

describe('assinarEmLote', () => {
  beforeEach(() => {
    criarSignedUrl.mockReset()
    criarSignedUrl.mockImplementation((caminho: string, _s: number, opcoes) =>
      Promise.resolve({
        data: { signedUrl: `https://x/${caminho}?w=${opcoes.transform.width}` },
        error: null,
      }),
    )
  })

  it('pede a transformacao com aspecto preservado', async () => {
    await assinarEmLote('grupos', ['a/capa.webp'], 600, GRANDE)

    expect(criarSignedUrl).toHaveBeenCalledWith('a/capa.webp', 600, {
      transform: { width: 1024, resize: 'contain', quality: 70 },
    })
  })

  it('nao serve a versao grande no lugar da miniatura', async () => {
    // O cache e por caminho E por entrega. Com uma chave so, a capa assinada em
    // 1024 pela tela de detalhe voltaria para o card de 44px da lista.
    const grande = await assinarEmLote('grupos', ['a/capa.webp'], 600, GRANDE)
    const pequena = await assinarEmLote('grupos', ['a/capa.webp'], 600, MINIATURA)

    expect(grande.get('a/capa.webp')).toContain('w=1024')
    expect(pequena.get('a/capa.webp')).toContain('w=160')
  })

  it('reaproveita a URL ja assinada da mesma entrega', async () => {
    await assinarEmLote('checkins', ['u/1.webp'], 600, MINIATURA)
    await assinarEmLote('checkins', ['u/1.webp'], 600, MINIATURA)

    expect(criarSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('nao dispara tudo de uma vez quando a lista e grande', async () => {
    // Uma chamada por caminho e barata em oito, que e a pagina do feed. As
    // enquetes de um grupo grande pedem dezenas, e sem janela isso viraria
    // dezenas de requisicoes simultaneas no celular.
    let emVoo = 0
    let pico = 0
    criarSignedUrl.mockImplementation(async (caminho: string) => {
      emVoo += 1
      pico = Math.max(pico, emVoo)
      await Promise.resolve()
      emVoo -= 1
      return { data: { signedUrl: `https://x/${caminho}` }, error: null }
    })

    const caminhos = Array.from({ length: 30 }, (_, i) => `u/${i}.webp`)
    const url = await assinarEmLote('checkins', caminhos, 600, GRANDE)

    expect(url.size).toBe(30)
    expect(pico).toBeLessThanOrEqual(8)
  })

  it('deixa de fora so a foto que falhou, sem derrubar o lote', async () => {
    criarSignedUrl.mockImplementation((caminho: string) =>
      caminho === 'u/ruim.webp'
        ? Promise.resolve({ data: null, error: new Error('sem permissao') })
        : Promise.resolve({ data: { signedUrl: `https://x/${caminho}` }, error: null }),
    )

    const url = await assinarEmLote('checkins', ['u/ruim.webp', 'u/boa.webp'], 600, GRANDE)

    expect(url.has('u/ruim.webp')).toBe(false)
    expect(url.get('u/boa.webp')).toBe('https://x/u/boa.webp')
  })
})
