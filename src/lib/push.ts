import { supabase } from '@/lib/supabase'

export function pushSuportado() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** No iOS o push so funciona com o app instalado na tela de inicio. */
export function estaInstalado() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  )
}

export function precisaInstalarAntes() {
  return ehIOS() && !estaInstalado()
}

function chaveParaBytes(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const bruto = atob(base64)
  return Uint8Array.from([...bruto].map((c) => c.charCodeAt(0)))
}

export async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

export type ResultadoPush = 'ok' | 'negado' | 'sem_suporte' | 'instalar_primeiro'

export async function assinarPush(): Promise<ResultadoPush> {
  if (!pushSuportado()) return 'sem_suporte'
  if (precisaInstalarAntes()) return 'instalar_primeiro'

  const chavePublica = import.meta.env.VITE_VAPID_PUBLIC_KEY
  // Falha alto em vez de estourar dentro do atob: sem esta variavel na Vercel,
  // o push simplesmente nao existe, e silenciar isso esconderia o pilar do app.
  if (!chavePublica) throw new Error('VITE_VAPID_PUBLIC_KEY não está configurada')

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return 'negado'

  await registrarServiceWorker()
  const pronto = await navigator.serviceWorker.ready

  const existente = await pronto.pushManager.getSubscription()
  const assinatura =
    existente ??
    (await pronto.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveParaBytes(chavePublica),
    }))

  const bruta = assinatura.toJSON()
  const { data: sessao } = await supabase.auth.getUser()
  if (!sessao.user) return 'negado'

  const { error } = await supabase.from('push_subs').upsert(
    {
      user_id: sessao.user.id,
      endpoint: assinatura.endpoint,
      p256dh: bruta.keys?.p256dh ?? '',
      auth: bruta.keys?.auth ?? '',
      ultimo_ok: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error

  return 'ok'
}

/**
 * O Service Worker avisa quando o navegador trocou o endereco da assinatura.
 * Ele nao tem sessao para gravar no banco, entao quem grava e o app.
 */
export async function trocarAssinatura(antiga: string | null, nova: PushSubscriptionJSON) {
  const { data: sessao } = await supabase.auth.getUser()
  if (!sessao.user || !nova.endpoint) return

  const { error } = await supabase.from('push_subs').upsert(
    {
      user_id: sessao.user.id,
      endpoint: nova.endpoint,
      p256dh: nova.keys?.p256dh ?? '',
      auth: nova.keys?.auth ?? '',
      ultimo_ok: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error

  if (antiga && antiga !== nova.endpoint) {
    await supabase.from('push_subs').delete().eq('endpoint', antiga)
  }
}

export function permissaoAtual(): NotificationPermission | 'indisponivel' {
  if (!pushSuportado()) return 'indisponivel'
  return Notification.permission
}
