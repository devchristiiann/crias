import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // O link de recuperacao de senha chega como `?code=` na URL. Com
      // detectSessionInUrl o proprio SDK troca o codigo por sessao e dispara
      // PASSWORD_RECOVERY, que e o fluxo recomendado pelo Supabase para SPA.
      detectSessionInUrl: true,
      // PKCE e o fluxo indicado para aplicacao que roda no navegador: o codigo
      // sozinho nao vale nada sem o verificador que ficou neste dispositivo.
      flowType: 'pkce',
    },
  },
)
