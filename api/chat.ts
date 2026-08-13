// Serverless function (Vercel) — assistente de IA do dashboard. Fica no
// servidor de propósito: a chave da Groq nunca pode viver no navegador.
//
// Segurança: em vez de usar uma service-role key (que ignora RLS e exigiria
// reimplementar manualmente toda checagem de organização/projeto aqui), o
// client do Supabase é criado com o token de acesso do PRÓPRIO usuário que
// está perguntando — a mesma RLS que já protege "projetos"/"projeto_cronogramas"
// no resto do app se aplica aqui também, de graça.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Edge Function: usa a API padrão Request/Response (não precisa de
// @vercel/node) — tanto a chamada à Groq (fetch puro) quanto o SDK do
// Supabase são baseados em fetch, compatíveis com o runtime Edge.
export const config = { runtime: 'edge' }

interface WBSActivityLike {
  uid: number
  name: string
  wbs: string
  outlineNumber: string
  outlineLevel: number
  start: string
  finish: string
  percentComplete: number
  isSummary: boolean
}

// Atividade-folha já com o "caminho" da EAP resolvido (ex.: "BIOMASSA >
// COBERTURA DO ARMAZÉM > Montagem da estrutura metálica da cobertura") —
// sem isso a busca só olhava o nome da folha, e um termo como "biomassa" (que
// só existe no grupo pai na EAP, não no nome da atividade em si) não batia.
interface AtividadeComCaminho extends WBSActivityLike {
  caminho: string
}

interface CronogramaRow {
  nome: string
  dados: unknown
}

// project-store.tsx comprime "dados" com gzip antes de salvar (o timephased
// do cronograma sozinho pode passar de limite de tamanho do Supabase) —
// aqui do lado do servidor também precisa desfazer isso pra ler as atividades.
const DADOS_GZIP_KEY = '__gzip'

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function decompressDados(raw: unknown): Promise<{ activities?: WBSActivityLike[] } | null> {
  if (raw && typeof raw === 'object' && DADOS_GZIP_KEY in raw) {
    const base64 = (raw as Record<string, unknown>)[DADOS_GZIP_KEY]
    if (typeof base64 === 'string') {
      const ds = new DecompressionStream('gzip')
      const writer = ds.writable.getWriter()
      writer.write(base64ToUint8(base64) as BufferSource)
      writer.close()
      const decompressed = new Uint8Array(await new Response(ds.readable).arrayBuffer())
      return JSON.parse(new TextDecoder().decode(decompressed))
    }
  }
  return raw as { activities?: WBSActivityLike[] } | null
}

function hojeISODate(): string {
  return new Date().toISOString().slice(0, 10)
}

function diasAtraso(finish: string, percentComplete: number): number {
  const fim = new Date(finish)
  const hoje = new Date(hojeISODate())
  if (percentComplete >= 100 || fim >= hoje) return 0
  return Math.round((hoje.getTime() - fim.getTime()) / 86400000)
}

// Tira acento e caixa pra comparar — "metalica" precisa bater com "metálica".
function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

// "Bate" se TODAS as palavras do termo de busca aparecem em algum lugar do
// texto (não precisa ser a frase inteira nem estar na mesma ordem) — cobre
// tanto erro de digitação/acento quanto o usuário citar palavras do grupo
// pai (ex.: "biomassa") junto com o nome da atividade em si.
function correspondeTermo(texto: string, termo: string): boolean {
  const textoNorm = normalizar(texto)
  const tokens = normalizar(termo).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  return tokens.every((t) => textoNorm.includes(t))
}

function formatarAtividade(a: AtividadeComCaminho, cronogramaNome: string) {
  const atraso = diasAtraso(a.finish, a.percentComplete)
  return {
    nome: a.name,
    // Grupo/frente na EAP (sem o nome da própria atividade, só os pais) —
    // ajuda o assistente a "relacionar" quando há nomes parecidos em frentes diferentes.
    frente: a.caminho.split(' > ').slice(0, -1).join(' > ') || null,
    codigo_edt: a.wbs,
    cronograma: cronogramaNome,
    percentual_concluido: Math.round(a.percentComplete),
    inicio: a.start?.slice(0, 10),
    termino: a.finish?.slice(0, 10),
    dias_atraso: atraso,
    status: a.percentComplete >= 100 ? 'concluída' : atraso > 0 ? 'atrasada' : 'em andamento',
  }
}

