import { Camera, Coins, Flame, Undo2, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { ExcluirRotina } from '@/components/habito/ExcluirRotina'
import { Botao } from '@/components/ui/Botao'
import { Confirmar } from '@/components/ui/Confirmar'
import { Folha } from '@/components/ui/Folha'
import {
  useCheckIn,
  useDesfazerCheckIn,
  type PremioBau,
  type ResultadoCheckIn,
} from '@/hooks/useCheckIn'
import type { OcorrenciaHoje } from '@/hooks/useOcorrenciasHoje'
import { useSessao } from '@/hooks/useSessao'
import { CATALOGO, POR_ID } from '@/lib/catalogo'
import { hojeSP } from '@/lib/data'
import { rotuloFrequencia, type RegraFrequencia } from '@/lib/frequencia'
import { iconeDoHabito } from '@/lib/icones'
import { ehModuloHorario, estadoFaixa, exigeFotoNoCheckIn, type Modulo } from '@/lib/modulos'
import { cn } from '@/lib/utils'

export type FaceBau =
  | { visual: 'ouro'; rotulo: string }
  | { visual: 'item'; rotulo: string; itemId: string }
  | { visual: 'repetido'; rotulo: string }

/**
 * Decide o que o baú mostra a partir do prêmio que o servidor mandou.
 * Pura de propósito: é aqui que mora a ramificação, e é isto que o teste cobre.
 */
export function faceDoPremio(premio: PremioBau | null | undefined): FaceBau | null {
  if (!premio) return null
  if (premio.repetido) return { visual: 'repetido', rotulo: 'Nó já aberto antes. Nada novo.' }
  if (premio.tipo === 'item' && premio.item_id) {
    return { visual: 'item', rotulo: premio.item_nome ?? 'Item novo', itemId: premio.item_id }
  }
  return { visual: 'ouro', rotulo: `${premio.ouro} de ouro` }
}

/**
 * O que o botão vai marcar, nunca o que ele encerra.
 *
 * "Concluir" numa rotina de 5 copos parece fechar o dia inteiro, e foi por isso
 * que o dono procurou uma opção de marcar um copo só e concluiu que ela não
 * existia. O rótulo agora diz qual marcação vai acontecer, e na última avisa que
 * aquela fecha o período.
 */
export function rotuloMarcacao(modulo: Modulo, feitas: number, alvo: number): string {
  if (alvo <= 1) return 'Concluir'
  const proxima = feitas + 1
  if (proxima >= alvo) {
    return modulo === 'agua' ? 'Último copo, fecha o dia' : 'Última marcação, fecha o período'
  }
  return modulo === 'agua' ? `Marcar copo ${proxima} de ${alvo}` : `Marcar ${proxima} de ${alvo}`
}

/**
 * O que o desfazer vai fazer de verdade, dito antes de a pessoa confirmar.
 *
 * O eixo é o tipo de frequência, não o módulo nem `vezes_alvo`. A tela ramificava
 * pelos dois últimos e mentia duas vezes em "N vezes por semana": prometia não
 * mexer no ouro, quando o desfazer de janela devolve ouro, e prometia derrubar o
 * período inteiro, quando ele volta só a marcação de hoje.
 *
 * Pura de propósito: é aqui que mora a ramificação, e é isto que o teste cobre.
 */
export function detalheDoDesfazer(
  tipo: RegraFrequencia['tipo'],
  modulo: Modulo,
  feito: boolean,
  vezesAlvo: number,
): string {
  if (tipo === 'n_por_semana' || tipo === 'n_por_mes') {
    return 'Volta a marcação de hoje, com o ouro dela. As dos outros dias ficam.'
  }
  if (!feito) {
    return modulo === 'agua'
      ? 'Volta um copo, sem mexer no ouro.'
      : 'Volta uma marcação, sem mexer no ouro.'
  }
  return vezesAlvo > 1
    ? 'Todas as marcações de hoje voltam atrás, com o ouro.'
    : 'O ouro deste check-in volta atrás.'
}

/**
 * Rostos de enfeite do giro. NÃO vêm do servidor e não valem nada: existem só
 * para o baú demorar um instante. O prêmio de verdade é o que o servidor
 * mandou, fica embaixo desta camada e aparece quando a última fatia some.
 */
const ENFEITES = CATALOGO.filter((p) => p.slot === 'acessorio').slice(0, 4)

/** Fatias do giro, em ms. Desaceleram e somam 900. */
const FATIAS = [70, 75, 85, 95, 110, 130, 155, 180]
const INICIOS = FATIAS.map((_, i) => FATIAS.slice(0, i).reduce((soma, ms) => soma + ms, 0))

function Rosto({ face }: { face: FaceBau }) {
  if (face.visual === 'item') {
    return (
      <>
        <img
          src={POR_ID.get(face.itemId)?.arquivo}
          alt=""
          className="size-12 object-contain [image-rendering:pixelated]"
        />
        <span className="font-semibold">{face.rotulo}</span>
      </>
    )
  }
  if (face.visual === 'ouro') {
    return (
      <>
        <Coins className="size-6 text-warning" />
        <span className="text-lg font-semibold">{face.rotulo}</span>
      </>
    )
  }
  return <span className="text-sm text-muted-foreground">{face.rotulo}</span>
}

function RevelacaoBau({ face, no }: { face: FaceBau; no?: number }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-card px-3 py-3 text-center">
      <p className="text-xs text-muted-foreground">Baú do nó {no}</p>
      <div className="relative mt-2 flex h-14 items-center justify-center gap-2">
        <Rosto face={face} />
        {/* Camada de enfeite. Cobre o prêmio por 900ms e some. Sem `motion-safe`
            nada anima e o `opacity-0` mantém tudo invisível: quem pediu menos
            movimento vê o resultado na hora. */}
        {face.visual !== 'repetido' &&
          FATIAS.map((duracao, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center
                         gap-2 rounded-lg bg-card opacity-0 motion-safe:animate-giro"
              style={{ animationDelay: `${INICIOS[i]}ms`, animationDuration: `${duracao}ms` }}
            >
              {i % 2 === 0 ? (
                <Coins className="size-6 text-warning" />
              ) : (
                <img
                  src={ENFEITES[((i - 1) / 2) % ENFEITES.length].arquivo}
                  alt=""
                  className="size-12 object-contain [image-rendering:pixelated]"
                />
              )}
            </span>
          ))}
      </div>
    </div>
  )
}

