import { useState, type ElementType } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  ClipboardList,
  FileText,
  FlaskConical,
  GanttChart,
  LineChart,
  Map as MapIcon,
  MapPin,
  MessageCircle,
  PackageSearch,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCog,
  Zap,
} from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import fgiLogo from '@/assets/fgi-logo.png'

interface TourStep {
  categoria: string
  icon: ElementType
  titulo: string
  descricao: string
  visual: 'curva' | 'barras' | 'gantt' | 'tabela' | 'lista' | 'grade' | 'marcadores' | 'stats' | 'chat'
}

const STEPS: TourStep[] = [
  {
    categoria: 'CURVA S',
    icon: TrendingUp,
    titulo: 'Curva S — Avanço Físico',
    descricao: 'Baseline, Real e Forecast semana a semana, gerada automaticamente a partir do cronograma importado (MS Project ou Primavera P6).',
    visual: 'curva',
  },
  {
    categoria: 'PROGRAMAÇÃO',
    icon: Calendar,
    titulo: 'Programação Semanal',
    descricao: 'Consolide o que foi planejado, concluído e o que ficou pra trás, semana a semana, por atividade.',
    visual: 'tabela',
  },
  {
    categoria: 'GANTT LIVRE',
    icon: GanttChart,
    titulo: 'Gantt Livre',
    descricao: 'Visualize o cronograma inteiro em barras, com dependências e marcos, direto do arquivo importado.',
    visual: 'gantt',
  },
  {
    categoria: 'HISTOGRAMA',
    icon: LineChart,
    titulo: 'Histograma de Mão de Obra',
    descricao: 'Efetivo planejado x realizado por semana, pra enxergar pico de demanda antes que ele vire problema.',
    visual: 'barras',
  },
  {
    categoria: 'APONTAMENTOS',
    icon: ClipboardList,
    titulo: 'Distribuição de Efetivo',
    descricao: 'Lance HH por colaborador e por dia — alimenta histograma, índices e relatório automaticamente.',
    visual: 'tabela',
  },
  {
    categoria: 'OCORRÊNCIAS',
    icon: AlertTriangle,
    titulo: 'Ocorrências',
    descricao: 'Registre paradas e imprevistos do dia a dia da obra, com prazo e responsável.',
    visual: 'lista',
  },
  {
    categoria: 'MAPA DE CHUVAS',
    icon: CloudRain,
    titulo: 'Mapa de Chuvas',
    descricao: 'Histórico de chuva por dia, pra justificar atraso de frente de serviço com dado, não achismo.',
    visual: 'lista',
  },
  {
    categoria: 'GESTÃO À VISTA',
    icon: MapIcon,
    titulo: 'Gestão à Vista',
    descricao: 'Painel de avanço em malha de células sobre a planta baixa da obra, atualizado a partir do cronograma.',
    visual: 'grade',
  },
  {
    categoria: 'MAPA DE SETORES',
    icon: MapPin,
    titulo: 'Mapa de Setores',
    descricao: 'Marcadores de avanço em geometria livre sobre a planta, com exportação de imagem pronta pra reunião.',
    visual: 'marcadores',
  },
  {
    categoria: 'QUALIDADE',
    icon: FlaskConical,
    titulo: 'Qualidade (Concreto)',
    descricao: 'Rastreabilidade completa do concreto — do traço ao ensaio — com atingimento de FCK por idade.',
    visual: 'stats',
  },
  {
    categoria: 'SEGURANÇA',
    icon: ShieldCheck,
    titulo: 'Segurança do Trabalho',
    descricao: 'Registros de risco e desvio com foto, categoria e prazo de correção, direto do canteiro.',
    visual: 'lista',
  },
  {
    categoria: 'ADMINISTRAÇÃO',
    icon: UserCog,
    titulo: 'Administração / RH',
    descricao: 'Controle de funcionários, cargos e ponto, com efetivo do dia sempre atualizado.',
    visual: 'tabela',
  },
  {
    categoria: 'SUPRIMENTOS',
    icon: PackageSearch,
    titulo: 'Suprimentos',
    descricao: 'Alertas de suprimento integrados ao Sienge, pra saber com antecedência o que pode faltar.',
    visual: 'lista',
  },
  {
    categoria: 'ASSISTENTE IA',
    icon: MessageCircle,
    titulo: 'Assistente Virtual',
    descricao: 'Pergunte sobre atividades, prazos e atrasos do cronograma da sua obra e receba resposta na hora.',
    visual: 'chat',
  },
]

