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
import { rotuloFrequencia } from '@/lib/frequencia'
import { iconeDoHabito } from '@/lib/icones'
import { ehModuloHorario, estadoFaixa } from '@/lib/modulos'

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
  const [desmarcando, setDesmarcando] = useState(false)
  const entradaArquivo = useRef<HTMLInputElement>(null)
  const checkIn = useCheckIn()
  const desfazer = useDesfazerCheckIn()
  const { usuarioId } = useSessao()

  function fechar() {
    setFoto(null)
    setResultado(null)
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
  // recusado pelo servidor. Acordar e dormir exigem foto sempre, independente do
  // grupo: e a prova social do horario.
  const exigeFoto = ocorrencia.grupoExigeFoto || porHorario
  // A RPC aceita `coalesce(p_foto, o.foto_path)`: foto ja enviada num periodo
  // de varias vezes continua valendo, e travar aqui recusaria o que o servidor
  // aprovaria.
  const temFoto = Boolean(foto) || Boolean(ocorrencia.foto_path)
  const faltaFoto = exigeFoto && !temFoto
  // Duas contas diferentes na mesma RPC, e a frase precisa dizer qual delas vai
  // rodar. Marcação que ainda não pagou volta uma unidade só, e prometer que o
  // período inteiro cai faria a pessoa desistir de corrigir um copo a mais.
  const detalheDesmarcar = !feito
    ? ocorrencia.modulo === 'agua'
      ? 'Volta um copo, sem mexer no ouro.'
      : 'Volta uma marcação, sem mexer no ouro.'
    : ocorrencia.vezes_alvo > 1
      ? 'Todas as marcações deste período voltam atrás, com o ouro.'
      : 'O ouro deste check-in volta atrás.'

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

        {ocorrencia.grupoNome && (
          <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
            <Users className="size-4 shrink-0" />
            {ocorrencia.feitosNoGrupo} de {ocorrencia.totalGrupo} do {ocorrencia.grupoNome} já
            concluíram hoje.
          </p>
        )}

        {ocorrencia.vezes_alvo > 1 &&
          (ocorrencia.modulo === 'agua' ? (
            // Água paga uma vez só, ao fechar o dia. Sem esta linha, quem marca
            // o primeiro copo e não vê ouro nenhum acha que o check-in falhou.
            <p className="text-sm text-muted-foreground">
              Você bebeu {ocorrencia.vezes_feitas} de {ocorrencia.vezes_alvo} copos hoje. O ouro
              entra quando fechar os {ocorrencia.vezes_alvo}.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Você marcou {ocorrencia.vezes_feitas} de {ocorrencia.vezes_alvo} vezes neste período.
            </p>
          ))}

        {resultado?.bau && face && <RevelacaoBau face={face} no={resultado.no} />}

        {resultado && !resultado.ja_feito && (
          <p className="text-sm font-medium text-success">
            Mais {resultado.ouro_ganho} de ouro. Ofensiva de {resultado.streak} dias.
          </p>
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

        {!feito && faixaAberta && (
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
                      // O giro do baú leva 900ms. Fechar em 1200 apagaria o
                      // prêmio no instante em que ele aparece.
                      if (r.completou || r.ja_feito) setTimeout(fechar, r.bau ? 2600 : 1200)
                    },
                  },
                )
              }
            >
              Concluir
            </Botao>
          </>
        )}

        {temMarcacao && (
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
              onSuccess: () => {
                setResultado(null)
                setDesmarcando(false)
              },
            })
          }
        />
      </div>
    </Folha>
  )
}
