import { supabase } from '@/lib/supabase'

export interface EnviarConviteParams {
  email: string
  papel: string
  organizacao_nome?: string | null
  site_url?: string
}

export async function enviarConviteEmail(params: EnviarConviteParams) {
  const { data, error } = await supabase.functions.invoke('enviar-convite', {
    body: {
      email: params.email,
      papel: params.papel,
      organizacao_nome: params.organizacao_nome ?? null,
      site_url: params.site_url ?? (typeof window !== 'undefined' ? window.location.origin : ''),
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  return data
}
