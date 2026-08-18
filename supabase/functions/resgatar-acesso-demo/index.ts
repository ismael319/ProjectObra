import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// Origens permitidas a chamar esta função: produção + dev local (Vite roda
// em 5173 por padrão). Ecoa a origem da requisição em vez de fixar uma só —
// senão testar em localhost sempre esbarra em CORS bloqueado pelo navegador.
const ALLOWED_ORIGINS = new Set([
  Deno.env.get('APP_ORIGIN') ?? 'https://siga-solucoes.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://siga-solucoes.vercel.app'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

Deno.serve(async (request: Request) => {
  const cors = corsHeaders(request.headers.get('Origin'))
  const origin = request.headers.get('Origin')

  if (request.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: cors })
  }

  if (request.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405, cors)
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return json({ error: 'Origem não permitida' }, 403, cors)
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Configuração do servidor incompleta' }, 500, cors)
  }

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400, cors)
  }

  const id = body?.id
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return json({ error: 'Link de acesso demo inválido' }, 400, cors)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Valida no banco antes de criar qualquer auth.users. Isso impede que UUIDs
  // aleatórios poluam Auth e a fila de perfis pendentes.
  const { data: linkValido, error: validacaoError } = await admin.rpc('validar_acesso_demo_para_provisionamento', { p_id: id })
  if (validacaoError || !linkValido) {
    return json({ error: 'Link de acesso demo indisponível' }, 400, cors)
  }

  // Email descartável só pra existir um auth.users de verdade — .invalid é
  // reservado por RFC 2606 pra domínio que nunca é entregável de verdade.
  const email = `demo-${crypto.randomUUID()}@demo.fgi-decision.invalid`

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData?.user) {
    console.error('Falha ao gerar magic link demo:', linkError?.message)
    return json({ error: 'Não foi possível iniciar a sessão demo' }, 500, cors)
  }

  const { error: rpcError } = await admin.rpc('resgatar_acesso_demo', {
    p_id: id,
    p_user_id: linkData.user.id,
  })

  if (rpcError) {
    console.error('Falha ao resgatar acesso demo:', rpcError.message)
    // O usuário recém-criado não pode sobreviver a um provisionamento falho.
    await admin.auth.admin.deleteUser(linkData.user.id)
    return json({ error: 'Link de acesso demo indisponível' }, 400, cors)
  }

  return json({ hashed_token: linkData.properties.hashed_token }, 200, cors)
})
