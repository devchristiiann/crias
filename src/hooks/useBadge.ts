import { useEffect } from 'react'
import { useNaoLidas } from './useNotificacoes'

type NavegadorComBadge = Navigator & {
  setAppBadge?: (contagem?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/**
 * Bolinha de contagem no icone do app instalado.
 *
 * A fonte e a contagem de NOTIFICACOES NAO LIDAS, e nao mais as ocorrencias
 * pendentes. A troca resolve um problema relatado de verdade: a bolinha de
 * pendentes nunca zerava, porque sempre existe rotina para amanha, e o dono lia
 * aquilo como "chegou uma notificacao que eu nao consigo abrir". Notificacao
 * nao lida o usuario zera lendo, e a lista fica em /notificacoes, entao a
 * bolinha finalmente aponta para algo com fim.
 *
 * O Service Worker tambem mexe na bolinha quando chega push com o app fechado,
 * mas la o valor e aproximado porque nao existe sessao para consultar o banco.
 * Quem corrige e este efeito, assim que o app abre.
 *
 * Safari so expoe a API com o PWA instalado na tela de inicio, e rejeita
 * quando nao esta. Bolinha e enfeite: nunca pode derrubar tela.
 */
export function useBadge() {
  const { data: naoLidas } = useNaoLidas()

  useEffect(() => {
    if (naoLidas === undefined) return
    const navegador = navigator as NavegadorComBadge
    if (!navegador.setAppBadge || !navegador.clearAppBadge) return

    const promessa = naoLidas > 0 ? navegador.setAppBadge(naoLidas) : navegador.clearAppBadge()
    promessa.catch(() => {
      // PWA nao instalado, ou permissao de notificacao negada. Sem bolinha e o
      // comportamento correto, nao um erro para mostrar ao usuario.
    })
  }, [naoLidas])
}