async function carregarAtividades(supabaseUser: SupabaseClient, projetoId: string): Promise<{ nome: string; activities: AtividadeComCaminho[] }[]> {
  const { data, error } = await supabaseUser
    .from('projeto_cronogramas')
    .select('nome, dados')
    .eq('projeto_id', projetoId)
    .eq('ativo', true)
  if (error) throw new Error(error.message)
  const grupos = await Promise.all(
    ((data ?? []) as CronogramaRow[]).map(async (c) => ({ nome: c.nome, dados: await decompressDados(c.dados) })),
  )
  return grupos
    .filter((c) => c.dados?.activities)
    .map((c) => {
      const todas = c.dados!.activities!
      const porOutline = new Map(todas.map((a) => [a.outlineNumber, a]))
      const caminhoDe = (a: WBSActivityLike): string => {
        const partes: string[] = []
        let atual: WBSActivityLike | undefined = a
        while (atual) {
          partes.unshift(atual.name)
          const segmentos: string[] = atual.outlineNumber ? atual.outlineNumber.split('.') : []
          const outlinePai: string | null = segmentos.length > 1 ? segmentos.slice(0, -1).join('.') : null
          atual = outlinePai ? porOutline.get(outlinePai) : undefined
        }
        return partes.join(' > ')
      }
      return {
        nome: c.nome,
        // Só folhas (não os itens "resumo" do WBS) — é o que representa
        // trabalho de verdade — mas cada uma carrega o caminho até a raiz.
        activities: todas
          .filter((a) => a.outlineLevel > 0 && !a.isSummary)
          .map((a) => ({ ...a, caminho: caminhoDe(a) })),
      }
    })
}

async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>,
  supabaseUser: SupabaseClient,
  projetoId: string,
): Promise<unknown> {
  try {
    if (nome === 'buscar_atividade') {
      const termo = typeof args.nome === 'string' ? args.nome : ''
      const grupos = await carregarAtividades(supabaseUser, projetoId)
      const todas = grupos.flatMap((g) => g.activities.map((a) => ({ a, g })))
      // Compara contra o caminho completo na EAP (grupo > subgrupo > ...
      // > atividade), não só o nome da folha — cobre o caso de o termo citar
      // o grupo/frente (ex.: "biomassa") em vez do nome exato da atividade.
      let encontradas = todas.filter(({ a }) => correspondeTermo(a.caminho, termo))
      if (encontradas.length === 0) {
        // Nenhuma bateu com TODAS as palavras — tenta nível de tolerância:
        // exige só metade delas, pra não devolver "não encontrado" só por
        // causa de uma palavra a mais, errada ou mal escrita.
        const tokens = normalizar(termo).split(/\s+/).filter(Boolean)
        const minimo = Math.max(1, Math.ceil(tokens.length / 2))
        encontradas = todas.filter(({ a }) => {
          const textoNorm = normalizar(a.caminho)
          return tokens.filter((t) => textoNorm.includes(t)).length >= minimo
        })
      }
      const resultado = encontradas.slice(0, 8).map(({ a, g }) => formatarAtividade(a, g.nome))
      return resultado.length > 0 ? resultado : { aviso: 'Nenhuma atividade encontrada com esse nome.' }
    }
    if (nome === 'listar_atrasadas') {
      const grupos = await carregarAtividades(supabaseUser, projetoId)
      const atrasadas = grupos
        .flatMap((g) => g.activities.filter((a) => diasAtraso(a.finish, a.percentComplete) > 0).map((a) => formatarAtividade(a, g.nome)))
        .sort((a, b) => b.dias_atraso - a.dias_atraso)
        .slice(0, 15)
      return atrasadas.length > 0 ? atrasadas : { aviso: 'Nenhuma atividade atrasada encontrada.' }
    }
    return { erro: `Ferramenta desconhecida: ${nome}` }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Erro ao consultar dados' }
  }
}

// Groq expõe uma API compatível com o formato de "tools" da OpenAI — sem
// SDK, só fetch puro (mais leve, sem dependência nova pra manter Edge-safe).
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_atividade',
      description: 'Busca atividades do cronograma do projeto atual pelo nome (busca parcial, case-insensitive). Retorna datas, % concluído e atraso.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Trecho do nome da atividade a buscar, ex.: "fundação"' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_atrasadas',
      description: 'Lista as atividades do cronograma do projeto atual que estão atrasadas (data de término já passou e não estão 100% concluídas).',
      parameters: { type: 'object', properties: {} },
    },
  },
] as const

interface GroqToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type GroqMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

interface GroqResponse {
  choices: { message: { content: string | null; tool_calls?: GroqToolCall[] } }[]
}

