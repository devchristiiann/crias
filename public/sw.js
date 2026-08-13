/* Service Worker do Crias.
 *
 * Duas responsabilidades, nenhuma a mais: mostrar a notificacao e levar o
 * usuario ao desafio certo quando ele toca nela. Nada de cache de app aqui,
 * a Vercel ja serve os arquivos com hash no nome.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()))

/* O navegador troca o endereco da assinatura de tempos em tempos, e quando isso
 * acontece o push morre calado: a linha antiga fica no banco e nenhuma
 * notificacao chega mais. Reassinar aqui e avisar o app e o que evita isso. */
self.addEventListener('pushsubscriptionchange', (evento) => {
  evento.waitUntil(reassinar(evento))
})

async function reassinar(evento) {
  const antiga = evento.oldSubscription
  const chave = evento.oldSubscription?.options?.applicationServerKey

  if (!chave) return avisarApp({ tipo: 'push-precisa-reassinar' })

  try {
    const nova = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chave,
    })
    await avisarApp({
      tipo: 'push-reassinado',
      antiga: antiga ? antiga.endpoint : null,
      nova: nova.toJSON(),
    })
  } catch {
    // Sem sessao no Service Worker nao da para gravar no banco daqui.
    // O app grava assim que o usuario abrir.
    await avisarApp({ tipo: 'push-precisa-reassinar' })
  }
}

async function avisarApp(mensagem) {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const janela of janelas) janela.postMessage(mensagem)
}

/* Bolinha de contagem no icone do app instalado.
 *
 * Aqui nao existe sessao para consultar o banco, entao a contagem sai das
 * proprias notificacoes na bandeja: cada ocorrencia pendente tem exatamente uma,
 * com tag `occ-<id>`, e o toque novo substitui o anterior em vez de empilhar.
 * E aproximacao, e assumida: quem corrige com o numero real e o app, pelo hook
 * useBadge, assim que o usuario abre. */
async function atualizarBadge() {
  if (!self.navigator || !self.navigator.setAppBadge) return

  try {
    const abertas = await self.registration.getNotifications()
    const pendentes = abertas.filter((n) => n.tag && n.tag.startsWith('occ-')).length
    if (pendentes > 0) await self.navigator.setAppBadge(pendentes)
    else await self.navigator.clearAppBadge()
  } catch {
    // PWA nao instalado ou navegador sem a API. Sem bolinha e o certo aqui.
  }
}

self.addEventListener('push', (evento) => {
  if (!evento.data) return

  let dados
  try {
    dados = evento.data.json()
  } catch {
    return
  }

  evento.waitUntil(
    self.registration
      .showNotification(dados.titulo, {
        body: dados.corpo,
        // A tag e o id da ocorrencia: o toque novo SUBSTITUI o anterior na bandeja
        // em vez de empilhar quatro cartoes do mesmo habito.
        tag: dados.tag,
        renotify: true,
        requireInteraction: dados.toque === 'noite',
        icon: '/icone-192.png',
        badge: '/badge.png',
        data: dados,
        actions: [
          { action: 'concluir', title: 'Concluir' },
          { action: 'adiar', title: 'Depois' },
        ],
      })
      .then(atualizarBadge),
  )
})

self.addEventListener('notificationclick', (evento) => {
  const dados = evento.notification.data || {}
  evento.notification.close()

  if (evento.action === 'concluir' || evento.action === 'adiar') {
    evento.waitUntil(resolverAcao(dados, evento.action))
    return
  }

  evento.waitUntil(abrirNoDesafio(dados.url || '/hoje'))
})

async function resolverAcao(dados, acao) {
  if (!dados.api || !dados.token_rapido) return abrirNoDesafio(dados.url || '/hoje')

  try {
    const resposta = await fetch(`${dados.api}/quick-check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: dados.token_rapido, acao }),
    })
    const corpo = await resposta.json()

    if (acao === 'adiar') {
      // Adiamento que falhou nao pode sumir em silencio: a notificacao ja foi
      // fechada, entao o usuario ficaria sem lembrete e sem aviso nenhum.
      if (corpo.error) return abrirNoDesafio(dados.url || '/hoje')
      await atualizarBadge()
      return
    }

    if (corpo.error) {
      // Falhou de verdade: leva o usuario para a tela em vez de mentir que deu certo.
      return abrirNoDesafio(dados.url || '/hoje')
    }

    // Tag propria, fora do prefixo `occ-`: a confirmacao nao pode ser contada
    // como pendencia na bolinha. O cartao original ja foi fechado no clique.
    await self.registration.showNotification('Feito', {
      body: `${corpo.ouro_ganho} de ouro. Sequência de ${corpo.streak} dias.`,
      tag: `feito-${dados.tag}`,
      icon: '/icone-192.png',
      data: dados,
    })
    await atualizarBadge()
  } catch {
    await abrirNoDesafio(dados.url || '/hoje')
  }
}

async function abrirNoDesafio(url) {
  const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const aberta = janelas.find((c) => c.url.startsWith(self.location.origin))

  if (aberta) {
    await aberta.focus()
    aberta.postMessage({ tipo: 'abrir', url })
    return
  }

  await self.clients.openWindow(url)
}
