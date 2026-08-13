import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Botao } from '@/components/ui/Botao'
import { Confirmar } from '@/components/ui/Confirmar'
import { supabase } from '@/lib/supabase'

const MENSAGENS: Record<string, string> = {
  sem_permissao: 'Você não pode excluir esta rotina.',
}

/**
 * Excluir apaga a rotina, as ocorrencias e a ofensiva. Nao tem volta.
 *
 * Quem decide se o botao aparece e quem chama: dono da rotina individual, dono
 * do grupo na rotina de grupo. A RPC confere de novo do lado do servidor. A
 * tela so evita mostrar um botao que ja nasceria falhando.
 */
export function ExcluirRotina({
  habitId,
  titulo,
  deGrupo,
  compacto = false,
  aoExcluir,
}: {
  habitId: string
  titulo: string
  /** Rotina de grupo some para todos os membros. Muda a linha do aviso. */
  deGrupo: boolean
  /** Botao de icone, para usar dentro de item de lista. */
  compacto?: boolean
  aoExcluir?: () => void
}) {
  const cliente = useQueryClient()
  const [confirmando, setConfirmando] = useState(false)

  const excluir = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('excluir_habito', {
        p_habito: habitId,
      })
      if (error) throw error
      if (data?.error) throw new Error(MENSAGENS[data.error] ?? 'Não deu para excluir agora.')
      return data
    },
    onSuccess: () => {
      // Mesmas chaves que `criar_habito` invalida: a rotina entra e sai das
      // mesmas listas.
      cliente.invalidateQueries({ queryKey: ['ocorrencias'] })
      cliente.invalidateQueries({ queryKey: ['grupo'] })
      // Habito de perda so vive nesta chave: sem ela o card fica na secao
      // Evitar apontando para linha que nao existe mais.
      cliente.invalidateQueries({ queryKey: ['habitos-ruins'] })
      setConfirmando(false)
      aoExcluir?.()
    },
  })

  return (
    <>
      {compacto ? (
        <button
          type="button"
          aria-label={`Excluir ${titulo}`}
          onClick={() => setConfirmando(true)}
          className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-md
                     text-muted-foreground transition-colors hover:bg-accent
                     hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      ) : (
        <Botao variante="secundario" className="w-full" onClick={() => setConfirmando(true)}>
          <Trash2 className="size-4" />
          Excluir rotina
        </Botao>
      )}

      <Confirmar
        aberta={confirmando}
        aoFechar={() => setConfirmando(false)}
        titulo="Excluir rotina?"
        detalhe={
          deGrupo
            ? 'A rotina e todo o histórico somem para todos os membros.'
            : 'A rotina e todo o histórico somem para sempre.'
        }
        rotuloConfirmar="Excluir"
        perigo
        carregando={excluir.isPending}
        erro={excluir.error?.message ?? null}
        aoConfirmar={() => excluir.mutate()}
      />
    </>
  )
}
