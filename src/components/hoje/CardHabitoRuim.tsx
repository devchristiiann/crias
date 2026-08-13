import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Coins, Heart, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ExcluirRotina } from '@/components/habito/ExcluirRotina'
import { Botao } from '@/components/ui/Botao'
import { Confirmar } from '@/components/ui/Confirmar'
import { useGrupo } from '@/hooks/useGrupos'
import type { HabitoRuim } from '@/hooks/useHabitosRuins'
import { useSessao } from '@/hooks/useSessao'
import { iconeDoHabito } from '@/lib/icones'
import { supabase } from '@/lib/supabase'

interface ResultadoRecaida {
  vida_perdida?: number
  ouro_perdido?: number
  vida?: number
  ouro?: number
  renasceu?: boolean
  error?: string
}

export function CardHabitoRuim({ habito }: { habito: HabitoRuim }) {
  const cliente = useQueryClient()
  const Icone = iconeDoHabito(habito.icone)
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoRecaida | null>(null)
  const { usuarioId } = useSessao()
  // Mesma regra da folha do desafio: rotina individual e sempre de quem esta
  // vendo, rotina de grupo so o dono apaga. A consulta so roda quando o habito
  // e de grupo, que e o caso raro.
  const deGrupo = habito.grupoId !== null
  const { data: grupo } = useGrupo(habito.grupoId ?? undefined)
  const podeExcluir = !deGrupo || grupo?.donoId === usuarioId

  // O saldo da recaida some sozinho. Quem quiser o historico completo tem a
  // linha do tempo da vida, nao um aviso preso no card.
  useEffect(() => {
    if (!resultado) return
    const relogio = setTimeout(() => setResultado(null), 6000)
    return () => clearTimeout(relogio)
  }, [resultado])

  const recair = useMutation({
    mutationFn: async (): Promise<ResultadoRecaida> => {
      const { data, error } = await supabase.rpc('registrar_recaida', { p_habito: habito.id })
      if (error) throw error
      const resposta = data as ResultadoRecaida
      if (resposta?.error) {
        throw new Error(
          resposta.error === 'sem_permissao'
            ? 'Você não pode registrar recaída neste hábito.'
            : 'Não deu para registrar agora.',
        )
      }
      return resposta
    },
    onSuccess: (resposta) => {
      cliente.invalidateQueries({ queryKey: ['perfil'] })
      cliente.invalidateQueries({ queryKey: ['trilha'] })
      cliente.invalidateQueries({ queryKey: ['vida'] })
      // Renascer zera TODAS as ofensivas do usuario. A chama da tela Hoje e o
      // ranking do grupo ficariam com o total velho.
      cliente.invalidateQueries({ queryKey: ['ocorrencias'] })
      cliente.invalidateQueries({ queryKey: ['grupo'] })
      setConfirmando(false)
      setResultado(resposta)
    },
  })

  return (
    <>
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        {/* Titulo em cima, sozinho, e os botoes embaixo. Em linha unica com
            Recai e lixeira ao lado, um titulo de 30 caracteres ja virava
            reticencia em tela de 360, escondendo justamente o que o card diz. */}
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <Icone className="size-5" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block break-words font-medium">{habito.titulo}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Heart className="size-3" />5 de vida
              </span>
              {habito.puneOuro && (
                <span className="flex items-center gap-1">
                  <Coins className="size-3" />
                  {habito.ouroBase} de ouro
                </span>
              )}
              {habito.grupoNome && (
                <span className="flex items-center gap-1">
                  <Users className="size-3" />
                  {habito.grupoNome}
                </span>
              )}
            </span>
          </span>

          {/* Unica saida para tirar um habito de perda da tela: ele nao gera
              ocorrencia, entao nunca aparece na folha do desafio. */}
          {podeExcluir && (
            <ExcluirRotina habitId={habito.id} titulo={habito.titulo} deGrupo={deGrupo} compacto />
          )}
        </div>

        <Botao
          variante="secundario"
          className="mt-3 w-full"
          onClick={() => {
            recair.reset()
            setConfirmando(true)
          }}
        >
          Recaí
        </Botao>

        {/* Só os números que a RPC devolveu. A tela nunca calcula perda. */}
        {resultado && (
          <p className="mt-2 border-t border-border pt-2 text-sm text-destructive">
            Menos {resultado.vida_perdida} de vida
            {resultado.ouro_perdido && resultado.ouro_perdido > 0
              ? ` e ${resultado.ouro_perdido} de ouro`
              : ''}
            .
            {resultado.renasceu && (
              <span className="mt-1 block text-muted-foreground">
                A vida zerou. O personagem adoeceu, o progresso do baú voltou ao começo e a vida
                encheu de novo.
              </span>
            )}
          </p>
        )}
      </div>

      <Confirmar
        aberta={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo={`Recaí em ${habito.titulo}?`}
        detalhe={
          habito.puneOuro
            ? `Você perde 5 de vida e ${habito.ouroBase} de ouro.`
            : 'Você perde 5 de vida.'
        }
        rotuloConfirmar="Registrar"
        perigo
        carregando={recair.isPending}
        erro={recair.error?.message ?? null}
        aoConfirmar={() => recair.mutate()}
      />
    </>
  )
}
