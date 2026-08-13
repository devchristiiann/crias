/* Service Worker do Crias.
 *
 * Duas responsabilidades, nenhuma a mais: mostrar a notificacao e levar o
 * usuario ao desafio certo quando ele toca nela. Nada de cache de app aqui,
 * a Vercel ja serve os arquivos com hash no nome.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (evento) => evento.waitUntil(self.clients.claim()))

self.addEventListener('push', (evento) => {
  if (!evento.data) return

  let dados
  try {
    dados = evento.data.json()
  } catch {
    return
  }

  evento.waitUntil(
    self.registration.showNotification(dados.titulo, {
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
    }),
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

    if (acao === 'adiar') return

    if (corpo.error) {
      // Falhou de verdade: leva o usuario para a tela em vez de mentir que deu certo.
      return abrirNoDesafio(dados.url || '/hoje')
    }

    await self.registration.showNotification('Feito', {
      body: `${corpo.ouro_ganho} de ouro. Sequência de ${corpo.streak} dias.`,
      tag: dados.tag,
      icon: '/icone-192.png',
      data: dados,
    })
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
