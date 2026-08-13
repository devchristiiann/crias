import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { SeletorFrequencia } from '@/components/habito/SeletorFrequencia'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import type { RegraFrequencia } from '@/lib/frequencia'
import { regraFrequenciaSchema } from '@/lib/frequencia'
import { iconeDoHabito } from '@/lib/icones'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const OURO_MAXIMO = 10

const ICONES = [
  { id: 'target', rotulo: 'Meta' },
  { id: 'dumbbell', rotulo: 'Exercício' },
  { id: 'book-open', rotulo: 'Leitura' },
  { id: 'droplet', rotulo: 'Água' },
  { id: 'moon', rotulo: 'Sono' },
  { id: 'brain', rotulo: 'Estudo' },
  { id: 'heart', rotulo: 'Saúde' },
  { id: 'wallet', rotulo: 'Dinheiro' },
] as const

export function FormularioHabito({
  grupoId,
  aoCriar,
  rotuloBotao = 'Criar hábito',
}: {
  grupoId?: string
  aoCriar?: () => void
  rotuloBotao?: string
}) {
  const cliente = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [icone, setIcone] = useState<string>('target')
  const [regra, setRegra] = useState<RegraFrequencia>({ tipo: 'diaria' })
  const [lembrete, setLembrete] = useState('')
  const [ouroBase, setOuroBase] = useState(10)
  const [erro, setErro] = useState<string | null>(null)

  const criar = useMutation({
    mutationFn: async () => {
      const validada = regraFrequenciaSchema.safeParse(regra)
      if (!validada.success) throw new Error('Frequência inválida')

      const { data, error } = await supabase.rpc('criar_habito', {
        p_titulo: titulo,
        p_regra: validada.data,
        p_icone: icone,
        p_lembrete: lembrete || null,
        p_ouro_base: ouroBase,
        p_group_id: grupoId ?? null,
      })
      if (error) throw error
      if (data?.error) throw new Error(MENSAGENS[data.error] ?? data.error)
      return data
    },
    onSuccess: () => {
      setTitulo('')
      setErro(null)
      // Estas duas chaves existem de verdade. `habitos` nao existia em useQuery
      // nenhum, entao criar desafio no grupo fechava a folha e a lista ficava
      // velha.
      cliente.invalidateQueries({ queryKey: ['ocorrencias'] })
      cliente.invalidateQueries({ queryKey: ['grupo'] })
      aoCriar?.()
    },
    onError: (e: Error) => setErro(e.message),
  })

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!criar.isPending) criar.mutate()
      }}
    >
      <Campo
        rotulo="O que você vai fazer"
        placeholder="Academia"
        value={titulo}
        maxLength={80}
        required
        onChange={(e) => setTitulo(e.target.value)}
      />

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Ícone</span>
        <div className="flex flex-wrap gap-2">
          {ICONES.map(({ id, rotulo }) => {
            const Icone = iconeDoHabito(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => setIcone(id)}
                aria-pressed={icone === id}
                aria-label={rotulo}
                className={cn(
                  'flex size-11 items-center justify-center rounded-lg border',
                  icone === id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                <Icone className="size-5" />
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Frequência</span>
        <SeletorFrequencia valor={regra} aoMudar={setRegra} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">Lembrete</span>
          <input
            type="time"
            value={lembrete}
            onChange={(e) => setLembrete(e.target.value)}
            aria-describedby="ajuda-lembrete"
            className="h-11 w-full rounded-lg border border-input bg-card px-3
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span id="ajuda-lembrete" className="block text-xs text-muted-foreground">
            Vazio: sem notificação.
          </span>
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">Ouro por vez</span>
          <input
            type="number"
            min={1}
            max={OURO_MAXIMO}
            value={ouroBase}
            // Teto de 10 travado aqui e no banco. Sem teto, quem cadastra o
            // habito define a propria recompensa e a economia perde o sentido.
            onChange={(e) =>
              setOuroBase(Math.min(OURO_MAXIMO, Math.max(1, Number(e.target.value) || 1)))
            }
            className="h-11 w-full rounded-lg border border-input bg-card px-3
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Botao type="submit" tamanho="lg" carregando={criar.isPending} className="w-full">
        {rotuloBotao}
      </Botao>
    </form>
  )
}

const MENSAGENS: Record<string, string> = {
  titulo_vazio: 'Escreva o que você vai fazer.',
  frequencia_invalida: 'Escolha uma frequência válida.',
  ouro_base_invalido: 'O ouro por vez precisa ficar entre 1 e 10.',
  grupo_invalido: 'Você não participa desse grupo.',
}