async function chamarGroq(apiKey: string, messages: GroqMessage[]): Promise<GroqResponse> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
    }),
  })
  if (!res.ok) {
    const corpo = await res.text().catch(() => '')
    throw new Error(`Groq API (${res.status}): ${corpo.slice(0, 500)}`)
  }
  return res.json()
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401 })
  }

  let body: { projetoId?: string; mensagem?: string; historico?: { role: 'user' | 'assistant'; content: string }[] }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Corpo da requisição inválido' }), { status: 400 })
  }
  const { projetoId, mensagem, historico = [] } = body
  if (!projetoId || !mensagem?.trim()) {
    return new Response(JSON.stringify({ error: 'projetoId e mensagem são obrigatórios' }), { status: 400 })
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projetoId)) {
    return new Response(JSON.stringify({ error: 'projetoId inválido' }), { status: 400 })
  }
  if (mensagem.length > 4000 || historico.length > 20 || historico.some((h) => !h?.content || h.content.length > 4000)) {
    return new Response(JSON.stringify({ error: 'Mensagem ou histórico excede o limite permitido' }), { status: 400 })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const groqKey = process.env.GROQ_API_KEY
  if (!supabaseUrl || !supabaseAnonKey || !groqKey) {
    return new Response(JSON.stringify({ error: 'Configuração do servidor incompleta' }), { status: 500 })
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: authData, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401 })
  }

  // Confirma que o token é válido e pega o nome do projeto — também serve
  // como checagem indireta de que esse projeto existe e é acessível (RLS).
  const { data: projeto, error: erroProjeto } = await supabaseUser
    .from('projetos')
    .select('nome')
    .eq('id', projetoId)
    .maybeSingle()
  if (erroProjeto) {
    return new Response(JSON.stringify({ error: `Erro ao verificar projeto: ${erroProjeto.message}` }), { status: 500 })
  }
  if (!projeto) {
    return new Response(JSON.stringify({ error: 'Projeto não encontrado ou sem permissão de acesso' }), { status: 403 })
  }

  // Rate limit: consome um "turno" do assistente de forma atômica e bloqueia
  // quem estourou a janela — protege a cota da Groq de uso abusivo/bots.
  // Configurável via env (com fallback de 20 mensagens/hora por usuário).
  const { data: chatPermitido, error: erroRateLimit } = await supabaseUser.rpc('consumir_turno_chat', {
    p_usuario_id: authData.user.id,
  })
  if (erroRateLimit) {
    console.error('Erro ao checar rate limit do chat:', erroRateLimit.message)
    return new Response(JSON.stringify({ error: 'Serviço temporariamente indisponível' }), { status: 503 })
  } else if (chatPermitido === false) {
    return new Response(
      JSON.stringify({
        error: 'Limite de mensagens atingido. Tente novamente mais tarde.',
      }),
      { status: 429 },
    )
  }

  const systemPrompt = `Você é o assistente de IA da plataforma de gestão de obras "${projeto.nome}". Responda perguntas sobre o cronograma e as atividades do projeto SEMPRE usando as ferramentas disponíveis para buscar os dados reais — nunca invente datas, percentuais ou status. A busca de atividade aceita nome parcial, incluindo palavras do grupo/frente da EAP (campo "frente" no resultado) — se a primeira busca não achar nada ou achar mais de uma atividade parecida, tente de novo com um termo mais curto (só as palavras principais) antes de desistir, e use o campo "frente" pra confirmar qual atividade é a certa quando houver mais de uma com nome parecido. Se mesmo assim a ferramenta não encontrar nada, diga isso claramente em vez de supor. Responda em português do Brasil, de forma direta e objetiva (poucas frases).`

  try {
    const messages: GroqMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historico.map((h): GroqMessage => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content })),
      { role: 'user', content: mensagem },
    ]

    let data = await chamarGroq(groqKey, messages)

    // Loop de function-calling: enquanto o modelo pedir pra chamar uma
    // ferramenta, executa e devolve o resultado, até ele responder com texto.
    let voltas = 0
    while (voltas < 4) {
      const msg = data.choices[0]?.message
      const chamadas = msg?.tool_calls
      if (!chamadas || chamadas.length === 0) break
      voltas++

      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: chamadas })
      for (const chamada of chamadas) {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(chamada.function.arguments || '{}') } catch { /* args malformados — segue com objeto vazio */ }
        const resultado = await executarFerramenta(chamada.function.name, args, supabaseUser, projetoId)
        messages.push({ role: 'tool', tool_call_id: chamada.id, content: JSON.stringify(resultado) })
      }
      data = await chamarGroq(groqKey, messages)
    }

    const texto = data.choices[0]?.message?.content || 'Não consegui formular uma resposta.'

    return new Response(JSON.stringify({ resposta: texto }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('Erro no assistente:', e)
    return new Response(JSON.stringify({ error: 'Não foi possível responder agora' }), { status: 500 })
  }
}
