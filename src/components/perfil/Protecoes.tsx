import { useMutation, useQueryClient } from '@tanstack/react-query'
import { HeartPulse, Shield, Thermometer } from 'lucide-react'
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
  const [confirmando, setConfirmando] = useState<'escudo' | 'cura' | null>(null)

  const agir = useMutation({
    mutationFn: async (acao: 'escudo' | 'cura'): Promise<Resposta> => {
      const { data, error } = await supabase.rpc(acao === 'cura' ? 'curar' : 'comprar_escudo')
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
          <Shield className="size-4 text-primary" />
          Escudos
        </span>
        <span className="text-muted-foreground">{escudos}</span>
      </div>

      {doente && (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <Thermometer className="size-4 shrink-0" />
          Seu personagem está doente.
        </p>
      )}

      <div className="space-y-2">
        <Botao
          variante="secundario"
          className="w-full"
          onClick={() => {
            agir.reset()
            setConfirmando('escudo')
          }}
        >
          <Shield className="size-4" />
          Comprar escudo por {PRECO_ESCUDO}
        </Botao>

        {doente && (
          <Botao
            className="w-full"
            onClick={() => {
              agir.reset()
              setConfirmando('cura')
            }}
          >
            <HeartPulse className="size-4" />
            Curar por {PRECO_CURA}
          </Botao>
        )}
      </div>

      <Confirmar
        aberta={confirmando !== null}
        aoFechar={() => setConfirmando(null)}
        titulo={confirmando === 'cura' ? 'Curar o personagem?' : 'Comprar um escudo?'}
        detalhe={
          confirmando === 'cura'
            ? `Custa ${PRECO_CURA} de ouro.`
            : `Custa ${PRECO_ESCUDO} de ouro.`
        }
        rotuloConfirmar={confirmando === 'cura' ? 'Curar' : 'Comprar'}
        carregando={agir.isPending}
        erro={agir.error?.message ?? null}
        aoConfirmar={() => confirmando && agir.mutate(confirmando)}
      />
    </div>
  )
}
