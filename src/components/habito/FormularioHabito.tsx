import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ToggleLeft, ToggleRight, X } from 'lucide-react'
import { useState } from 'react'
import { SeletorFrequencia } from '@/components/habito/SeletorFrequencia'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import type { RegraFrequencia } from '@/lib/frequencia'
import { regraFrequenciaSchema } from '@/lib/frequencia'
import { iconeDoHabito } from '@/lib/icones'
import {
  COPOS_MAX,
  COPOS_MIN,
  ICONE_MODULO,
  MAX_FAIXAS,
  OURO_MAXIMO,
  OURO_PADRAO,
  configSchema,
  ehModuloDeGrupo,
  ehModuloDuracao,
  ehModuloHorario,
  erroConfig,
  iconeModulo,
  rotuloModulo,
  type ConfigModulo,
  type Faixa,
  type Modulo,
} from '@/lib/modulos'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type TipoHabito = 'bom' | 'ruim'

/**
 * Um seletor so. O icone deixou de ser enfeite e virou o tipo da rotina: as
 * duas primeiras opcoes sao a rotina livre de sempre, as quatro ultimas trocam o
 * corpo do formulario pelo editor daquele modulo.
 *
 * `Menos tela` so entra quando a rotina nasce dentro de um grupo: fora dele nao
 * existe quem valide a declaracao, e o check-in ficaria esperando para sempre.
 */
const OPCOES: { id: string; modulo: Modulo; tipo: TipoHabito; rotulo: string }[] = [
  { id: 'fazer', modulo: 'livre', tipo: 'bom', rotulo: 'Quero fazer' },
  { id: 'evitar', modulo: 'livre', tipo: 'ruim', rotulo: 'Quero evitar' },
  { id: 'acordar', modulo: 'acordar', tipo: 'bom', rotulo: rotuloModulo('acordar') },
  { id: 'dormir', modulo: 'dormir', tipo: 'bom', rotulo: rotuloModulo('dormir') },
  { id: 'agua', modulo: 'agua', tipo: 'bom', rotulo: rotuloModulo('agua') },
  { id: 'tela', modulo: 'tela', tipo: 'bom', rotulo: rotuloModulo('tela') },
]

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

const FAIXAS_INICIAIS: Record<'acordar' | 'dormir' | 'tela', Faixa[]> = {
  acordar: [{ ate: '06:00', ouro: OURO_PADRAO }],
  dormir: [{ ate: '23:00', ouro: OURO_PADRAO }],
  // Em `tela` o valor e duracao: uma hora de uso, nao uma hora da manha.
  tela: [{ ate: '01:00', ouro: OURO_PADRAO }],
}

const CAMPO = `h-11 w-full rounded-lg border border-input bg-card px-3
               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`

function somarHora(hhmm: string, minutos: number): string {
  const total = (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + minutos + 1440) % 1440
  const hora = String(Math.floor(total / 60)).padStart(2, '0')
  return `${hora}:${String(total % 60).padStart(2, '0')}`
}

