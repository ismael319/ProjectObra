// Serverless function (Vercel Edge) — valida token do Cloudflare Turnstile.
// O token gerado no frontend é enviado aqui, que chama a API da Cloudflare
// pra confirmar que é válido (evita bots no cadastro/login).
export const config = { runtime: 'edge' }

interface TurnstileResponse {
  success: boolean
  'error-codes'?: string[]
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY
  if (!secretKey) {
    return new Response(JSON.stringify({ error: 'Turnstile não configurado' }), { status: 500 })
  }

  let body: { token?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Corpo da requisição inválido' }), { status: 400 })
  }

  if (!body.token) {
    return new Response(JSON.stringify({ error: 'Token ausente' }), { status: 400 })
  }

  const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || ''

  const formData = new URLSearchParams()
  formData.append('secret', secretKey)
  formData.append('response', body.token)
  formData.append('remoteip', ip)

  try {
    const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    })

    const data: TurnstileResponse = await result.json()

    if (data.success) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({
      success: false,
      errors: data['error-codes'] || ['Verificação falhou'],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Erro ao validar Turnstile' }), { status: 500 })
  }
}
