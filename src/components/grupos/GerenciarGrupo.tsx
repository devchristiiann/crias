import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Camera, CameraOff, Check, LogOut, Settings2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CodigoConvite } from '@/components/grupos/CodigoConvite'
import { ExcluirRotina } from '@/components/habito/ExcluirRotina'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { Confirmar } from '@/components/ui/Confirmar'
import { Folha } from '@/components/ui/Folha'
import type { DetalheGrupo } from '@/hooks/useGrupos'
import { iconeDoHabito } from '@/lib/icones'
import { supabase } from '@/lib/supabase'

const MENSAGENS: Record<string, string> = {
  sem_permissao: 'Você não administra este grupo.',
  nome_vazio: 'Escreva um nome para o grupo.',
  dono_nao_sai: 'O dono não sai do grupo.',
}

/**
 * Administração do grupo numa folha só, atrás de uma engrenagem.
 *
 * A exclusão de desafio mora aqui, e não na lista da página, porque lá a
 * lixeira ficava encostada no conteúdo e um toque errado apagava o desafio de
 * todo mundo. Quem manda continua sendo o servidor: cada RPC confere de novo.
 */
export function GerenciarGrupo({ grupo, ehDono }: { grupo: DetalheGrupo; ehDono: boolean }) {
  const cliente = useQueryClient()
  const navegar = useNavigate()
  const [aberta, setAberta] = useState(false)
  const [confirmando, setConfirmando] = useState<'excluir' | 'sair' | null>(null)
  const [nome, setNome] = useState(grupo.nome)

  const salvarNome = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('atualizar_grupo', {
        p_grupo: grupo.id,
        p_nome: nome.trim(),
      })
      if (error) throw error
      if (data?.error) throw new Error(MENSAGENS[data.error] ?? 'Não deu para salvar agora.')
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['grupo'] }),
  })

  const alternarFoto = useMutation({
    mutationFn: async (valor: boolean) => {
      const { data, error } = await supabase.rpc('atualizar_grupo', {
        p_grupo: grupo.id,
        p_exige_foto: valor,
      })
      if (error) throw error
      if (data?.error) throw new Error(MENSAGENS[data.error] ?? 'Não deu para salvar agora.')
    },
    onSuccess: () => cliente.invalidateQueries({ queryKey: ['grupo'] }),
  })

  // Sair e excluir terminam no mesmo lugar: o grupo deixa de existir para quem
  // está olhando, então ficar na tela dele mostraria erro de carregamento.
  // A consulta DESTE grupo sai do cache em vez de ser invalidada: invalidar
  // manda o React Query buscar de novo um grupo que o RLS já não devolve, e
  // isso vira um 406 no console e uma piscada de erro antes da navegação.
  // O `todos` nao e enfeite: sem ele, quem sai do unico grupo cai na lista com
  // um item ainda em cache e o atalho de grupo unico devolve a pessoa para
  // dentro do grupo que acabou de deixar, que agora responde erro.
  function aoDeixarOGrupo() {
    navegar('/grupos?todos=1')
    cliente.removeQueries({ queryKey: ['grupo', grupo.id] })
    cliente.invalidateQueries({ queryKey: ['grupo', 'lista'] })
    cliente.invalidateQueries({ queryKey: ['ocorrencias'] })
  }

  // Dois `<dialog showModal>` empilhados sao a unica tela do app onde isso
  // aconteceria, e o comportamento varia no Safari do iPhone. Cancelar nao
  // reabre a folha: o destino esperado do Cancelar e a tela do grupo.
  function abrirConfirmacao(qual: 'excluir' | 'sair') {
    setAberta(false)
    setConfirmando(qual)
  }

  const excluirGrupo = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('excluir_grupo', { p_grupo: grupo.id })
      if (error) throw error
      if (data?.error) throw new Error(MENSAGENS[data.error] ?? 'Não deu para excluir agora.')
    },
    onSuccess: aoDeixarOGrupo,
  })

  const sairGrupo = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('sair_grupo', { p_grupo: grupo.id })
      if (error) throw error
      if (data?.error) throw new Error(MENSAGENS[data.error] ?? 'Não deu para sair agora.')
    },
    onSuccess: aoDeixarOGrupo,
  })

  return (
    <>
      {/* Quem nao e dono encontra la dentro o convite e a saida, nao a
          administracao: prometer administrar seria mentira para a maior parte
          dos membros. */}
      <button
        type="button"
        aria-label={ehDono ? 'Administrar grupo' : 'Convite e saída'}
        title={ehDono ? 'Administrar grupo' : 'Convite e saída'}
        onClick={() => {
          setNome(grupo.nome)
          setAberta(true)
        }}
        className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-md
                   text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Settings2 className="size-5" />
      </button>

      <Folha
        aberta={aberta}
        aoFechar={() => setAberta(false)}
        titulo={ehDono ? 'Administrar grupo' : 'Convite e saída'}
      >
        <div className="space-y-5">
          {/* O convite saiu da tela do grupo e mora aqui: quem ja esta dentro
              nao precisa dele todo dia, e ele era o bloco mais chamativo da
              pagina. */}
          <CodigoConvite codigo={grupo.codigo} />

          {ehDono ? (
            <>
              <div className="space-y-3">
                <Campo
                  rotulo="Nome do grupo"
                  value={nome}
                  maxLength={40}
                  onChange={(e) => setNome(e.target.value)}
                />
                <Botao
                  className="w-full"
                  disabled={nome.trim().length < 2 || nome.trim() === grupo.nome}
                  carregando={salvarNome.isPending}
                  onClick={() => salvarNome.mutate()}
                >
                  Salvar
                </Botao>
                {salvarNome.isError && (
                  <p className="text-sm text-destructive">{salvarNome.error.message}</p>
                )}
                {salvarNome.isSuccess && nome.trim() === grupo.nome && (
                  <p className="flex items-center gap-1.5 text-sm text-success">
                    <Check className="size-4" />
                    Nome salvo.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Botao
                  variante="secundario"
                  className="w-full justify-between"
                  role="switch"
                  aria-checked={grupo.exigeFoto}
                  carregando={alternarFoto.isPending}
                  onClick={() => alternarFoto.mutate(!grupo.exigeFoto)}
                >
                  Exigir foto no check-in
                  {grupo.exigeFoto ? (
                    <Camera className="size-4" />
                  ) : (
                    <CameraOff className="size-4" />
                  )}
                </Botao>
                <p className="text-xs text-muted-foreground">
                  Vale para todo desafio do grupo, menos a rotina de beber água: ela tem várias
                  marcações por dia e pediria uma foto por copo.
                </p>
                {alternarFoto.isError && (
                  <p className="text-sm text-destructive">{alternarFoto.error.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Desafios
                </h3>
                {grupo.desafios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum desafio ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {grupo.desafios.map((d) => {
                      const Icone = iconeDoHabito(d.icone)
                      return (
                        <li
                          key={d.id}
                          className="flex items-center gap-3 rounded-lg border border-border p-2"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Icone className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm">{d.titulo}</span>
                          <ExcluirRotina habitId={d.id} titulo={d.titulo} deGrupo compacto />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div className="space-y-1.5 border-t border-border pt-4">
                <Botao
                  variante="perigo"
                  className="w-full justify-between"
                  onClick={() => abrirConfirmacao('excluir')}
                >
                  Excluir grupo
                  <Trash2 className="size-4" />
                </Botao>
                <p className="text-xs text-muted-foreground">O dono exclui em vez de sair.</p>
              </div>
            </>
          ) : (
            <Botao
              variante="perigo"
              className="w-full justify-between"
              onClick={() => abrirConfirmacao('sair')}
            >
              Sair do grupo
              <LogOut className="size-4" />
            </Botao>
          )}
        </div>
      </Folha>

      <Confirmar
        aberta={confirmando === 'excluir'}
        aoFechar={() => setConfirmando(null)}
        titulo={`Excluir ${grupo.nome}?`}
        detalhe="Os desafios e o histórico somem para todos os membros."
        rotuloConfirmar="Excluir"
        perigo
        carregando={excluirGrupo.isPending}
        erro={excluirGrupo.isError ? excluirGrupo.error.message : null}
        aoConfirmar={() => excluirGrupo.mutate()}
      />

      <Confirmar
        aberta={confirmando === 'sair'}
        aoFechar={() => setConfirmando(null)}
        titulo={`Sair de ${grupo.nome}?`}
        detalhe="Você perde o histórico dos desafios deste grupo."
        rotuloConfirmar="Sair"
        perigo
        carregando={sairGrupo.isPending}
        erro={sairGrupo.isError ? sairGrupo.error.message : null}
        aoConfirmar={() => sairGrupo.mutate()}
      />
    </>
  )
}