export function FolhaDesafio({
  ocorrencia,
  aoFechar,
}: {
  ocorrencia: OcorrenciaHoje | null
  aoFechar: () => void
}) {
  const [foto, setFoto] = useState<File | null>(null)
  const [resultado, setResultado] = useState<ResultadoCheckIn | null>(null)
  const [devolvido, setDevolvido] = useState<number | null>(null)
  const [desmarcando, setDesmarcando] = useState(false)
  const entradaArquivo = useRef<HTMLInputElement>(null)
  const checkIn = useCheckIn()
  const desfazer = useDesfazerCheckIn()
  const { usuarioId } = useSessao()

  function fechar() {
    setFoto(null)
    setResultado(null)
    setDevolvido(null)
    setDesmarcando(false)
    // A mutation vive junto com a folha: sem limpar, o erro do desafio anterior
    // reaparece em cima do proximo.
    checkIn.reset()
    aoFechar()
  }

  if (!ocorrencia) return null

  const Icone = iconeDoHabito(ocorrencia.icone)
  const feito = ocorrencia.status === 'feito'
  // A RPC desfaz com `vezes_feitas > 0`, nao so com status feito. Quem marcou
  // 1 de 3 por engano precisa da mesma saida.
  const temMarcacao = ocorrencia.vezes_feitas > 0
  // Rotina individual e sempre de quem esta vendo. A de grupo so o dono apaga.
  const deGrupo = ocorrencia.grupoId !== null
  const podeExcluir = !deGrupo || ocorrencia.grupoDonoId === usuarioId
  const face = faceDoPremio(resultado?.premio)
  // Faixa pelo relogio do aparelho, so para a tela. Quem paga e quem recusa e o
  // servidor: se os dois discordarem, o servidor esta certo e devolve
  // `fora_da_faixa`, que o hook ja traduz.
  const porHorario = ehModuloHorario(ocorrencia.modulo)
  const faixa = porHorario ? estadoFaixa(ocorrencia.modulo, ocorrencia.config, new Date()) : null
  // Antes de abrir a janela o Concluir some igual, mas o motivo e outro: a faixa
  // ainda vai valer, entao a tela diz a partir de que horas, nao que encerrou.
  const faixaAberta = !porHorario || faixa?.estado === 'aberta'
  // A trava de verdade e a RPC. Aqui a tela so evita um Concluir que ja nasceria
  // recusado pelo servidor. A regra mora em `exigeFotoNoCheckIn`, junto com a do
  // card, e combina com a do `check_in`.
  const exigeFoto = exigeFotoNoCheckIn(ocorrencia.modulo, ocorrencia.grupoExigeFoto)
  // O servidor devolve o novo total na resposta. Sem isto o progresso so anda
  // quando a query volta, e quem marcou o copo fica olhando o numero antigo.
  const feitas = resultado?.vezes_feitas ?? ocorrencia.vezes_feitas
  const faltam = Math.max(0, ocorrencia.vezes_alvo - feitas)
  const ehAgua = ocorrencia.modulo === 'agua'
  // Foto guardada so vale de novo quando a marcacao anterior foi hoje, e o
  // cliente nao le `ultima_marcacao_sp`. Exigir a foto da vez cobre os dois
  // casos sem adivinhar: onde o servidor aceitaria a guardada, o modulo e agua,
  // que nunca exige foto.
  const temFoto = Boolean(foto)
  const faltaFoto = exigeFoto && !temFoto
  // O eixo da regra nova é o tipo de frequência, não o módulo nem `vezes_alvo`.
  // A ocorrência de "N vezes por semana" e a de "N vezes por mês" cobrem a
  // janela inteira, valem uma marcação por dia, e o desfazer delas devolve só a
  // marcação de hoje, com o ouro dela.
  const ehJanela = ocorrencia.regra.tipo === 'n_por_semana' || ocorrencia.regra.tipo === 'n_por_mes'
  const marcouHoje = ocorrencia.ultima_marcacao_sp === hojeSP()
  // O botão prometia "Marcar 2 de 3" e só descobria `ja_marcado_hoje` no clique.
  const jaMarcadoHoje = ehJanela && marcouHoje
  // Desfazer de janela só alcança a marcação de hoje. Nos outros dias a RPC
  // devolve `fora_do_dia`, e um botão que só sabe falhar não é botão.
  const podeDesfazer = temMarcacao && (!ehJanela || marcouHoje)
  const detalheDesmarcar = detalheDoDesfazer(
    ocorrencia.regra.tipo,
    ocorrencia.modulo,
    feito,
    ocorrencia.vezes_alvo,
  )

  return (
    <Folha aberta aoFechar={fechar} titulo={ocorrencia.titulo}>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <span className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icone className="size-7" />
          </span>
          <dl className="grid flex-1 grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-xs text-muted-foreground">Ofensiva</dt>
              <dd className="flex items-center justify-center gap-1 font-semibold">
                <Flame className="size-4 text-warning" />
                {ocorrencia.streak}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Ouro</dt>
              <dd className="flex items-center justify-center gap-1 font-semibold">
                <Coins className="size-4" />
                {/* O valor e o da faixa vigente. `ouro_base` guarda so a
                    primeira faixa e mentiria depois das seis da manha. */}
                {porHorario ? (faixa?.faixa ? faixa.faixa.ouro : '—') : ocorrencia.ouroBase}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{porHorario ? 'Faixa' : 'Frequência'}</dt>
              <dd className="truncate text-sm font-medium">
                {!porHorario && rotuloFrequencia(ocorrencia.regra)}
                {faixa?.estado === 'aberta' && `Até ${faixa.faixa.ate}`}
                {faixa?.estado === 'antes' && `Abre ${faixa.abre}`}
                {faixa?.estado === 'encerrada' && 'Encerrada'}
              </dd>
            </div>
          </dl>
        </div>

        {/* Progresso desenhado, não só escrito, e antes de qualquer botão: a
            frase solta em cinza foi lida e não entendida. Um traço por marcação
            mostra o que falta sem ninguém ter que contar. */}
        {ocorrencia.vezes_alvo > 1 && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold">
                {feitas} de {ocorrencia.vezes_alvo} {ehAgua ? 'copos hoje' : 'vezes no período'}
              </p>
              <p className="shrink-0 text-xs text-muted-foreground">
                {faltam > 0 ? `Faltam ${faltam}` : 'Tudo marcado'}
              </p>
            </div>
            <div className="mt-2 flex gap-1" aria-hidden="true">
              {Array.from({ length: ocorrencia.vezes_alvo }, (_, i) => (
                <span
                  key={i}
                  className={cn('h-2 flex-1 rounded-full', i < feitas ? 'bg-primary' : 'bg-border')}
                />
              ))}
            </div>
            {/* Água paga uma vez só, ao fechar o dia. Sem esta linha, quem marca
                o primeiro copo e não vê ouro nenhum acha que o check-in falhou. */}
            {ehAgua && faltam > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                O ouro entra quando fechar os {ocorrencia.vezes_alvo}.
              </p>
            )}
          </div>
        )}

        {/* Depois do próprio progresso: quantos copos faltam para mim vem antes
            de quantos do grupo já fecharam. */}
        {ocorrencia.grupoNome && (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <Users className="size-4 shrink-0" />
            {ocorrencia.feitosNoGrupo} de {ocorrencia.totalGrupo} do {ocorrencia.grupoNome} já
            concluíram hoje.
          </p>
        )}

        {resultado?.bau && face && <RevelacaoBau face={face} no={resultado.no} />}

        {/* Marcação parcial de água paga zero de propósito. Anunciar "Mais 0 de
            ouro" ali faria o check-in que deu certo parecer defeito. */}
        {resultado && !resultado.ja_feito && (resultado.ouro_ganho ?? 0) > 0 && (
          <p className="text-sm font-medium text-success">
            Mais {resultado.ouro_ganho} de ouro. Ofensiva de {resultado.streak} dias.
          </p>
        )}

        {/* O desfazer de janela devolve ouro, e a resposta do servidor era
            descartada: o saldo caía sem nenhuma explicação na tela. */}
        {devolvido !== null && devolvido > 0 && (
          <p className="text-sm font-medium">Menos {devolvido} de ouro. A marcação voltou atrás.</p>
        )}

        {resultado?.fotoFalhou && (
          <p className="text-sm text-muted-foreground">
            A foto não subiu. O hábito foi marcado mesmo assim.
          </p>
        )}

        {/* A mensagem ja vem traduzida do hook: o erro dentro do 200 vira
            excecao la, e a tela nao confere mais o corpo por fora. */}
        {checkIn.error && <p className="text-sm text-destructive">{checkIn.error.message}</p>}

        {/* Botão sumindo é conforto. Quem barra de verdade é a RPC, que devolve
            `fora_da_faixa` mesmo com a folha aberta desde antes do horário. */}
        {!feito && faixa?.estado === 'encerrada' && (
          <p className="text-sm text-destructive">
            A última faixa de horário já passou. Este check-in não conta mais hoje.
          </p>
        )}

        {!feito && faixa?.estado === 'antes' && (
          <p className="text-sm text-muted-foreground">
            Vale {faixa.faixa.ouro} de ouro. Dá para marcar a partir das {faixa.abre}.
          </p>
        )}

        {/* A janela já foi marcada hoje. Sem esta linha o botão prometia a
            próxima marcação e o servidor recusava com `ja_marcado_hoje`. */}
        {!feito && jaMarcadoHoje && (
          <p className="text-sm text-muted-foreground">
            Você já marcou esta rotina hoje. A próxima marcação conta a partir de amanhã.
          </p>
        )}

        {!feito && faixaAberta && !jaMarcadoHoje && (
          <>
            <input
              ref={entradaArquivo}
              type="file"
              accept="image/*"
              // Acordar e dormir pedem selfie: foto do quarto não prova nada.
              capture={porHorario ? 'user' : 'environment'}
              className="hidden"
              onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
            />
            <Botao
              variante="secundario"
              className="w-full"
              onClick={() => entradaArquivo.current?.click()}
            >
              <Camera className="size-4" />
              {temFoto ? 'Foto anexada' : exigeFoto ? 'Anexar foto, obrigatória' : 'Anexar foto'}
            </Botao>

            {faltaFoto && (
              <p className="text-sm text-muted-foreground">
                {porHorario
                  ? 'Anexe uma foto para concluir esta rotina.'
                  : 'Este grupo só aceita check-in com foto.'}
              </p>
            )}

            <Botao
              tamanho="lg"
              className="w-full"
              disabled={faltaFoto}
              carregando={checkIn.isPending}
              onClick={() =>
                checkIn.mutate(
                  { ocorrenciaId: ocorrencia.id, foto },
                  {
                    onSuccess: (r) => {
                      setResultado(r)
                      // Só fecha quando a marcação encerrou o período. Quem bebeu
                      // dois copos seguidos marca o segundo sem reabrir tudo.
                      // O giro do baú leva 900ms: fechar em 1200 apagaria o
                      // prêmio no instante em que ele aparece.
                      if (r.completou || r.ja_feito) setTimeout(fechar, r.bau ? 2600 : 1200)
                    },
                  },
                )
              }
            >
              {rotuloMarcacao(ocorrencia.modulo, feitas, ocorrencia.vezes_alvo)}
            </Botao>
          </>
        )}

        {podeDesfazer && (
          <Botao
            variante="secundario"
            className="w-full"
            onClick={() => {
              desfazer.reset()
              setDesmarcando(true)
            }}
          >
            <Undo2 className="size-4" />
            Marcar como não feito
          </Botao>
        )}

        {feito && (
          <Botao variante="secundario" className="w-full" onClick={fechar}>
            Fechar
          </Botao>
        )}

        {podeExcluir && (
          <ExcluirRotina
            habitId={ocorrencia.habitId}
            titulo={ocorrencia.titulo}
            deGrupo={deGrupo}
            aoExcluir={fechar}
          />
        )}

        <Confirmar
          aberta={desmarcando}
          aoFechar={() => setDesmarcando(false)}
          titulo="Marcar como não feito?"
          detalhe={detalheDesmarcar}
          rotuloConfirmar="Desmarcar"
          perigo
          carregando={desfazer.isPending}
          erro={desfazer.error?.message ?? null}
          aoConfirmar={() =>
            desfazer.mutate(ocorrencia.id, {
              onSuccess: (r) => {
                setResultado(null)
                setDevolvido(r.ouro_devolvido ?? 0)
                setDesmarcando(false)
              },
            })
          }
        />
      </div>
    </Folha>
  )
}
