import { supabase } from '@/lib/supabase'

export interface EnviarConviteParams {
  email: string
  papel: string
  organizacao_nome?: string | null
  site_url?: string
}

export async function enviarConviteEmail(params: EnviarConviteParams) {
  await supabase.auth.getSession()
  const { data, error } = await supabase.functions.invoke('enviar-convite', {
    body: {
      email: params.email,
      papel: params.papel,
      organizacao_nome: params.organizacao_nome ?? null,
      site_url: params.site_url ?? (typeof window !== 'undefined' ? window.location.origin : ''),
    },
  })

  if (error) {
    const status = error.context?.status ?? 0
    let detail = ''
    if (error.context) {
      try {
        const payload = await error.context.clone().json()
        detail =
          (typeof payload?.error === 'string' ? payload.error : '') +
          (typeof payload?.details?.message === 'string'
            ? ` (${payload.details.message})`
            : '')
      } catch {
        /* corpo não-JSON */
      }
    }
    throw new Error(`${status} ${detail}`.trim() || error.message)
  }

  return data
}