/** Sugestao de proximo alarme. Sem o teto ela vira madrugada e quebra a ordem. */
function proximoAlarme(ultimo: string): string {
  const proximo = somarHora(ultimo, 180)
  return proximo > ultimo ? proximo : '23:59'
}

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
  const [opcao, setOpcao] = useState(OPCOES[0])
  const [icone, setIcone] = useState<string>('target')
  const [regra, setRegra] = useState<RegraFrequencia>({ tipo: 'diaria' })
  const [lembrete, setLembrete] = useState('')
  const [ouroBase, setOuroBase] = useState(OURO_PADRAO)
  const [puneOuro, setPuneOuro] = useState(false)
  const [faixas, setFaixas] = useState<Faixa[]>(FAIXAS_INICIAIS.acordar)
  const [copos, setCopos] = useState(5)
  const [alarmes, setAlarmes] = useState<string[]>(['08:00', '12:00', '16:00', '20:00'])
  const [erro, setErro] = useState<string | null>(null)

  const { modulo, tipo } = opcao
  const deEvitar = tipo === 'ruim'
  const ehLivre = modulo === 'livre'
  const ehHorario = ehModuloHorario(modulo)
  const ehTela = ehModuloDuracao(modulo)
  const ehAgua = modulo === 'agua'
  // Mesmo editor de faixas para relogio e para duracao. So o rotulo muda.
  const temFaixas = ehHorario || ehTela
  const emGrupo = Boolean(grupoId)
  const opcoes = emGrupo ? OPCOES : OPCOES.filter((o) => !ehModuloDeGrupo(o.modulo))

  const config: ConfigModulo = temFaixas
    ? { faixas }
    : ehAgua
      ? { vezes: copos, lembretes: alarmes }
      : {}
  const erroModulo = erroConfig(modulo, config)

  // Rotina de horario continua avisando na hora que a pessoa escolher. O que
  // some e a frequencia, que nesses modulos e sempre diaria, e o ouro por vez,
  // que passa a vir da faixa.
  const mostraLembrete = (ehLivre && !deEvitar) || ehHorario
  const mostraOuro = ehLivre && (!deEvitar || puneOuro)

  function trocarOpcao(nova: (typeof OPCOES)[number]) {
    setOpcao(nova)
    setErro(null)
    if (nova.modulo === 'acordar' || nova.modulo === 'dormir' || nova.modulo === 'tela') {
      setFaixas(FAIXAS_INICIAIS[nova.modulo])
    }
  }

  function mudarFaixa(indice: number, mudanca: Partial<Faixa>) {
    setFaixas(faixas.map((f, i) => (i === indice ? { ...f, ...mudanca } : f)))
  }

  const criar = useMutation({
    mutationFn: async () => {
      const validada = regraFrequenciaSchema.safeParse(regra)
      if (ehLivre && !deEvitar && !validada.success) throw new Error('Frequência inválida')

      // Limite de confianca: o que vai para o banco passa pelo Zod, mesmo que a
      // tela ja tenha barrado. A trava final e a constraint da tabela.
      const validaConfig = configSchema.safeParse(config)
      if (erroModulo || !validaConfig.success) {
        throw new Error(erroModulo ?? 'Confira a configuração da rotina.')
      }

      const { data, error } = await supabase.rpc('criar_habito', {
        p_titulo: titulo,
        // Habito de perda nao tem agenda: o servidor ignora regra e lembrete.
        // Modulo tambem nao escolhe frequencia, e sempre diaria.
        p_regra: ehLivre && !deEvitar ? validada.data : { tipo: 'diaria' },
        p_icone: ehLivre ? icone : ICONE_MODULO[modulo],
        p_lembrete: mostraLembrete ? lembrete || null : null,
        // A primeira faixa e a que paga mais, e e ela que vira o `ouro_base`
        // para o resto do sistema seguir funcionando sem saber de faixa.
        // Agua nao tem campo de ouro na tela: o valor e fixo, e fica no padrao,
        // nao no teto. Amarrado ao teto, subi-lo de 10 para 30 triplicaria
        // calado o pagamento de uma rotina que ja paga varias vezes por dia.
        p_ouro_base: temFaixas ? faixas[0].ouro : ehAgua ? OURO_PADRAO : ouroBase,
        p_group_id: grupoId ?? null,
        p_tipo: tipo,
        p_pune_ouro: deEvitar && puneOuro,
        p_modulo: modulo,
        p_config: validaConfig.data,
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
      cliente.invalidateQueries({ queryKey: ['habitos-ruins'] })
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
      <div className="space-y-1.5">
        <span className="block text-sm font-medium">Tipo</span>
        <div className="flex flex-wrap gap-2">
          {opcoes.map((o) => {
            const Icone = iconeModulo(o.modulo)
            const ativa = o.id === opcao.id
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => trocarOpcao(o)}
                aria-pressed={ativa}
                className={cn(
                  'inline-flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium',
                  ativa
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground',
                )}
              >
                {o.modulo !== 'livre' && <Icone className="size-4" />}
                {o.rotulo}
              </button>
            )
          })}
        </div>
        {/* Uma linha, e so fora de grupo: quem esta dentro ve a opcao e nao
            precisa de explicacao nenhuma. */}
        {!emGrupo && (
          <p className="text-xs text-muted-foreground">
            {rotuloModulo('tela')} só existe em rotina de grupo, porque é o grupo que valida.
          </p>
        )}
      </div>

      <Campo
        rotulo={deEvitar ? 'O que você quer evitar' : 'O que você vai fazer'}
        placeholder={deEvitar ? 'Fumar' : 'Academia'}
        value={titulo}
        maxLength={80}
        required
        onChange={(e) => setTitulo(e.target.value)}
      />

      {/* No modulo o icone e fixo, entao a grade so faz sentido na rotina livre. */}
      {ehLivre && (
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
      )}

      {/* Frequencia e lembrete somem no habito de perda: o servidor ignora os
          dois, entao mostrar campo que nao vale nada só engana. */}
      {ehLivre && !deEvitar && (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium">Frequência</span>
          <SeletorFrequencia valor={regra} aoMudar={setRegra} />
        </div>
      )}

      {temFaixas && (
        <div className="space-y-2">
          <span className="block text-sm font-medium">
            {ehTela ? 'Até quanto tempo de uso' : 'Faixas de horário'}
          </span>
          <p className="text-xs text-muted-foreground">
            {ehTela
              ? 'Quanto menos tempo, mais ouro.'
              : modulo === 'acordar'
                ? 'Quanto mais cedo, mais ouro.'
                : 'Cada faixa paga menos.'}
          </p>
          {faixas.map((faixa, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_2.75rem] items-center gap-2">
              <input
                type="time"
                value={faixa.ate}
                aria-label={
                  ehTela
                    ? `Até quanto tempo de uso na faixa ${i + 1}`
                    : `Até que horas na faixa ${i + 1}`
                }
                onChange={(e) => mudarFaixa(i, { ate: e.target.value })}
                className={CAMPO}
              />
              <input
                type="number"
                min={1}
                max={OURO_MAXIMO}
                value={faixa.ouro}
                aria-label={`Ouro da faixa ${i + 1}`}
                onChange={(e) =>
                  mudarFaixa(i, {
                    ouro: Math.min(OURO_MAXIMO, Math.max(1, Number(e.target.value) || 1)),
                  })
                }
                className={CAMPO}
              />
              {faixas.length > 1 && (
                <Botao
                  variante="fantasma"
                  className="size-11 px-0"
                  aria-label={`Remover faixa ${i + 1}`}
                  onClick={() => setFaixas(faixas.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Botao>
              )}
            </div>
          ))}
          {faixas.length < MAX_FAIXAS && faixas[faixas.length - 1].ouro > 1 && (
            <Botao
              variante="secundario"
              className="w-full"
              onClick={() => {
                const ultima = faixas[faixas.length - 1]
                const proxima = somarHora(ultima.ate, 60)
                setFaixas([
                  ...faixas,
                  {
                    // `somarHora` da a volta na meia noite, que e o certo na
                    // madrugada do dormir e o errado na duracao: 23:00 de uso
                    // mais uma hora nao volta para 00:00.
                    ate: ehTela && proxima <= ultima.ate ? '23:59' : proxima,
                    ouro: Math.max(1, ultima.ouro - 3),
                  },
                ])
              }}
            >
              Adicionar faixa
            </Botao>
          )}
          <p className="text-xs text-muted-foreground">
            {ehTela
              ? 'Acima da última faixa o check-in é recusado.'
              : 'Depois da última faixa a rotina não conta e vira atrasada.'}
          </p>
        </div>
      )}

      {ehAgua && (
        <>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Copos por dia</span>
            <input
              type="number"
              min={COPOS_MIN}
              max={COPOS_MAX}
              value={copos}
              onChange={(e) => {
                const vezes = Math.min(COPOS_MAX, Math.max(COPOS_MIN, Number(e.target.value) || 0))
                setCopos(vezes)
                setAlarmes((atuais) => atuais.slice(0, vezes))
              }}
              className={cn(CAMPO, 'w-24')}
            />
          </label>

          <div className="space-y-2">
            <span className="block text-sm font-medium">Alarmes</span>
            {alarmes.map((hora, i) => (
              <div key={i} className="grid grid-cols-[1fr_2.75rem] items-center gap-2">
                <input
                  type="time"
                  value={hora}
                  aria-label={`Alarme ${i + 1}`}
                  onChange={(e) =>
                    setAlarmes(alarmes.map((h, j) => (j === i ? e.target.value : h)))
                  }
                  className={CAMPO}
                />
                <Botao
                  variante="fantasma"
                  className="size-11 px-0"
                  aria-label={`Remover alarme ${i + 1}`}
                  onClick={() => setAlarmes(alarmes.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Botao>
              </div>
            ))}
            {alarmes.length < copos && (
              <Botao
                variante="secundario"
                className="w-full"
                onClick={() =>
                  setAlarmes([
                    ...alarmes,
                    alarmes.length ? proximoAlarme(alarmes[alarmes.length - 1]) : '08:00',
                  ])
                }
              >
                Adicionar alarme
              </Botao>
            )}
            <p className="text-xs text-muted-foreground">
              Sem alarme: nenhuma notificação. O ouro só entra ao completar o dia.
            </p>
          </div>
        </>
      )}

      {erroModulo && <p className="text-sm text-destructive">{erroModulo}</p>}

      {(mostraLembrete || mostraOuro) && (
        <div className={cn('grid gap-3', mostraLembrete && mostraOuro && 'grid-cols-2')}>
          {mostraLembrete && (
            <label className="space-y-1.5">
              <span className="block text-sm font-medium">Lembrete</span>
              <input
                type="time"
                value={lembrete}
                onChange={(e) => setLembrete(e.target.value)}
                aria-describedby="ajuda-lembrete"
                className={CAMPO}
              />
              <span id="ajuda-lembrete" className="block text-xs text-muted-foreground">
                Vazio: sem notificação.
              </span>
            </label>
          )}
          {/* No habito de perda o campo so aparece quando a recaida realmente
              cobra ouro. Mostrar um valor que o servidor nao usa faz a pessoa
              escolher um numero que nao muda nada. */}
          {mostraOuro && (
            <label className="space-y-1.5">
              <span className="block text-sm font-medium">
                {deEvitar ? 'Quanto custa a recaída' : 'Ouro por vez'}
              </span>
              <input
                type="number"
                min={1}
                max={OURO_MAXIMO}
                value={ouroBase}
                // O teto vive em `OURO_MAXIMO` e esta travado tambem no banco.
                // Sem teto, quem cadastra o habito define a propria recompensa e
                // a economia perde o sentido.
                onChange={(e) =>
                  setOuroBase(Math.min(OURO_MAXIMO, Math.max(1, Number(e.target.value) || 1)))
                }
                className={CAMPO}
              />
            </label>
          )}
        </div>
      )}

      {deEvitar && (
        <div className="space-y-1.5">
          <Botao
            variante="secundario"
            className="w-full justify-between"
            role="switch"
            aria-checked={puneOuro}
            onClick={() => setPuneOuro(!puneOuro)}
          >
            Também perder ouro
            {puneOuro ? <ToggleRight className="size-4" /> : <ToggleLeft className="size-4" />}
          </Botao>
          <p className="text-xs text-muted-foreground">
            Recaída: 5 de vida{puneOuro ? ` e ${ouroBase} de ouro.` : '.'}
          </p>
        </div>
      )}

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Botao
        type="submit"
        tamanho="lg"
        carregando={criar.isPending}
        disabled={Boolean(erroModulo)}
        className="w-full"
      >
        {rotuloBotao}
      </Botao>
    </form>
  )
}

const MENSAGENS: Record<string, string> = {
  titulo_vazio: 'Escreva o que você vai fazer.',
  frequencia_invalida: 'Escolha uma frequência válida.',
  ouro_base_invalido: `O ouro por vez precisa ficar entre 1 e ${OURO_MAXIMO}.`,
  grupo_invalido: 'Você não participa desse grupo.',
  tipo_invalido: 'Escolha entre fazer e evitar.',
  modulo_invalido: 'Escolha um tipo de rotina válido.',
  config_invalida: 'Confira a configuração da rotina.',
}
