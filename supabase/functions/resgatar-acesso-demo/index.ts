import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const APP_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'https://project-obra.vercel.app'

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

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Configuração do servidor incompleta' }, 500)
  }

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const id = body?.id
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return json({ error: 'Link de acesso demo inválido' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Email descartável só pra existir um auth.users de verdade — .invalid é
  // reservado por RFC 2606 pra domínio que nunca é entregável de verdade.
  const email = `demo-${crypto.randomUUID()}@demo.fgi-decision.invalid`

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData?.user) {
    console.error('Falha ao gerar magic link demo:', linkError?.message)
    return json({ error: 'Não foi possível iniciar a sessão demo' }, 500)
  }

  const { error: rpcError } = await admin.rpc('resgatar_acesso_demo', {
    p_id: id,
    p_user_id: linkData.user.id,
  })

  if (rpcError) {
    console.error('Falha ao resgatar acesso demo:', rpcError.message)
    // A RPC já valida link inválido/revogado/expirado e lança exceção — a
    // mensagem dela é segura pra mostrar direto pro visitante.
    return json({ error: rpcError.message }, 400)
  }

  return json({ hashed_token: linkData.properties.hashed_token })
})
