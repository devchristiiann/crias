import { useQuery } from '@tanstack/react-query'
import { hojeSP } from '@/lib/data'
import type { RegraFrequencia } from '@/lib/frequencia'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

export interface OcorrenciaHoje {
  id: string
  data_sp: string
  vence_em: string
  status: 'pendente' | 'feito' | 'atrasado'
  vezes_feitas: number
  vezes_alvo: number
  foto_path: string | null
  habitId: string
  titulo: string
  icone: string
  ouroBase: number
  regra: RegraFrequencia
  lembrete: string | null
  grupoId: string | null
  grupoNome: string | null
  /** Dono do grupo. So ele pode excluir a rotina de grupo. Null em rotina individual. */
  grupoDonoId: string | null
  streak: number
  feitosNoGrupo: number
  totalGrupo: number
}

interface LinhaOcorrencia {
  id: string
  data_sp: string
  vence_em: string
  status: OcorrenciaHoje['status']
  vezes_feitas: number
  vezes_alvo: number
  foto_path: string | null
  habits: {
    id: string
    titulo: string
    icone: string
    ouro_base: number
    regra_frequencia: RegraFrequencia
    lembrete_hora: string | null
    group_id: string | null
    groups: { nome: string; dono_id: string } | null
  }
}

export function useOcorrenciasHoje() {
  const { usuarioId } = useSessao()
  const hoje = hojeSP()

  return useQuery({
    queryKey: ['ocorrencias', usuarioId, hoje],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<OcorrenciaHoje[]> => {
      const { data, error } = await supabase
        .from('occurrences')
        .select(
          `id, data_sp, vence_em, status, vezes_feitas, vezes_alvo, foto_path,
           habits!inner ( id, titulo, icone, ouro_base, regra_frequencia, lembrete_hora,
                          group_id, groups ( nome, dono_id ) )`,
        )
        .eq('user_id', usuarioId!)
        .eq('data_sp', hoje)
      if (error) throw error

      const linhas = (data ?? []) as unknown as LinhaOcorrencia[]
      if (linhas.length === 0) return []

      const { data: streaks, error: erroStreak } = await supabase
        .from('streaks')
        .select('habit_id, atual')
        .eq('user_id', usuarioId!)
      if (erroStreak) throw erroStreak
      const porHabito = new Map((streaks ?? []).map((s) => [s.habit_id, s.atual]))

      const habitosDeGrupo = linhas.filter((l) => l.habits.group_id).map((l) => l.habits.id)
      const progresso = new Map<string, { feitos: number; total: number }>()

      if (habitosDeGrupo.length > 0) {
        // RLS permite ler as ocorrencias dos colegas em habito de grupo.
        // E dai que sai o "4 de 6 do grupo ja foram".
        const { data: doGrupo, error: erroGrupo } = await supabase
          .from('occurrences')
          .select('habit_id, status')
          .in('habit_id', habitosDeGrupo)
          .eq('data_sp', hoje)
        if (erroGrupo) throw erroGrupo

        for (const linha of doGrupo ?? []) {
          const atual = progresso.get(linha.habit_id) ?? { feitos: 0, total: 0 }
          atual.total += 1
          if (linha.status === 'feito') atual.feitos += 1
          progresso.set(linha.habit_id, atual)
        }
      }

      return linhas
        .map((l): OcorrenciaHoje => {
          const p = progresso.get(l.habits.id) ?? { feitos: 0, total: 0 }
          return {
            id: l.id,
            data_sp: l.data_sp,
            vence_em: l.vence_em,
            status: l.status,
            vezes_feitas: l.vezes_feitas,
            vezes_alvo: l.vezes_alvo,
            foto_path: l.foto_path,
            habitId: l.habits.id,
            titulo: l.habits.titulo,
            icone: l.habits.icone,
            ouroBase: l.habits.ouro_base,
            regra: l.habits.regra_frequencia,
            lembrete: l.habits.lembrete_hora,
            grupoId: l.habits.group_id,
            grupoNome: l.habits.groups?.nome ?? null,
            grupoDonoId: l.habits.groups?.dono_id ?? null,
            streak: porHabito.get(l.habits.id) ?? 0,
            feitosNoGrupo: p.feitos,
            totalGrupo: p.total,
          }
        })
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === 'feito' ? 1 : -1
          const ha = a.lembrete ?? '99:99'
          const hb = b.lembrete ?? '99:99'
          if (ha !== hb) return ha < hb ? -1 : 1
          return a.titulo.localeCompare(b.titulo, 'pt-BR')
        })
    },
  })
}
