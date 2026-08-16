import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  FlaskConical,
  Map as MapIcon,
  MapPin,
  Minus,
  MessageCircle,
  PackageSearch,
  Plus,
  Sparkles,
  UserCog,
} from 'lucide-react'
import fgiLogo from '@/assets/fgi-logo.png'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { usePlanosComModulos, useCatalogoModulosComerciais } from '@/lib/modulos-comerciais-db'

type Ciclo = 'mensal' | 'semestral' | 'anual'

const DESCONTO_CICLO: Record<Ciclo, number> = {
  mensal: 0,
  semestral: 0.1,
  anual: 0.2,
}

const CICLO_LABEL: Record<Ciclo, string> = {
  mensal: 'Mensal',
  semestral: 'Semestral',
  anual: 'Anual',
}

const CATEGORIA_LABEL: Record<string, string> = {
  engenharia: 'Planejamento & Cronograma',
  qualidade: 'Qualidade',
  administracao: 'Administração & RH',
  suprimentos: 'Suprimentos',
  produtividade: 'Produtividade',
  integracoes: 'Integrações',
}

const ICONE_MODULO: Record<string, typeof Calendar> = {
  CRONOGRAMA: Calendar,
  QUALIDADE: FlaskConical,
  RH: UserCog,
  SUPRIMENTOS: PackageSearch,
  GESTAO_VISTA: MapIcon,
  MAPA_SETORES: MapPin,
  CHATBOT_IA: MessageCircle,
}

interface FaqItem {
  pergunta: string
  resposta: string
  provisorio?: boolean
}

const FAQ: FaqItem[] = [
  { pergunta: 'Existe fidelidade?', resposta: 'Resposta ainda não definida com o time comercial — texto temporário.', provisorio: true },
  {
    pergunta: 'Posso trocar de plano depois?',
    resposta: 'Sim. Upgrade e downgrade podem ser feitos a qualquer momento — ao trocar, os módulos que saírem do novo plano continuam visíveis em modo somente leitura, nada é apagado.',
  },
  {
    pergunta: 'O que conta como "obra ativa"?',
    resposta: 'Qualquer projeto com status "Ativo" no sistema. Obras arquivadas ou inativas não entram na contagem nem no limite do plano.',
  },
  {
    pergunta: 'Como funciona o limite de usuários e obras?',
    resposta: 'Cada plano inclui um número de usuários e de obras ativas simultâneas. Ao ultrapassar, cada unidade extra é cobrada pelo valor de excedente do plano escolhido.',
  },
  { pergunta: 'Como é feita a cobrança?', resposta: 'Resposta ainda não definida com o time comercial — texto temporário.', provisorio: true },
  {
    pergunta: 'Preciso de implantação? Quanto custa?',
    resposta: 'Sim, cobramos uma taxa única de cadastro e treinamento no primeiro mês (veja o valor abaixo do checkbox "Incluir custo único"). Não é recorrente.',
  },
  {
    pergunta: 'Módulos "sob orçamento" entram como?',
    resposta: 'Módulos marcados como "Sob orçamento" ainda não têm preço público definido — fale com a gente para uma proposta.',
  },
  { pergunta: 'Como cancelo a assinatura?', resposta: 'Resposta ainda não definida com o time comercial — texto temporário.', provisorio: true },
]

function formatMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Planos() {
  const [ciclo, setCiclo] = useState<Ciclo>('mensal')
  const [obrasAdicionais, setObrasAdicionais] = useState(0)
  const [incluirImplantacao, setIncluirImplantacao] = useState(true)
  const [aba, setAba] = useState('geral')
  const { data: planos = [], isLoading: carregandoPlanos } = usePlanosComModulos()
  const { data: catalogo = [] } = useCatalogoModulosComerciais()

  const desconto = DESCONTO_CICLO[ciclo]

  const modulosPorCategoria = useMemo(() => {
    const ativos = catalogo.filter((m) => m.status === 'ativo' || m.status === 'beta')
    const grupos = new Map<string, typeof ativos>()
    for (const m of ativos) {
      const chave = m.categoria ?? 'outros'
      grupos.set(chave, [...(grupos.get(chave) ?? []), m])
    }
    return grupos
  }, [catalogo])

  const nomesModulos = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const m of catalogo) mapa.set(m.codigo, m.nome)
    return mapa
  }, [catalogo])

  const modulosPrincipais = useMemo(
    () => catalogo.filter((m) => (m.status === 'ativo' || m.status === 'beta') && m.codigo !== 'WHATSAPP_RDO'),
    [catalogo],
  )
  const modulosRoadmap = catalogo.filter((m) => m.status === 'planejado')

  function badgeModulo(codigo: string, tipoCobranca: string | null) {
    const plano = planos.find((p) => p.modulos.includes(codigo))
    if (plano) return { texto: `Incluso a partir do ${plano.nome}`, cor: 'bg-slate-100 text-slate-600' }
    if (tipoCobranca) return { texto: 'Disponível avulso', cor: 'bg-blue-100 text-blue-700' }
    return { texto: 'Sob orçamento', cor: 'bg-amber-100 text-amber-700' }
  }

  const custoImplantacaoExibido = incluirImplantacao ? Math.max(...planos.map((p) => p.custo_implantacao ?? 0), 0) : 0

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-10">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900" />
      <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] bg-blue-600/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -right-40 w-[32rem] h-[32rem] bg-indigo-600/20 rounded-full blur-3xl" />

      <div className="relative max-w-5xl mx-auto space-y-8 pb-16">
        <div className="flex items-center justify-between">
          <Link to="/login" className="inline-flex items-center gap-2 text-sm text-blue-300/70 hover:text-blue-200 transition">
            <ArrowLeft size={16} />
            Voltar para o login
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg p-1">
              <img src={fgiLogo} alt="FGI Decision" className="w-full h-full object-contain" />
            </div>
            <span className="text-white font-semibold text-sm">FGI Decision</span>
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Escolha seu plano</h1>
          <p className="text-blue-200/60">Planos que acompanham o tamanho da sua operação.</p>
        </div>

        <Tabs value={aba} onValueChange={setAba} className="flex flex-col items-center">
          <TabsList className="bg-white/5 ring-1 ring-white/10 rounded-xl p-1 gap-1 h-auto">
            <TabsTrigger value="geral" className="px-4 py-2 rounded-lg text-sm font-medium text-blue-200/70 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
              Visão geral
            </TabsTrigger>
            <TabsTrigger value="comparar" className="px-4 py-2 rounded-lg text-sm font-medium text-blue-200/70 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
              Compare planos
            </TabsTrigger>
            <TabsTrigger value="faq" className="px-4 py-2 rounded-lg text-sm font-medium text-blue-200/70 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
              FAQ
            </TabsTrigger>
          </TabsList>

          {/* ============ VISÃO GERAL ============ */}
          <TabsContent value="geral" className="w-full space-y-8 mt-8">
            <div className="flex justify-center">
              <div className="inline-flex bg-white/5 ring-1 ring-white/10 rounded-xl p-1 gap-1">
                {(['mensal', 'semestral', 'anual'] as Ciclo[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCiclo(c)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                      ciclo === c ? 'bg-white text-slate-900 shadow-sm' : 'text-blue-200/70 hover:text-white'
                    }`}
                  >
                    {CICLO_LABEL[c]}
                    {DESCONTO_CICLO[c] > 0 && (
                      <span className={ciclo === c ? 'text-emerald-600 font-semibold' : 'text-emerald-400 font-semibold'}>
                        -{DESCONTO_CICLO[c] * 100}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-w-md mx-auto bg-white/5 ring-1 ring-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white uppercase tracking-wide">Obras adicionais</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setObrasAdicionais((n) => Math.max(0, n - 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                    aria-label="Diminuir"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-white font-bold w-6 text-center">{obrasAdicionais}</span>
                  <button
                    onClick={() => setObrasAdicionais((n) => Math.min(50, n + 1))}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
                    aria-label="Aumentar"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <p className="text-xs text-blue-200/50 mt-2">
                Todo plano já inclui as obras da sua base. Cada obra adicional soma o valor de excedente do plano escolhido.
              </p>
            </div>

            {carregandoPlanos ? (
              <p className="text-center text-blue-200/60 text-sm">Carregando planos...</p>
            ) : (
              <div className="grid sm:grid-cols-3 gap-6">
                {planos.map((plano) => {
                  const destaque = plano.codigo === 'PROFISSIONAL'
                  const semPreco = plano.preco_base_mensal === null
                  const precoMensalEquivalente = semPreco ? null : plano.preco_base_mensal! * (1 - desconto)
                  const precoObras = semPreco || plano.preco_obra_excedente === null ? 0 : obrasAdicionais * plano.preco_obra_excedente
                  const precoFinal = precoMensalEquivalente === null ? null : precoMensalEquivalente + precoObras
                  const implantacao = incluirImplantacao ? plano.custo_implantacao : null

                  return (
                    <div
                      key={plano.codigo}
                      className={`relative flex flex-col rounded-2xl p-6 ${
                        destaque ? 'bg-white shadow-2xl scale-[1.03] ring-2 ring-blue-500' : 'bg-white/95 shadow-lg ring-1 ring-white/10'
                      }`}
                    >
                      {destaque && (
                        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                          <Sparkles size={12} /> Mais popular
                        </span>
                      )}

                      <h3 className="text-lg font-bold text-slate-900">{plano.nome}</h3>
                      {plano.descricao && <p className="text-sm text-slate-500 mt-1 min-h-[2.5rem]">{plano.descricao}</p>}

                      <div className="mt-4 mb-1">
                        {precoFinal === null ? (
                          <span className="text-2xl font-bold text-slate-900">Sob consulta</span>
                        ) : (
                          <>
                            <span className="text-3xl font-bold text-slate-900">{formatMoeda(precoFinal)}</span>
                            <span className="text-sm text-slate-400">/mês</span>
                          </>
                        )}
                      </div>
                      {implantacao !== null && implantacao !== undefined && (
                        <p className="text-xs text-slate-400 mb-2">
                          + {formatMoeda(implantacao)} de implantação (único, no 1º mês)
                        </p>
                      )}

                      <div className="text-xs text-slate-400 mb-5">
                        {plano.limite_usuarios_incluidos !== null && plano.limite_obras_incluidas !== null
                          ? `${plano.limite_usuarios_incluidos} usuários e ${plano.limite_obras_incluidas} obra(s) inclusos`
                          : 'Limites negociados sob medida'}
                      </div>

                      <ul className="space-y-2 mb-6 flex-1">
                        {plano.modulos.map((codigo) => (
                          <li key={codigo} className="flex items-center gap-2 text-sm text-slate-700">
                            <Check size={15} className="text-emerald-500 shrink-0" />
                            {nomesModulos.get(codigo) ?? codigo}
                          </li>
                        ))}
                      </ul>

                      {semPreco ? (
                        <a
                          href="mailto:contato@fgidecision.com.br?subject=Interesse%20no%20plano%20Enterprise"
                          className="text-center w-full py-2.5 rounded-lg font-semibold text-sm bg-slate-900 text-white hover:bg-slate-800 transition"
                        >
                          Falar com a gente
                        </a>
                      ) : (
                        <Link
                          to={`/signup?plano=${plano.codigo}`}
                          className={`text-center w-full py-2.5 rounded-lg font-semibold text-sm transition ${
                            destaque ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
                          }`}
                        >
                          Começar agora
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Módulos em destaque */}
            <div className="space-y-4">
              <p className="text-center text-blue-200/70 text-sm">Cada plano combina módulos. Veja o que cada um entrega no dia a dia.</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {modulosPrincipais.map((m) => {
                  const Icone = ICONE_MODULO[m.codigo] ?? Sparkles
                  const badge = badgeModulo(m.codigo, m.tipo_cobranca)
                  return (
                    <div key={m.codigo} className="bg-white/95 rounded-xl p-5 ring-1 ring-white/10">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center mb-3">
                        <Icone size={18} className="text-slate-600" />
                      </div>
                      <h4 className="font-semibold text-slate-900 text-sm">{m.nome}</h4>
                      {m.descricao && <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{m.descricao}</p>}
                      <span className={`inline-block mt-3 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${badge.cor}`}>
                        {badge.texto}
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="text-center">
                <button
                  onClick={() => setAba('comparar')}
                  className="inline-flex items-center gap-1.5 text-sm text-blue-300 hover:text-blue-200 underline underline-offset-4 transition"
                >
                  Ver em qual plano cada módulo entra
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </TabsContent>

          {/* ============ COMPARE PLANOS ============ */}
          <TabsContent value="comparar" className="w-full mt-8">
            <div className="bg-white/5 ring-1 ring-white/10 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-white font-semibold">Compare os módulos</h2>
                <p className="text-xs text-blue-200/50 mt-0.5">Módulos fora do plano seguem disponíveis como contratação avulsa.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-blue-200/60 text-xs uppercase tracking-wide">
                      <th className="text-left px-6 py-3 font-medium">Módulo</th>
                      {planos.map((p) => (
                        <th key={p.codigo} className="text-center px-4 py-3 font-medium">{p.nome}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...modulosPorCategoria.entries()].map(([categoria, modulos]) => (
                      <FragmentCategoria key={categoria} categoria={categoria} modulos={modulos} planos={planos} />
                    ))}
                  </tbody>
                </table>
              </div>
              {modulosRoadmap.length > 0 && (
                <div className="px-6 py-4 border-t border-white/10">
                  <p className="text-xs font-medium text-blue-200/50 uppercase tracking-wide mb-2">Em breve</p>
                  <div className="flex flex-wrap gap-2">
                    {modulosRoadmap.map((m) => (
                      <span key={m.codigo} className="text-xs text-blue-100/70 bg-white/5 px-2.5 py-1 rounded-full">{m.nome}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ============ FAQ ============ */}
          <TabsContent value="faq" className="w-full mt-8 space-y-3">
            {FAQ.map((item) => (
              <FaqAccordionItem key={item.pergunta} item={item} />
            ))}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white rounded-2xl p-6 mt-6">
              <div>
                <p className="font-semibold text-slate-900">Não encontrou sua resposta?</p>
                <p className="text-sm text-slate-500">Fale com nosso time e receba uma proposta sob medida.</p>
              </div>
              <a
                href="mailto:contato@fgidecision.com.br?subject=D%C3%BAvida%20sobre%20planos"
                className="shrink-0 inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-slate-800 transition"
              >
                Falar com vendas
                <ArrowRight size={15} />
              </a>
            </div>
          </TabsContent>
        </Tabs>

        {/* Barra de implantação — visível em qualquer aba, afeta o preço mostrado nos cards */}
        <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={incluirImplantacao}
              onChange={(e) => setIncluirImplantacao(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-sm text-blue-100">
              Incluir custo único de <strong>cadastro + treinamento</strong>
              {custoImplantacaoExibido > 0 && <> ({formatMoeda(custoImplantacaoExibido)})</>}
              <br />
              <span className="text-xs text-blue-200/50">Cobrado uma única vez no primeiro mês. Desmarque se não deseja incluí-lo na proposta.</span>
            </span>
          </label>
          <p className="text-xs text-blue-200/40 text-right sm:text-right max-w-xs">
            Valores em reais (BRL). Checkout em construção — finalize por enquanto via Falar com vendas.
          </p>
        </div>

        <div className="text-center">
          <Link to="/signup" className="text-sm text-blue-300/70 hover:text-blue-200 transition">
            Ainda com dúvidas? Conhecer o aplicativo →
          </Link>
        </div>
      </div>
    </div>
  )
}

function FaqAccordionItem({ item }: { item: FaqItem }) {
  const [aberto, setAberto] = useState(false)
  return (
    <Collapsible open={aberto} onOpenChange={setAberto} className="bg-white/95 rounded-xl overflow-hidden">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-3.5 text-left">
        <span className="text-sm font-medium text-slate-900 flex items-center gap-2">
          {item.pergunta}
          {item.provisorio && (
            <span className="text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Provisório</span>
          )}
        </span>
        <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-5 pb-4 text-sm text-slate-500">{item.resposta}</CollapsibleContent>
    </Collapsible>
  )
}

function FragmentCategoria({
  categoria,
  modulos,
  planos,
}: {
  categoria: string
  modulos: { codigo: string; nome: string }[]
  planos: { codigo: string; nome: string; modulos: string[] }[]
}) {
  return (
    <>
      <tr>
        <td colSpan={planos.length + 1} className="px-6 pt-4 pb-1.5 text-xs font-bold text-blue-300/80 uppercase tracking-wide bg-white/[0.03]">
          {CATEGORIA_LABEL[categoria] ?? categoria}
        </td>
      </tr>
      {modulos.map((m) => (
        <tr key={m.codigo} className="border-t border-white/5">
          <td className="px-6 py-2.5 text-slate-200">{m.nome}</td>
          {planos.map((p) => (
            <td key={p.codigo} className="text-center px-4 py-2.5">
              {p.modulos.includes(m.codigo) ? (
                <Check size={16} className="inline text-emerald-400" />
              ) : (
                <Minus size={16} className="inline text-slate-600" />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
