import { Botao } from './Botao'

/**
 * Falha de rede tem que aparecer como falha.
 *
 * Sem isto, cada tela caia no proprio estado vazio e mentia para o usuario
 * ("voce ainda nao participa de nenhum grupo") quando na verdade a consulta
 * tinha quebrado.
 */
export function EstadoErro({
  mensagem = 'Não deu para carregar agora.',
  aoTentarDeNovo,
}: {
  mensagem?: string
  aoTentarDeNovo: () => void
}) {
  return (
    <div className="space-y-3 rounded-xl border border-destructive/40 bg-card p-4">
      <p className="text-sm text-destructive">{mensagem}</p>
      <Botao variante="secundario" onClick={aoTentarDeNovo}>
        Tentar de novo
      </Botao>
    </div>
  )
}
