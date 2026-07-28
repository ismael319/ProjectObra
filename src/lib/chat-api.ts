import { supabase } from '@/lib/supabase'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Chama a Edge Function /api/chat, que segura a chave da Anthropic e usa o
// próprio token do usuário logado pra consultar o Supabase (mesma RLS de
// sempre) — nunca envia nada sensível daqui.
export async function askChatbot(projetoId: string, mensagem: string, historico: ChatMessage[]): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada — faça login novamente.')

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ projetoId, mensagem, historico }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Erro ao consultar o assistente (HTTP ${res.status})`)
  return data.resposta as string
}
