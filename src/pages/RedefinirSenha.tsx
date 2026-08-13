import type { AMREntry } from '@supabase/supabase-js'
import { useMutation } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Botao } from '@/components/ui/Botao'
import { Campo } from '@/components/ui/Campo'
import { supabase } from '@/lib/supabase'

type Estado = 'verificando' | 'recuperacao' | 'logado' | 'sem_sessao' | 'salvo' | 'salvo_link'

/**
 * Prazo de validade da prova de recuperacao, contado do `timestamp` do `amr`.
 *
 * O link em si vale uma hora (`mailer_otp_exp = 3600`), entao janela maior que
 * isso nao serve para ninguem. Clicar no link e digitar uma senha leva menos de
 * um minuto; quinze absorvem a interrupcao real, procurar o gerenciador de
 * senhas ou atender o telefone, sem deixar porta aberta. O que importa e a
 * comparacao com o que existia antes: a prova nao vencia nunca.
 *
 * ponytail: o prazo e medido pelo relogio do aparelho, que o dono do aparelho
 * atrasa. Sobra a janela de quem clicou no link e abandonou sem salvar, porque
 * quem salva perde a sessao. Fechar isso de verdade pede o relogio do servidor,
 * uma requisicao a mais so para ler a data da resposta, e o interruptor nativo
 * de exigir a senha atual resolveria melhor os dois casos de uma vez.
 */
const JANELA_RECUPERACAO_MS = 15 * 60 * 1000

const MENSAGENS: Record<string, string> = {
  senha_atual_errada: 'A senha atual está errada.',
  sem_email: 'Sua conta não tem e-mail para conferir a senha.',
  'New password should be different from the old password.':
    'A senha nova precisa ser diferente da anterior.',
  'Password should be at least 8 characters.': 'A senha precisa de pelo menos 8 caracteres.',
  'Auth session missing!': 'O link expirou. Peça um novo na tela de entrada.',
}

/**
 * Fim do fluxo de recuperacao, e tambem troca de senha para quem ja esta dentro.
 *
 * Presenca de sessao NAO e prova de recuperacao: quem esta logado normalmente
 * tem sessao, e quem pega o aparelho destravado tambem. O sinal usado aqui e o
 * `amr` do proprio access token, que o servidor assina e o cliente nao forja:
 * login por senha grava `password`, e o link do e-mail grava `otp`. Este app
 * nao tem nenhum outro caminho que produza `otp` (nao existe magic link nem
 * codigo por e-mail), entao `otp` aqui significa link de recuperacao.
 *
 * O `amr`, sozinho, nao basta: foi medido contra o projeto real que ele nao
 * decai. O `otp` sobrevive a todo refresh e continua la depois da propria troca
 * de senha, e as sessoes deste projeto nao vencem (`sessions_timebox` e
 * `sessions_inactivity_timeout` em zero, refresh automatico). Sem prazo, quem
 * recuperou a senha uma vez ganhava para sempre uma rota que troca a senha sem
 * pedir a atual. Por isso a prova tem validade, medida pelo `timestamp` que o
 * proprio `amr` carrega, e o sucesso pela recuperacao encerra a sessao.
 *
 * Sem essa prova a senha atual e exigida e revalidada por `signInWithPassword`
 * antes do `updateUser`, exatamente como o bloco Conta de Ajustes: o Supabase
 * so exige sessao valida, e com a recuperacao por e-mail desligada o dono nao
 * recupera a conta sozinho depois de perdida.
 *
 * A rota fica FORA da RotaProtegida de proposito: a sessao de recuperacao
 * mandaria o usuario direto para dentro do app, e ele nunca trocaria a senha.
 */