const DESTAQUES = [
  { icon: Building2, label: 'Acesso por obra', desc: 'Cada pessoa vê só os projetos que lhe cabem, com nível de acesso configurável — de quem só acompanha até quem edita o cronograma inteiro.' },
  { icon: Zap, label: 'Sem replanilhar', desc: 'Importou cronograma novo ou lançou apontamento? Curva S, histograma e PPC se recalculam sozinhos na hora.' },
  { icon: FileText, label: 'Pronto pra reunião', desc: 'Gere a imagem ou o PDF do que você está vendo na tela agora, sem precisar montar nada à parte.' },
]

function Chip({ label, value, color = 'text-foreground' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-muted rounded-lg px-3 py-2 flex-1 min-w-[100px]">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-base font-bold ${color}`}>{value}</p>
    </div>
  )
}

function VisualCurva() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <svg viewBox="0 0 300 100" className="w-full h-28">
          <polyline points="0,95 40,80 80,60 120,45 160,32 200,20 240,10 300,4" fill="none" stroke="var(--chart-1)" strokeWidth="2.5" />
          <polyline points="0,96 40,85 80,68 120,50 160,38 200,28 230,20 260,15" fill="none" stroke="var(--chart-3)" strokeWidth="2.5" />
          <polyline points="260,15 300,6" fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeDasharray="4 3" />
          {[40, 80, 120, 160, 200, 230, 260].map((x, i) => (
            <circle key={i} cx={x} cy={[85, 68, 50, 38, 28, 20, 15][i]} r="2.5" fill="var(--chart-3)" />
          ))}
        </svg>
        <div className="flex gap-2">
          <Chip label="Real" value="50%" color="text-emerald-600" />
          <Chip label="Forecast" value="55%" color="text-primary" />
          <Chip label="Desvio" value="-5 pp" color="text-amber-600" />
        </div>
      </CardContent>
    </Card>
  )
}

