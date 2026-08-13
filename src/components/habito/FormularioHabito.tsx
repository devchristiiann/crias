import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { SeletorFrequencia } from '@/components/habito/SeletorFrequencia'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import type { RegraFrequencia } from '@/lib/frequencia'
import { regraFrequenciaSchema } from '@/lib/frequencia'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const ICONES = ['target', 'dumbbell', 'book-open', 'droplet', 'moon', 'brain', 'heart', 'wallet'] as const

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
      cliente.invalidateQueries({ queryKey: ['ocorrencias'] })
      cliente.invalidateQueries({ queryKey: ['habitos'] })
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
          {ICONES.map((nome) => (
            <button
              key={nome}
              type="button"
              onClick={() => setIcone(nome)}
              aria-pressed={icone === nome}
              className={cn(
                'size-11 rounded-lg border text-xs capitalize',
                icone === nome
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-muted-foreground',
              )}
            >
              {nome.slice(0, 3)}
            </button>
          ))}
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
            className="h-11 w-full rounded-lg border border-input bg-card px-3
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
        <label className="space-y-1.5">
          <span className="block text-sm font-medium">Ouro por vez</span>
          <input
            type="number"
            min={1}
            max={100}
            value={ouroBase}
            onChange={(e) => setOuroBase(Number(e.target.value))}
            className="h-11 w-full rounded-lg border border-input bg-card px-3
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        Sem lembrete, o hábito aparece na lista mas não envia notificação.
      </p>

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
  ouro_base_invalido: 'O ouro por vez precisa ficar entre 1 e 100.',
  grupo_invalido: 'Você não participa desse grupo.',
}
