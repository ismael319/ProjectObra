import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'https://siga-solucoes.vercel.app'

const PAPEL_LABELS: Record<string, string> = {
  edicao: 'Edição',
  visualizacao: 'Visualização',
  insercao_pontual: 'Inserção Pontual',
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: CORS_HEADERS })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405)
  }

  const authHeader = request.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'Não autenticado' }, 401)
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: authData, error: authError } = await authClient.auth.getUser()

  if (authError || !authData?.user) {
    return json({ error: 'Sessão inválida ou expirada' }, 401)
  }

  let body: { conviteId?: string; token?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const conviteId = body?.conviteId
  const conviteToken = body?.token
  const legacyEmail = body?.email?.trim()
  if (
    (!conviteId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conviteId))
    && (!legacyEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(legacyEmail))
  ) {
    return json({ error: 'Convite inválido' }, 400)
  }
  if (!RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY não configurada' }, 500)
  }
  if (!conviteToken || !/^[0-9a-f]{64}$/i.test(conviteToken)) {
    return json({ error: 'Token de convite inválido' }, 400)
  }

  // O convite é carregado usando o JWT de quem chamou. A RLS de `convites`
  // decide quem pode reenviar e impede que dados arbitrários virem e-mail.
  let conviteQuery = authClient
    .from('convites')
    .select('email, papel_convidado, organizacoes(nome)')
    .is('usado_em', null)
    .is('revogado_em', null)
    .gt('expira_em', new Date().toISOString())
    .maybeSingle()

  conviteQuery = conviteId
    ? conviteQuery.eq('id', conviteId)
    : conviteQuery.ilike('email', legacyEmail!)

  const { data: convite, error: conviteError } = await conviteQuery

  if (conviteError) {
    console.error('Falha ao carregar convite:', conviteError.message)
    return json({ error: 'Não foi possível validar o convite' }, 500)
  }
  if (!convite) {
    return json({ error: 'Convite não encontrado ou sem permissão' }, 403)
  }

  const email = convite.email
  const papel = convite.papel_convidado
  const org = convite.organizacoes as { nome?: string } | { nome?: string }[] | null
  const orgName = escapeHtml(Array.isArray(org) ? (org[0]?.nome ?? '—') : (org?.nome ?? '—'))
  const papelLabel = escapeHtml(PAPEL_LABELS[papel] ?? papel)
  const safeEmail = escapeHtml(email)
  const signupUrl = `${APP_ORIGIN.replace(/\/+$/, '')}/signup?convite=${encodeURIComponent(conviteToken)}`
  const link = `<a href="${signupUrl}" style="color:#2563eb;font-weight:600;">criar sua conta</a>`

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6;padding:24px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
          <tr>
            <td>
              <h1 style="margin:0 0 16px;font-size:20px;color:#111827;">Você foi convidado para o ProjectObra</h1>
              <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#374151;">
                Olá! O seu acesso à plataforma ProjectObra foi liberado pela equipe da organização
                <strong>${orgName}</strong> com o papel
                <strong>${papelLabel}</strong>.
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
                Para entrar, ${link} usando exatamente este email:
                <strong>${safeEmail}</strong>.
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
                Este link é pessoal, válido por 7 dias e só pode ser usado uma vez.
              </p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Se você não esperava este convite, pode ignorar esta mensagem.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'ProjectObra <onboarding@resend.dev>',
      to: [email],
      subject: 'Você foi convidado para o ProjectObra',
      html,
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    console.error('Falha ao enviar email via Resend:', JSON.stringify(data))
    return json({ error: 'Falha ao enviar o email' }, res.status)
  }

  return json({ sent: true })
})
