import { useEffect } from 'react'
import { useOcorrenciasHoje } from './useOcorrenciasHoje'

type NavegadorComBadge = Navigator & {
  setAppBadge?: (contagem?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/**
 * Bolinha de contagem no icone do app instalado.
 *
 * A fonte e a mesma consulta que a tela Hoje usa, entao o numero da bolinha e
 * exatamente o numero que o usuario ve ao abrir. O Service Worker tambem mexe
 * na bolinha quando chega push com o app fechado, mas la o valor e aproximado
 * porque nao existe sessao para consultar o banco. Quem corrige e este efeito,
 * assim que o app abre.
 *
 * Safari so expoe a API com o PWA instalado na tela de inicio, e rejeita
 * quando nao esta. Bolinha e enfeite: nunca pode derrubar tela.
 */
export function useBadge() {
  const { data } = useOcorrenciasHoje()

  useEffect(() => {
    if (!data) return
    const navegador = navigator as NavegadorComBadge
    if (!navegador.setAppBadge || !navegador.clearAppBadge) return

    const pendentes = data.filter((o) => o.status !== 'feito').length
    const promessa = pendentes > 0 ? navegador.setAppBadge(pendentes) : navegador.clearAppBadge()
    promessa.catch(() => {
      // PWA nao instalado, ou permissao de notificacao negada. Sem bolinha e o
      // comportamento correto, nao um erro para mostrar ao usuario.
    })
  }, [data])
}
