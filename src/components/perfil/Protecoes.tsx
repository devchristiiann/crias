import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Botao } from '@/components/ui/Botao'
import { Confirmar } from '@/components/ui/Confirmar'
import { usePerfil } from '@/hooks/usePerfil'
import { SPRITES_UI } from '@/lib/catalogo'
import { PRECO_CURA } from '@/lib/modulos'
import { supabase } from '@/lib/supabase'

interface Resposta {
  error?: string
  falta?: number
}

/**
 * Traducao dos codigos que `curar` devolve dentro de um 200.
 * `ouro_insuficiente` fica de fora porque a mensagem dele carrega o `falta` que
 * o servidor calculou: dizer "sem ouro" sem o numero nao diz o que fazer.
 */
const ERROS: Record<string, string> = {
  nao_esta_doente: 'Seu personagem já está curado.',
}

/**
 * Arte de `scripts/gerar-sprites-ui.mjs`. Sao icone de tela, nao peca de loja:
 * nao tem id em `avatar_items`, nao tem preco e nao entram em `CATALOGO`.
 *
 * Entram como sprite e nao como icone de traco porque escudo e pocao sao itens
 * do jogo, e o jogo inteiro e pixel art. Ficam em 20px: em 16 o desenho do
 * escudo vira mancha, e 24 empurra a altura da linha.
 *
 * O caminho vem de `SPRITES_UI` e nao escrito aqui porque la ele carrega o
 * carimbo de versao do conteudo. Escrito a mao, redesenhar o escudo nao mudaria
 * a URL e o aparelho continuaria mostrando o desenho antigo.
 */
const { escudo: ESCUDO, pocao: POCAO, pocaoOuro: POCAO_OURO } = SPRITES_UI
const SPRITE = 'size-5 shrink-0'
/**
 * O mesmo sprite, sobre a propria casa.
 *
 * Dentro do botao primario a pocao e vermelha sobre vermelho e so o contorno
 * separava as duas. A arte nao muda, ela e a mesma da loja e do jogo inteiro:
 * quem muda e o fundo atras dela, que vira o quadrado de inventario e devolve
 * borda em qualquer superficie. `bg-background` porque e o unico tom que
 * contrasta com o vermelho do botao primario e com o card nos dois temas.
 */
const SPRITE_EM_BOTAO = 'size-5 shrink-0 rounded-sm bg-background'

function mensagem(resposta: Resposta): string {
  if (resposta.error === 'ouro_insuficiente') {
    const falta = resposta.falta ?? 0
    return falta === 1 ? 'Falta 1 de ouro.' : `Faltam ${falta} de ouro.`
  }
  return ERROS[resposta.error ?? ''] ?? 'Não deu para concluir agora. Tente de novo.'
}

/**
 * O que a pessoa tem guardado, e a cura, no mesmo bloco onde o estado do
 * personagem aparece.
 *
 * Comprar saiu daqui: escudo e as duas pocoes sao vendidos na aba Pocoes da
 * Loja, onde estao o preco, o saldo e o resto do inventario. Dois lugares para
 * a mesma compra divergiam de preco e de estado, como ja aconteceu com a troca
 * de personagem. A cura fica porque doenca e outra coisa: ela nao e item de
 * prateleira, e so aparece quando o personagem esta doente.
 *
 * Preco e resultado da cura vem do servidor: a constante daqui existe so para a
 * tela dizer quanto custa antes do toque.
 */
export function Protecoes({ doente, escudos }: { doente: boolean; escudos: number }) {
  const cliente = useQueryClient()
  // `escudos` continua vindo por prop, que e como a trilha ja passava, e as duas
  // pocoes saem do mesmo perfil que a trilha carregou: e o mesmo cache do React
  // Query, entao ler aqui nao custa uma ida a rede.
  const { data: perfil } = usePerfil()
  // O token nasce no toque que abre a folha de confirmacao, nao dentro de
  // `mutationFn`. Assim toda retentativa daquele mesmo toque (retry automatico
  // do React Query, ou um novo clique em Confirmar depois de um erro de rede)
  // reenvia as mesmas `variables` e o mesmo token, e a RPC devolve o resultado
  // guardado em vez de cobrar de novo. Fechar a folha ou tocar de novo em Curar
  // gera um token novo.
  const [token, setToken] = useState<string | null>(null)

  const curar = useMutation({
    mutationFn: async (p_token: string): Promise<Resposta> => {
      const { data, error } = await supabase.rpc('curar', { p_token })
      if (error) throw error
      const resposta = data as Resposta
      if (resposta?.error) throw new Error(mensagem(resposta))
      return resposta
    },
    onSuccess: () => {
      // O ouro e o estado doente moram no perfil. O grupo entra junto porque o
      // ranking e o feed desenham o mesmo doente.
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      cliente.invalidateQueries({ queryKey: ['grupo'] })
      setToken(null)
    },
  })

  const guardado = [
    { sprite: ESCUDO, nome: 'Escudos', quantidade: escudos },
    { sprite: POCAO, nome: 'Poções de vida', quantidade: perfil?.pocoes_vida ?? 0 },
    { sprite: POCAO_OURO, nome: 'Poções de ouro', quantidade: perfil?.pocoes_ouro ?? 0 },
  ]

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Guardados</h2>
        <Link
          to="/loja"
          className="-my-2 flex h-11 items-center gap-0.5 text-sm font-medium text-primary
                     hover:underline focus-visible:outline-none focus-visible:ring-2
                     focus-visible:ring-ring"
        >
          Comprar na Loja
          <ChevronRight className="size-4 shrink-0" />
        </Link>
      </div>

      <ul className="space-y-2">
        {guardado.map((item) => (
          <li key={item.nome} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              {/* `alt` vazio porque o nome do item vem escrito ao lado: com o
                  nome no sprite o leitor de tela diria a mesma coisa duas vezes. */}
              <img src={item.sprite} alt="" data-pixel className={SPRITE} />
              {item.nome}
            </span>
            <span className="text-muted-foreground">{item.quantidade}</span>
          </li>
        ))}
      </ul>

      {doente && (
        <>
          <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <img src={POCAO} alt="" data-pixel className={SPRITE} />
            Seu personagem está doente.
          </p>
          <Botao
            className="w-full"
            onClick={() => {
              curar.reset()
              setToken(crypto.randomUUID())
            }}
          >
            <img src={POCAO} alt="" data-pixel className={SPRITE_EM_BOTAO} />
            Curar por {PRECO_CURA}
          </Botao>
        </>
      )}

      <Confirmar
        aberta={token !== null}
        aoFechar={() => setToken(null)}
        titulo="Curar o personagem?"
        detalhe={`Custa ${PRECO_CURA} de ouro.`}
        rotuloConfirmar="Curar"
        carregando={curar.isPending}
        erro={curar.error?.message ?? null}
        aoConfirmar={() => token && curar.mutate(token)}
      />
    </div>
  )
}
