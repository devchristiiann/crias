import { useQuery } from '@tanstack/react-query'
import { hojeSP, somarDias } from '@/lib/data'
import type { RegraFrequencia } from '@/lib/frequencia'
import type { ConfigModulo, Modulo } from '@/lib/modulos'
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
  /** Tipo de rotina. Decide o corpo da folha e o que a tela mostra de faixa. */
  modulo: Modulo
  /** Faixas de horario, copos por dia. Quem paga e o servidor, isto so desenha. */
  config: ConfigModulo
  lembrete: string | null
  grupoId: string | null
  grupoNome: string | null
  /** Dono do grupo. So ele pode excluir a rotina de grupo. Null em rotina individual. */
  grupoDonoId: string | null
  /** Grupo que so aceita check-in com foto. A trava de verdade e a RPC `check_in`. */
  grupoExigeFoto: boolean
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
    modulo: Modulo
    config: ConfigModulo
    lembrete_hora: string | null
    group_id: string | null
    groups: { nome: string; dono_id: string; exige_foto: boolean } | null
  }
}

export function useOcorrenciasHoje() {
  const { usuarioId } = useSessao()
  const hoje = hojeSP()
  // Dormir cedo com faixa de madrugada vence no dia seguinte: quem marca 00h15
  // ja virou o dia no relogio, e a ocorrencia certa e a de ontem, que continua
  // aberta ate 00h30. Rotina comum de ontem venceu as 23:59 e nao passa no
  // filtro de `vence_em`, entao a tela nao vira lista de pendencia velha.
  const ontem = somarDias(hoje, -1)
  const datas = [ontem, hoje]

  return useQuery({
    queryKey: ['ocorrencias', usuarioId, hoje],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<OcorrenciaHoje[]> => {
      const { data, error } = await supabase
        .from('occurrences')
        .select(
          `id, data_sp, vence_em, status, vezes_feitas, vezes_alvo, foto_path,
           habits!inner ( id, titulo, icone, ouro_base, regra_frequencia, modulo, config,
                          lembrete_hora, group_id, groups ( nome, dono_id, exige_foto ) )`,
        )
        .eq('user_id', usuarioId!)
        .in('data_sp', datas)
      if (error) throw error

      const agora = Date.now()
      const abertas = ((data ?? []) as unknown as LinhaOcorrencia[]).filter(
        (l) => l.data_sp === hoje || new Date(l.vence_em).getTime() > agora,
      )

      // Entre 00h00 e o vencimento da madrugada as duas ocorrencias de dormir
      // estao abertas ao mesmo tempo, e duas fichas iguais na tela nao dizem
      // qual delas conta. Vale a que vence primeiro, que e a da noite passada.
      const vigentes = new Map<string, LinhaOcorrencia>()
      for (const l of abertas) {
        const atual = vigentes.get(l.habits.id)
        const vence = new Date(l.vence_em).getTime()
        if (!atual || vence < new Date(atual.vence_em).getTime()) vigentes.set(l.habits.id, l)
      }
      const linhas = [...vigentes.values()]
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
          .select('habit_id, status, data_sp')
          .in('habit_id', habitosDeGrupo)
          .in('data_sp', datas)
        if (erroGrupo) throw erroGrupo

        // A chave carrega o dia junto: somar os dois dias no mesmo balde diria
        // "8 de 12 do grupo" num grupo de 6 pessoas.
        for (const linha of doGrupo ?? []) {
          const chave = `${linha.habit_id}|${linha.data_sp}`
          const atual = progresso.get(chave) ?? { feitos: 0, total: 0 }
          atual.total += 1
          if (linha.status === 'feito') atual.feitos += 1
          progresso.set(chave, atual)
        }
      }

      return linhas
        .map((l): OcorrenciaHoje => {
          const p = progresso.get(`${l.habits.id}|${l.data_sp}`) ?? { feitos: 0, total: 0 }
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
            modulo: l.habits.modulo,
            config: l.habits.config,
            lembrete: l.habits.lembrete_hora,
            grupoId: l.habits.group_id,
            grupoNome: l.habits.groups?.nome ?? null,
            grupoDonoId: l.habits.groups?.dono_id ?? null,
            grupoExigeFoto: l.habits.groups?.exige_foto ?? false,
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
