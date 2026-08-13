import { useQuery } from '@tanstack/react-query'
import { assinarEmLote } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { useSessao } from './useSessao'

/**
 * Validade da URL assinada da capa. Curta porque o bucket e privado e o link
 * assinado vale para quem o tiver em maos, mas maior que o cache da consulta,
 * senao a imagem quebra na tela sem nenhuma nova busca acontecer.
 */
const SEGUNDOS_URL_CAPA = 600

const assinarCapas = (caminhos: string[]) => assinarEmLote('grupos', caminhos, SEGUNDOS_URL_CAPA)

export interface ResumoGrupo {
  id: string
  nome: string
  membros: number
  desafios: number
  /** Posicao do usuario no ranking do grupo. Null se ele nao aparecer na lista. */
  posicao: number | null
  /** URL assinada da capa. Null quando o grupo nao tem foto. */
  fotoUrl: string | null
}

interface LinhaGrupoLista {
  id: string
  nome: string
  foto_path: string | null
  group_members: { user_id: string; profiles: { id: string } | null }[] | null
  habits: { id: string }[] | null
}

export function useGrupos() {
  const { usuarioId } = useSessao()

  return useQuery({
    queryKey: ['grupo', 'lista', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<ResumoGrupo[]> => {
      // A posicao sai de `posicoes_grupos`, uma chamada para todos os grupos. O
      // criterio e ouro do mes, que mora em coluna que o cliente nao le, e antes
      // disto a lista embutia habito e ofensiva de todo mundo so para calcular
      // isso aqui: o volume crescia com grupos vezes desafios vezes membros.
      const [{ data, error }, { data: posicoes, error: erroPosicoes }] = await Promise.all([
        supabase
          .from('groups')
          // Sem `codigo_convite`: a lista nao mostra mais o codigo de nenhum
          // grupo, e dado que a tela nao usa nao precisa sair do banco.
          .select('id, nome, foto_path, group_members(user_id, profiles(id)), habits(id)')
          .eq('habits.ativo', true)
          // Habito de perda nao gera ocorrencia nem rende ouro: ninguem faz
          // check-in nele, entao ele nao pode entrar na contagem de desafios.
          .eq('habits.tipo', 'bom')
          .order('criado_em', { ascending: true }),
        supabase.rpc('posicoes_grupos'),
      ])
      if (error) throw error
      if (erroPosicoes) throw erroPosicoes

      // O PostgREST devolve o relacionamento para um so como objeto, mas sem os
      // tipos gerados o TypeScript infere array. O cast fica aqui, na fronteira.
      const linhas = (data ?? []) as unknown as LinhaGrupoLista[]
      const posicaoPorGrupo = new Map(
        ((posicoes ?? []) as { grupo: string; posicao: number }[]).map((p) => [p.grupo, p.posicao]),
      )

      const capas = await assinarCapas(
        linhas.map((g) => g.foto_path).filter((c): c is string => Boolean(c)),
      )

      return linhas.map((g) => {
        // Mesmo descarte que `useGrupo` faz: membro sem perfil embutido nao entra
        // no ranking, entao tambem nao pode entrar na contagem. Contar diferente
        // aqui fazia o card dizer "5 membros" e o detalhe mostrar 4, e alguem
        // achar que tinha gente saindo do grupo sozinha.
        const membros = (g.group_members ?? []).filter((m) => m.profiles !== null)

        return {
          id: g.id,
          nome: g.nome,
          membros: membros.length,
          desafios: (g.habits ?? []).length,
          posicao: posicaoPorGrupo.get(g.id) ?? null,
          fotoUrl: (g.foto_path && capas.get(g.foto_path)) || null,
        }
      })
    },
  })
}

export interface MembroGrupo {
  id: string
  nome: string
  avatarBase: string
  itemEquipado: string | null
  cenarioEquipado: string | null
  concluidosHoje: number
  streakTotal: number
  /** Ouro ganho nos desafios deste grupo no mes corrente. Criterio do ranking. */
  ouroMes: number
  /** Ouro ganho nos desafios deste grupo desde que o grupo existe. */
  ouroTotal: number
  /** Personagem doente. O grupo precisa enxergar, entao a coluna vem na consulta. */
  doente: boolean
}

/** Uma linha de `ranking_grupo`, ja na ordem do ranking. */
interface LinhaRankingGrupo {
  user_id: string
  ouro_mes: number
  ouro_total: number
  streak_total: number
  concluidos_hoje: number
}

interface LinhaMembro {
  user_id: string
  profiles: {
    id: string
    nome: string
    avatar_base: string
    item_equipado: string | null
    cenario_equipado: string | null
    doente: boolean
  } | null
}

export interface DetalheGrupo {
  id: string
  nome: string
  codigo: string
  donoId: string
  /** Grupo que exige foto obriga comprovacao no check-in de todo desafio dele. */
  exigeFoto: boolean
  /** URL assinada da capa. Null quando o grupo nao tem foto. */
  fotoUrl: string | null
  membros: MembroGrupo[]
  desafios: { id: string; titulo: string; icone: string; ouroBase: number }[]
}

export function useGrupo(grupoId: string | undefined) {
  return useQuery({
    queryKey: ['grupo', grupoId],
    enabled: Boolean(grupoId),
    queryFn: async (): Promise<DetalheGrupo> => {
      // As tres so dependem do id da rota, entao vao na mesma rodada. O ranking
      // e uma RPC porque o ouro de cada check-in nao e legivel pelo cliente: o
      // servidor devolve so o agregado por membro, ja na ordem oficial.
      const [
        { data: grupo, error },
        { data: desafios, error: erroDesafios },
        { data: ranking, error: erroRanking },
      ] = await Promise.all([
        supabase
          .from('groups')
          .select(
            'id, nome, codigo_convite, dono_id, exige_foto, foto_path, group_members(user_id, profiles(id, nome, avatar_base, item_equipado, cenario_equipado, doente))',
          )
          .eq('id', grupoId!)
          .single(),
        supabase
          .from('habits')
          .select('id, titulo, icone, ouro_base')
          .eq('group_id', grupoId!)
          .eq('ativo', true)
          // Mesmo filtro da lista: habito de perda cobra em vez de render, e a
          // lista mostraria "{ouroBase} ouro" num item que nao aceita check-in.
          .eq('tipo', 'bom'),
        supabase.rpc('ranking_grupo', { p_grupo: grupoId! }),
      ])
      if (error) throw error
      if (erroDesafios) throw erroDesafios
      // Falhar aqui em silencio zeraria o ranking inteiro sem ninguem notar.
      if (erroRanking) throw erroRanking

      const capas = await assinarCapas(grupo.foto_path ? [grupo.foto_path] : [])

      const linhasMembro = (grupo.group_members ?? []) as unknown as LinhaMembro[]
      const perfil = new Map<string, NonNullable<LinhaMembro['profiles']>>()
      for (const m of linhasMembro) {
        if (m.profiles) perfil.set(m.profiles.id, m.profiles)
      }

      // A ordem vem do banco, nao do navegador: e a mesma que a lista de grupos
      // usa para dizer em que posicao voce esta, e duas ordens diferentes
      // poriam a mesma pessoa em lugares diferentes nas duas telas.
      const membros: MembroGrupo[] = ((ranking ?? []) as LinhaRankingGrupo[])
        .map((linha) => {
          const p = perfil.get(linha.user_id)
          if (!p) return null
          return {
            id: p.id,
            nome: p.nome,
            avatarBase: p.avatar_base,
            itemEquipado: p.item_equipado,
            cenarioEquipado: p.cenario_equipado,
            concluidosHoje: linha.concluidos_hoje,
            streakTotal: linha.streak_total,
            ouroMes: linha.ouro_mes,
            ouroTotal: linha.ouro_total,
            doente: p.doente,
          }
        })
        .filter((m): m is MembroGrupo => m !== null)

      return {
        id: grupo.id,
        nome: grupo.nome,
        codigo: grupo.codigo_convite,
        donoId: grupo.dono_id,
        exigeFoto: Boolean(grupo.exige_foto),
        fotoUrl: (grupo.foto_path && capas.get(grupo.foto_path)) || null,
        membros,
        desafios: (desafios ?? []).map((d) => ({
          id: d.id,
          titulo: d.titulo,
          icone: d.icone,
          ouroBase: d.ouro_base,
        })),
      }
    },
  })
}
