import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Confirmar } from '@/components/ui/Confirmar'
import { PRECO_CURA, PRECO_ESCUDO } from '@/lib/modulos'
import { supabase } from '@/lib/supabase'

interface Resposta {
  ok?: boolean
  ouro?: number
  escudos?: number
  error?: string
  falta?: number
}

/**
 * Traducao dos codigos que `curar` e `comprar_escudo` devolvem dentro de um 200.
 * `ouro_insuficiente` fica de fora porque a mensagem dele carrega o `falta` que
 * o servidor calculou: dizer "sem ouro" sem o numero nao diz o que fazer.
 */
const ERROS: Record<string, string> = {
  nao_esta_doente: 'Seu personagem já está curado.',
}

/**
 * Arte de `scripts/gerar-sprites-ui.mjs`. Sao icone de tela, nao peca de loja:
 * nao tem id em `avatar_items`, nao tem preco e nao passam pelo catalogo.
 *
 * Entram como sprite e nao como icone de traco porque escudo e cura sao itens
 * do jogo, e o jogo inteiro e pixel art. Ficam em 20px: em 16 o desenho do
 * escudo vira mancha, e 24 empurra a altura da linha.
 */
const ESCUDO = '/sprites/ui/escudo.png'
const POCAO = '/sprites/ui/pocao-vida.png'
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
 * Escudo e cura, no mesmo bloco onde o estado do personagem aparece.
 *
 * Preco e resultado vem do servidor: as constantes daqui existem so para a tela
 * dizer quanto custa antes do toque. Se as duas divergirem, a RPC recusa e o
 * numero que a pessoa ve na folha e o que o servidor mandou.
 */
export function Protecoes({ doente, escudos }: { doente: boolean; escudos: number }) {
  const cliente = useQueryClient()
  // O token nasce no toque que abre a folha de confirmacao, junto com a acao,
  // nao dentro de `mutationFn`. Assim toda retentativa daquele mesmo toque
  // (retry automatico do React Query, ou um novo clique em Confirmar depois
  // de um erro de rede) reenvia as mesmas `variables` e o mesmo token, e a
  // RPC devolve o resultado guardado em vez de cobrar de novo. Fechar a
  // folha ou tocar de novo em Comprar escudo ou Curar gera um token novo.
  const [confirmando, setConfirmando] = useState<{ acao: 'escudo' | 'cura'; token: string } | null>(
    null,
  )

  const agir = useMutation({
    mutationFn: async ({
      acao,
      token,
    }: {
      acao: 'escudo' | 'cura'
      token: string
    }): Promise<Resposta> => {
      const { data, error } = await supabase.rpc(acao === 'cura' ? 'curar' : 'comprar_escudo', {
        p_token: token,
      })
      if (error) throw error
      const resposta = data as Resposta
      if (resposta?.error) throw new Error(mensagem(resposta))
      return resposta
    },
    onSuccess: () => {
      // O ouro, o contador de escudo e o estado doente moram todos no perfil. O
      // grupo entra junto porque o ranking e o feed desenham o mesmo doente.
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      cliente.invalidateQueries({ queryKey: ['grupo'] })
      setConfirmando(null)
    },
  })

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <img src={ESCUDO} alt="Escudo" data-pixel className={SPRITE} />
          Escudos
        </span>
        <span className="text-muted-foreground">{escudos}</span>
      </div>

      {doente && (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <img src={POCAO} alt="Poção de vida" data-pixel className={SPRITE} />
          Seu personagem está doente.
        </p>
      )}

      <div className="space-y-2">
        <Botao
          variante="secundario"
          className="w-full"
          onClick={() => {
            agir.reset()
            setConfirmando({ acao: 'escudo', token: crypto.randomUUID() })
          }}
        >
          <img src={ESCUDO} alt="Escudo" data-pixel className={SPRITE_EM_BOTAO} />
          Comprar escudo por {PRECO_ESCUDO}
        </Botao>

        {doente && (
          <Botao
            className="w-full"
            onClick={() => {
              agir.reset()
              setConfirmando({ acao: 'cura', token: crypto.randomUUID() })
            }}
          >
            <img src={POCAO} alt="Poção de vida" data-pixel className={SPRITE_EM_BOTAO} />
            Curar por {PRECO_CURA}
          </Botao>
        )}
      </div>

      <Confirmar
        aberta={confirmando !== null}
        aoFechar={() => setConfirmando(null)}
        titulo={confirmando?.acao === 'cura' ? 'Curar o personagem?' : 'Comprar um escudo?'}
        detalhe={
          confirmando?.acao === 'cura'
            ? `Custa ${PRECO_CURA} de ouro.`
            : `Custa ${PRECO_ESCUDO} de ouro.`
        }
        rotuloConfirmar={confirmando?.acao === 'cura' ? 'Curar' : 'Comprar'}
        carregando={agir.isPending}
        erro={agir.error?.message ?? null}
        aoConfirmar={() => confirmando && agir.mutate(confirmando)}
      />
    </div>
  )
}
