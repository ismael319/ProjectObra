// Serverless function (Vercel) — assistente de IA do dashboard. Fica no
// servidor de propósito: a chave da Gemini nunca pode viver no navegador.
//
// Segurança: em vez de usar uma service-role key (que ignora RLS e exigiria
// reimplementar manualmente toda checagem de organização/projeto aqui), o
// client do Supabase é criado com o token de acesso do PRÓPRIO usuário que
// está perguntando — a mesma RLS que já protege "projetos"/"projeto_cronogramas"
// no resto do app se aplica aqui também, de graça.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI, SchemaType, type Part, type Tool } from '@google/generative-ai'

// Edge Function: usa a API padrão Request/Response (não precisa de
// @vercel/node) — tanto o SDK da Gemini quanto o do Supabase são baseados
// em fetch, compatíveis com o runtime Edge.
export const config = { runtime: 'edge' }

interface WBSActivityLike {
  uid: number
  name: string
  wbs: string
  outlineLevel: number
  start: string
  finish: string
  percentComplete: number
  isSummary: boolean
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

function formatarAtividade(a: WBSActivityLike, cronogramaNome: string) {
  const atraso = diasAtraso(a.finish, a.percentComplete)
  return {
    nome: a.name,
    codigo_edt: a.wbs,
    cronograma: cronogramaNome,
    percentual_concluido: Math.round(a.percentComplete),
    inicio: a.start?.slice(0, 10),
    termino: a.finish?.slice(0, 10),
    dias_atraso: atraso,
    status: a.percentComplete >= 100 ? 'concluída' : atraso > 0 ? 'atrasada' : 'em andamento',
  }
}

async function carregarAtividades(supabaseUser: SupabaseClient, projetoId: string): Promise<{ nome: string; activities: WBSActivityLike[] }[]> {
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
    .map((c) => ({
      nome: c.nome,
      // Só folhas (não os itens "resumo" do WBS) — é o que representa trabalho de verdade.
      activities: c.dados!.activities!.filter((a) => a.outlineLevel > 0 && !a.isSummary),
    }))
}

async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>,
  supabaseUser: SupabaseClient,
  projetoId: string,
): Promise<unknown> {
  try {
    if (nome === 'buscar_atividade') {
      const termo = (typeof args.nome === 'string' ? args.nome : '').toLowerCase()
      const grupos = await carregarAtividades(supabaseUser, projetoId)
      const encontradas = grupos
        .flatMap((g) => g.activities.filter((a) => a.name.toLowerCase().includes(termo)).map((a) => formatarAtividade(a, g.nome)))
        .slice(0, 8)
      return encontradas.length > 0 ? encontradas : { aviso: 'Nenhuma atividade encontrada com esse nome.' }
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

const TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'buscar_atividade',
        description: 'Busca atividades do cronograma do projeto atual pelo nome (busca parcial, case-insensitive). Retorna datas, % concluído e atraso.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            nome: { type: SchemaType.STRING, description: 'Trecho do nome da atividade a buscar, ex.: "fundação"' },
          },
          required: ['nome'],
        },
      },
      {
        name: 'listar_atrasadas',
        description: 'Lista as atividades do cronograma do projeto atual que estão atrasadas (data de término já passou e não estão 100% concluídas).',
        parameters: { type: SchemaType.OBJECT, properties: {} },
      },
    ],
  },
]

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

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (!supabaseUrl || !supabaseAnonKey || !geminiKey) {
    return new Response(JSON.stringify({ error: 'Configuração do servidor incompleta' }), { status: 500 })
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

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

  const systemPrompt = `Você é o assistente de IA da plataforma de gestão de obras "${projeto.nome}". Responda perguntas sobre o cronograma e as atividades do projeto SEMPRE usando as ferramentas disponíveis para buscar os dados reais — nunca invente datas, percentuais ou status. Se a ferramenta não encontrar nada, diga isso claramente em vez de supor. Responda em português do Brasil, de forma direta e objetiva (poucas frases).`

  try {
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt,
      tools: TOOLS,
    })

    const chat = model.startChat({
      history: historico.map((h) => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
    })

    let result = await chat.sendMessage(mensagem)

    // Loop de function-calling: enquanto o modelo pedir pra chamar uma
    // ferramenta, executa e devolve o resultado, até ele responder com texto.
    let voltas = 0
    while (voltas < 4) {
      const chamadas = result.response.functionCalls()
      if (!chamadas || chamadas.length === 0) break
      voltas++

      const respostas: Part[] = []
      for (const chamada of chamadas) {
        const resultado = await executarFerramenta(chamada.name, chamada.args as Record<string, unknown>, supabaseUser, projetoId)
        respostas.push({ functionResponse: { name: chamada.name, response: { resultado } } })
      }
      result = await chat.sendMessage(respostas)
    }

    const texto = result.response.text() || 'Não consegui formular uma resposta.'

    return new Response(JSON.stringify({ resposta: texto }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro inesperado'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
}
