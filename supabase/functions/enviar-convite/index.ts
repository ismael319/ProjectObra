import { withSupabase } from 'npm:@supabase/server@^1'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const PAPEL_LABELS: Record<string, string> = {
  edicao: 'Edição',
  visualizacao: 'Visualização',
  insercao_pontual: 'Inserção Pontual',
}

const handler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Método não permitido' }, { status: 405 })
  }

  let body: { email?: string; papel?: string; organizacao_nome?: string; site_url?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { email, papel, organizacao_nome, site_url } = body ?? {}

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'Email inválido' }, { status: 400 })
  }
  if (!RESEND_API_KEY) {
    return Response.json({ error: 'RESEND_API_KEY não configurada' }, { status: 500 })
  }

  const baseUrl = (site_url ?? '').replace(/\/+$/, '')
  const signupUrl = baseUrl ? `${baseUrl}/signup` : 'a plataforma ProjectObra'
  const link = baseUrl
    ? `<a href="${signupUrl}" style="color:#2563eb;font-weight:600;">criar sua conta</a>`
    : 'criar sua conta'

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
                <strong>${organizacao_nome ?? '—'}</strong> com o papel
                <strong>${PAPEL_LABELS[papel ?? ''] ?? papel ?? '—'}</strong>.
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
                Para entrar, ${link} usando exatamente este email:
                <strong>${email}</strong>.
              </p>
              <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#374151;">
                Assim que a conta for criada, o acesso já estará liberado, sem precisar de aprovação manual.
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
    console.error('Falha ao enviar email via Resend:', data)
    return Response.json({ error: 'Falha ao enviar o email', details: data }, { status: res.status })
  }

  return Response.json(data)
}

export default { fetch: withSupabase({ auth: ['user', 'secret'] }, handler) }