export function RedefinirSenha() {
  const [estado, setEstado] = useState<Estado>('verificando')
  const [senhaAtual, setSenhaAtual] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [contaTrocada, setContaTrocada] = useState(false)
  const navegar = useNavigate()

  useEffect(() => {
    async function decidir() {
      // O link que o dono gera pela API admin volta com os tokens no fragmento,
      // que e o formato implicito. O cliente esta em `flowType: 'pkce'` e recusa
      // esse formato com "Not a valid PKCE flow url", entao a sessao de
      // recuperacao era descartada em silencio e o link nao funcionava para
      // ninguem. Link admin nao tem como ser PKCE: o verificador ficaria no
      // aparelho de quem pediu. Entao quem consome o fragmento e esta rota, a
      // unica que precisa dele.
      const frag = new URLSearchParams(window.location.hash.slice(1))
      const access_token = frag.get('access_token')
      const refresh_token = frag.get('refresh_token')
      if (frag.get('type') === 'recovery' && access_token && refresh_token) {
        // Quem estava neste navegador antes do fragmento. O `type=recovery` da
        // URL nao prova nada: quem monta a URL escolhe o ramo. Se o token for
        // de outra conta, a sessao de quem estava aqui e substituida, e a tela
        // precisa dizer isso antes de alguem digitar uma senha nova.
        const { data: antes } = await supabase.auth.getSession()

        const { data: nova, error } = await supabase.auth.setSession({ access_token, refresh_token })
        window.history.replaceState(null, '', window.location.pathname)

        // Retorno conferido: token do fragmento e entrada nao confiavel e pode
        // ser recusado. Sem esta checagem, a sessao antiga seguia de pe e a
        // tela trocava a senha de quem ja estava dentro, achando que era o
        // fluxo do link.
        if (error || !nova.session) {
          setEstado('sem_sessao')
          return
        }
        const antigo = antes.session?.user.id
        if (antigo && antigo !== nova.session.user.id) setContaTrocada(true)
      }

      const { data: atual } = await supabase.auth.getSession()
      setEmail(atual.session?.user.email ?? null)

      // Mora no namespace `mfa` por causa do AAL, mas e a leitura oficial do
      // `amr` do token, e evita decodificar JWT na mao. Vale tambem depois de
      // recarregar a pagina, quando o fragmento ja foi embora.
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      // O tipo aceita as duas formas do `amr`. Entrada em texto puro nao carrega
      // `timestamp`, entao nao consegue provar frescor e cai no ramo que pede a
      // senha atual, que e o lado seguro de errar. Este projeto devolve objeto.
      const metodos: (string | AMREntry)[] = data?.currentAuthenticationMethods ?? []
      const agora = Date.now()
      const veioDoLink = metodos.some(
        (m) =>
          typeof m !== 'string' &&
          m.method === 'otp' &&
          agora - m.timestamp * 1000 < JANELA_RECUPERACAO_MS,
      )
      setEstado(veioDoLink ? 'recuperacao' : data?.currentLevel ? 'logado' : 'sem_sessao')
    }

    // Falhou a leitura, ninguem troca senha: o ramo fechado e o sem sessao.
    decidir().catch(() => setEstado('sem_sessao'))
  }, [])

  const salvar = useMutation({
    mutationFn: async () => {
      setErro(null)

      const porLink = estado === 'recuperacao'

      // So a prova de recuperacao dispensa a senha atual. Qualquer outro estado
      // cai no ramo que pede, que e o lado seguro de errar.
      if (!porLink) {
        if (!email) throw new Error('sem_email')

        const { error: erroAtual } = await supabase.auth.signInWithPassword({
          email,
          password: senhaAtual,
        })
        if (erroAtual) throw new Error('senha_atual_errada')
      }

      const { error } = await supabase.auth.updateUser({ password: senha })
      if (error) throw error

      // A sessao de recuperacao nasceu de um link, nao de uma senha, e o
      // `updateUser` nao a encerra: o `amr` continua marcando `otp`. Sair em
      // escopo global mata essa sessao e tambem qualquer outra aberta na conta,
      // que e exatamente o que quer quem recupera a senha por desconfiar de
      // invasao. Entrar de novo custa a senha que a pessoa acabou de escolher e
      // nao depende de outro link, entao serve mesmo com a recuperacao por
      // e-mail desligada neste projeto.
      if (porLink) await supabase.auth.signOut({ scope: 'global' })
      return porLink
    },
    onSuccess: (porLink) => {
      setEstado(porLink ? 'salvo_link' : 'salvo')
      setTimeout(() => navegar(porLink ? '/entrar' : '/hoje', { replace: true }), 1600)
    },
    onError: (e: Error) => setErro(e.message),
  })

  const pedeSenhaAtual = estado !== 'recuperacao'
  const mensagem = erro ? (MENSAGENS[erro] ?? erro) : undefined
  const erroNaAtual = erro === 'senha_atual_errada'

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Nova senha</h1>
        <p className="text-sm text-muted-foreground">
          {pedeSenhaAtual
            ? 'Confirme a senha atual e escolha uma nova de pelo menos 8 caracteres.'
            : 'Escolha uma senha de pelo menos 8 caracteres.'}
        </p>
      </header>

      {/* De qual conta esta tela troca a senha. Quem abriu um link alheio ve
          aqui um e-mail que nao e o dele antes de digitar qualquer coisa. */}
      {email && (estado === 'recuperacao' || estado === 'logado') && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <p className="text-sm">
            Trocando a senha da conta{' '}
            <strong className="break-all font-semibold">{email}</strong>
          </p>
          {contaTrocada && (
            <p className="text-sm text-destructive">
              Este link é de outra conta, e não da que estava aberta neste aparelho. Se você não
              pediu, feche esta página sem digitar nada.
            </p>
          )}
        </div>
      )}

      {estado === 'verificando' && (
        <div className="flex justify-center py-8">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {estado === 'sem_sessao' && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="text-sm">Este link não vale mais.</p>
          <p className="text-sm text-muted-foreground">
            Links de recuperação expiram em uma hora e servem uma vez só.
          </p>
          <Link
            to="/entrar"
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            Pedir um link novo
          </Link>
        </div>
      )}

      {(estado === 'recuperacao' || estado === 'logado') && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!salvar.isPending) salvar.mutate()
          }}
        >
          {pedeSenhaAtual && (
            <Campo
              rotulo="Senha atual"
              type="password"
              autoComplete="current-password"
              value={senhaAtual}
              required
              onChange={(e) => setSenhaAtual(e.target.value)}
              erro={erroNaAtual ? mensagem : undefined}
            />
          )}
          <Campo
            rotulo="Senha nova"
            type="password"
            autoComplete="new-password"
            value={senha}
            required
            minLength={8}
            onChange={(e) => setSenha(e.target.value)}
            erro={erroNaAtual ? undefined : mensagem}
          />
          <Botao
            type="submit"
            tamanho="lg"
            className="w-full"
            disabled={senha.length < 8 || (pedeSenhaAtual && senhaAtual.length < 1)}
            carregando={salvar.isPending}
          >
            Salvar senha
          </Botao>
        </form>
      )}

      {(estado === 'salvo' || estado === 'salvo_link') && (
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <Check className="size-4 shrink-0" />
          {estado === 'salvo_link'
            ? 'Senha trocada. Entre de novo com a senha nova.'
            : 'Senha trocada. Levando você para o app.'}
        </p>
      )}
    </main>
  )
}