function VisualBarras() {
  const dados = [6, 8, 7, 9, 10, 8, 6, 5]
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-end gap-2 h-24">
          {dados.map((v, i) => (
            <div key={i} className="flex-1 bg-primary/15 rounded-t" style={{ height: `${v * 10}%` }}>
              <div className="w-full bg-primary rounded-t" style={{ height: `${Math.max(v - 2, 1) * 10}%`, marginTop: `${2 * 10}%` }} />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Chip label="Pico previsto" value="10 pessoas" />
          <Chip label="Semana" value="S5" />
        </div>
      </CardContent>
    </Card>
  )
}

function VisualGantt() {
  const barras = [
    { nome: 'Fundação', inicio: 0, largura: 30, cor: 'var(--chart-1)' },
    { nome: 'Estrutura', inicio: 20, largura: 40, cor: 'var(--chart-4)' },
    { nome: 'Alvenaria', inicio: 50, largura: 30, cor: 'var(--chart-5)' },
    { nome: 'Acabamento', inicio: 70, largura: 25, cor: 'var(--chart-3)' },
  ]
  return (
    <Card>
      <CardContent className="p-4 space-y-2.5">
        {barras.map((b) => (
          <div key={b.nome} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-20 shrink-0">{b.nome}</span>
            <div className="flex-1 h-4 bg-muted rounded-full relative">
              <div className="absolute h-4 rounded-full" style={{ left: `${b.inicio}%`, width: `${b.largura}%`, backgroundColor: b.cor }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function VisualTabela() {
  const linhas = [
    { nome: 'João Silva', valores: [8, 8, 8, 8, 7, 4], total: 43 },
    { nome: 'Maria Souza', valores: [8, 8, 8, 7, 8, 0], total: 39 },
    { nome: 'Carlos Oliveira', valores: [8, 6, 8, 8, 8, 4], total: 42 },
  ]
  return (
    <Card>
      <CardContent className="p-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground uppercase tracking-wide text-[10px]">
              <th className="text-left pb-2 font-medium">Nome</th>
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
                <th key={d} className="pb-2 font-medium">{d}</th>
              ))}
              <th className="pb-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.nome} className="border-t">
                <td className="py-2 text-foreground font-medium">{l.nome}</td>
                {l.valores.map((v, i) => (
                  <td key={i} className="text-center py-2 text-muted-foreground">{v || '–'}</td>
                ))}
                <td className="text-center py-2 font-semibold text-foreground">{l.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function VisualLista() {
  const itens = [
    { titulo: 'Chuva forte impediu concretagem', status: 'Em aberto', variant: 'destructive' as const },
    { titulo: 'Atraso na entrega de aço', status: 'Resolvido', variant: 'secondary' as const },
    { titulo: 'Falta de acesso ao pavimento 3', status: 'Em análise', variant: 'outline' as const },
  ]
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        {itens.map((it) => (
          <div key={it.titulo} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2.5">
            <span className="text-xs text-foreground">{it.titulo}</span>
            <Badge variant={it.variant} className="shrink-0 ml-2 text-[10px]">{it.status}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function VisualGrade() {
  const celulas = [72, 45, 90, 30, 60, 100, 15, 55, 80, 40, 65, 95]
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-4 gap-2">
          {celulas.map((v, i) => (
            <div
              key={i}
              className="aspect-square rounded-md flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: v > 66 ? 'var(--chart-5)' : v > 33 ? 'var(--chart-3)' : 'var(--destructive)' }}
            >
              {v}%
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function VisualMarcadores() {
  const pinos = [
    { x: 25, y: 30 }, { x: 60, y: 20 }, { x: 40, y: 65 }, { x: 75, y: 55 }, { x: 15, y: 70 },
  ]
  return (
    <Card>
      <CardContent className="p-4">
        <div className="relative bg-muted rounded-lg h-32 border">
          {pinos.map((p, i) => (
            <MapPin
              key={i}
              size={18}
              className="absolute text-primary -translate-x-1/2 -translate-y-full"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function VisualStats() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-2.5">
          <Chip label="Ensaios no mês" value="128" />
          <Chip label="Atingimento FCK" value="97%" color="text-emerald-600" />
          <Chip label="Cargas rastreadas" value="342" />
          <Chip label="Dispensas" value="4" color="text-amber-600" />
        </div>
      </CardContent>
    </Card>
  )
}

function VisualChat() {
  return (
    <Card>
      <CardContent className="p-4 space-y-2.5">
        <div className="ml-auto max-w-[75%] bg-primary text-primary-foreground text-xs rounded-2xl rounded-br-sm px-3.5 py-2">
          Quais atividades estão atrasadas essa semana?
        </div>
        <div className="mr-auto max-w-[80%] bg-muted text-foreground text-xs rounded-2xl rounded-bl-sm px-3.5 py-2.5">
          3 atividades estão atrasadas: Alvenaria do 2º pav. (4 dias), Instalações elétricas (2 dias) e Reboco externo (1 dia).
        </div>
      </CardContent>
    </Card>
  )
}

const VISUAL_COMPONENT: Record<TourStep['visual'], ElementType> = {
  curva: VisualCurva,
  barras: VisualBarras,
  gantt: VisualGantt,
  tabela: VisualTabela,
  lista: VisualLista,
  grade: VisualGrade,
  marcadores: VisualMarcadores,
  stats: VisualStats,
  chat: VisualChat,
}

export function ProductTour({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [passo, setPasso] = useState(0)
  const step = STEPS[passo]
  const Icone = step.icon
  const Visual = VISUAL_COMPONENT[step.visual]
  const ultimo = passo === STEPS.length - 1

  const handleClose = (novoAberto: boolean) => {
    onOpenChange(novoAberto)
    if (!novoAberto) setPasso(0)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden bg-card flex flex-col sm:flex-row">
        {/* Sidebar */}
        <div className="w-full sm:w-56 shrink-0 bg-slate-950 flex flex-col p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 bg-white rounded-lg p-1">
              <img src={fgiLogo} alt="FGI Decision" className="w-full h-full object-contain" />
            </div>
            <span className="text-white font-bold text-sm">FGI Decision</span>
          </div>
          <p className="text-[10px] text-blue-300/50 uppercase tracking-wider mb-0.5">Tour de produto</p>
          <p className="text-blue-300 text-xs font-semibold mb-4">{passo + 1} / {STEPS.length}</p>

          <nav className="space-y-0.5 flex-1">
            {STEPS.map((s, i) => {
              const IconeItem = s.icon
              return (
                <button
                  key={s.titulo}
                  onClick={() => setPasso(i)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition ${
                    i === passo ? 'bg-white/10 text-white font-semibold' : 'text-blue-100/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <IconeItem size={14} className="shrink-0" />
                  <span className="truncate">{s.titulo}</span>
                </button>
              )
            })}
          </nav>

          <div className="bg-white/5 rounded-lg p-3 mt-4">
            <p className="text-[10px] font-bold text-blue-200/50 uppercase tracking-wide mb-1">Dados fictícios</p>
            <p className="text-[11px] text-blue-100/60 leading-relaxed">
              Apenas demonstração — no seu projeto, tudo é calculado do seu cronograma e apontamentos.
            </p>
          </div>

          <Link
            to="/signup"
            onClick={() => handleClose(false)}
            className="mt-3 flex items-center justify-center gap-2 bg-gradient-to-b from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg transition"
          >
            <Sparkles size={14} />
            Começar agora
          </Link>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 flex flex-col overflow-y-auto bg-background">
          <div className="p-6 pb-4 border-b">
            <p className="text-[11px] font-bold text-primary tracking-wide">{step.categoria} · PASSO {String(passo + 1).padStart(2, '0')} DE {STEPS.length}</p>
            <h2 className="text-2xl font-bold text-foreground mt-1 flex items-center gap-2.5">
              <Icone size={22} className="text-muted-foreground" />
              {step.titulo}
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-xl">{step.descricao}</p>
          </div>

          <div className="p-6 flex-1">
            <Visual />

            <div className="grid sm:grid-cols-3 gap-3 mt-6">
              {DESTAQUES.map((d) => (
                <Card key={d.label}>
                  <CardContent className="p-4">
                    <d.icon size={17} className="text-primary mb-2" />
                    <p className="text-sm font-semibold text-foreground">{d.label}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{d.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span key={i} className={`h-1.5 rounded-full transition-all ${i === passo ? 'w-5 bg-primary' : 'w-1.5 bg-muted'}`} />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => handleClose(false)} className="text-sm text-muted-foreground hover:text-foreground transition">
                Fechar
              </button>
              {passo > 0 && (
                <button
                  onClick={() => setPasso((p) => p - 1)}
                  className="flex items-center gap-1 text-sm font-medium text-foreground hover:bg-muted px-3 py-2 rounded-lg transition"
                >
                  <ChevronLeft size={15} /> Voltar
                </button>
              )}
              {ultimo ? (
                <Link
                  to="/signup"
                  onClick={() => handleClose(false)}
                  className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  <CheckCircle2 size={15} /> Concluir
                </Link>
              ) : (
                <button
                  onClick={() => setPasso((p) => Math.min(STEPS.length - 1, p + 1))}
                  className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg transition"
                >
                  Próximo <ChevronRight size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
