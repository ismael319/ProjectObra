import type { ElementType } from 'react'
import {
  AlertTriangle,
  BarChart,
  BarChart3,
  Calendar,
  CheckSquare,
  ClipboardList,
  CloudRain,
  Database,
  FileSpreadsheet,
  FlaskConical,
  FolderCog,
  FolderTree,
  GanttChart,
  LineChart,
  Map,
  MapPin,
  PackageSearch,
  PieChart,
  Search,
  TrendingUp,
  Truck,
  UserCog,
} from 'lucide-react'

export interface NavItem {
  icon: ElementType
  label: string
  path: string
  destination?: string
  children?: NavItem[]
  disabled?: boolean
}

export interface NavSection {
  title: string
  items: NavItem[]
}

// A navegação desktop e a futura navegação mobile usam a mesma fonte para
// manter permissões, rótulos e destinos sincronizados.
export function buildNavSections(modulos: string[]): NavSection[] {
  const temEngenharia = modulos.includes('engenharia')
  const temSeguranca = modulos.includes('seguranca')
  const temSuprimentos = modulos.includes('suprimentos')
  const temAdministracao = modulos.includes('administracao')
  const temQualidade = modulos.includes('qualidade')

  // SIGA Planejamento: cronograma e curva S da obra.
  const planejamentoItems: NavItem[] = temEngenharia ? [
    {
      icon: TrendingUp, label: 'Planejamento', path: '/dashboard/planning',
      children: [
        { icon: BarChart3, label: 'Curva S', path: '/dashboard/planning' },
        { icon: Calendar, label: 'Programação', path: '/dashboard/daily' },
        { icon: GanttChart, label: 'Gantt Livre', path: '/dashboard/gantt' },
      ],
    },
  ] : []

  // SIGA Execução: acompanhamento do dia a dia da obra (efetivo, setores,
  // ocorrências). Mesmo módulo técnico "engenharia" de Planejamento, mas
  // agrupado à parte no menu por ser outro produto SIGA.
  const execucaoItems: NavItem[] = temEngenharia ? [
    { icon: LineChart, label: 'Histograma', path: '/dashboard/histograma-mo' },
    {
      icon: PieChart, label: 'Distribuição Efetivo', path: '/dashboard/people',
      children: [
        { icon: ClipboardList, label: 'Lançamento', path: '/dashboard/people/lancamento' },
        { icon: CheckSquare, label: 'Validação', path: '/dashboard/people/validacao' },
        { icon: Search, label: 'Consulta', path: '/dashboard/people/consulta' },
        { icon: BarChart, label: 'Resumo', path: '/dashboard/people/resumo' },
        { icon: FolderCog, label: 'Cadastro', path: '/dashboard/people/cadastro' },
        { icon: FolderTree, label: 'EAP', path: '/dashboard/people/eap' },
        { icon: FileSpreadsheet, label: 'Importar EAP', path: '/dashboard/people/importar-eap' },
      ],
    },
    { icon: Map, label: 'Gestão à Vista', path: '/dashboard/gestao-vista' },
    { icon: MapPin, label: 'Mapa de Setores', path: '/dashboard/mapa-setores' },
    { icon: AlertTriangle, label: 'Ocorrências', path: '/dashboard/occurrences' },
    { icon: CloudRain, label: 'Mapa de Chuvas', path: '/dashboard/mapa-chuvas' },
  ] : []

  const qualidadeItems: NavItem[] = temQualidade ? [
    {
      icon: Truck,
      label: 'Concreto',
      path: '/dashboard/qualidade/concreto',
      destination: '/dashboard/qualidade/concreto/dashboard',
      children: [
        { icon: BarChart, label: 'Dashboard', path: '/dashboard/qualidade/concreto/dashboard' },
        { icon: ClipboardList, label: 'Lançamento', path: '/dashboard/qualidade/concreto/lancamento' },
        { icon: CheckSquare, label: 'Validação', path: '/dashboard/qualidade/concreto/validacao' },
        { icon: Search, label: 'Consulta', path: '/dashboard/qualidade/concreto/consulta' },
        { icon: FlaskConical, label: 'Ensaios', path: '/dashboard/qualidade/concreto/ensaios' },
        { icon: FolderCog, label: 'Cadastro', path: '/dashboard/qualidade/concreto/cadastro' },
        { icon: Database, label: 'Dados', path: '/dashboard/qualidade/concreto/importar-historico' },
      ],
    },
  ] : []

  const segurancaItems: NavItem[] = temSeguranca ? [
    { icon: BarChart, label: 'Dashboard RDR', path: '/dashboard/seguranca/dashboard' },
    { icon: ClipboardList, label: 'Novo Registro', path: '/dashboard/seguranca/novo' },
    { icon: Search, label: 'Registros', path: '/dashboard/seguranca/registros' },
  ] : []

  return [
    ...(temEngenharia ? [{ title: 'SIGA Planejamento', items: planejamentoItems }] : []),
    ...(temEngenharia ? [{ title: 'SIGA Execução', items: execucaoItems }] : []),
    ...(temSeguranca ? [{ title: 'SIGA Segurança', items: segurancaItems }] : []),
    ...(temSuprimentos
      ? [{ title: 'SIGA Suprimentos', items: [{ icon: PackageSearch, label: 'Alertas Sienge', path: '/dashboard/suprimentos' }] }]
      : []),
    ...(temAdministracao
      ? [{
          title: 'SIGA Pessoas', items: [
            { icon: UserCog, label: 'Controle de Funcionários', path: '/dashboard/administracao' },
          ],
        }]
      : []),
    ...(temQualidade ? [{ title: 'SIGA Análise', items: qualidadeItems }] : []),
  ]
}

export const navSectionsInsercaoPontual: NavSection[] = [
  {
    title: 'Distribuição Efetivo',
    items: [
      { icon: ClipboardList, label: 'Lançamento', path: '/dashboard/people/lancamento' },
    ],
  },
]

export function getNavItemDestination(item: NavItem): string {
  return item.destination ?? item.path
}

const dashboardRouteTitles = [
  ['/dashboard/qualidade/concreto/importar-historico', 'Dados de Concreto'],
  ['/dashboard/qualidade/concreto/ensaios/importar', 'Importar Ensaios'],
  ['/dashboard/qualidade/concreto/dashboard', 'Dashboard de Concreto'],
  ['/dashboard/qualidade/concreto/lancamento', 'Lançamento de Concreto'],
  ['/dashboard/qualidade/concreto/validacao', 'Validação de Concreto'],
  ['/dashboard/qualidade/concreto/consulta', 'Consulta de Concreto'],
  ['/dashboard/qualidade/concreto/cadastro', 'Cadastro de Concreto'],
  ['/dashboard/qualidade/concreto/ensaios', 'Ensaios de Concreto'],
  ['/dashboard/administracao/importar-efetivo', 'Importar Efetivo'],
  ['/dashboard/administracao/importar-ponto', 'Importar Ponto'],
  ['/dashboard/seguranca/registros', 'Registros de Segurança'],
  ['/dashboard/seguranca/dashboard', 'Dashboard RDR'],
  ['/dashboard/seguranca/novo', 'Novo Registro RDR'],
  ['/dashboard/seguranca', 'Segurança'],
  ['/dashboard/people/importar-xml', 'Importar XML'],
  ['/dashboard/people/importar-eap', 'Importar EAP'],
  ['/dashboard/people/lancamento', 'Lançamento de Efetivo'],
  ['/dashboard/people/validacao', 'Validação de Efetivo'],
  ['/dashboard/people/cronograma', 'Cronograma de Efetivo'],
  ['/dashboard/people/evolucao', 'Evolução do Efetivo'],
  ['/dashboard/people/exportar', 'Exportar Efetivo'],
  ['/dashboard/people/cadastro', 'Cadastro de Efetivo'],
  ['/dashboard/people/consulta', 'Consulta de Efetivo'],
  ['/dashboard/people/resumo', 'Resumo do Efetivo'],
  ['/dashboard/people/eap', 'EAP do Efetivo'],
  ['/dashboard/admin/seguranca', 'Monitoramento de Segurança'],
  ['/dashboard/admin/users', 'Gestão de Usuários'],
  ['/dashboard/histograma-mo', 'Histograma de Mão de Obra'],
  ['/dashboard/mapa-chuvas', 'Mapa de Chuvas'],
  ['/dashboard/mapa-setores', 'Mapa de Setores'],
  ['/dashboard/administracao', 'Administração'],
  ['/dashboard/suprimentos', 'Alertas Sienge'],
  ['/dashboard/occurrences', 'Ocorrências'],
  ['/dashboard/activities', 'Atividades'],
  ['/dashboard/planning', 'Curva S'],
  ['/dashboard/daily', 'Programação'],
  ['/dashboard/gantt', 'Gantt Livre'],
  ['/dashboard/people', 'Distribuição de Efetivo'],
  ['/dashboard/portfolio', 'Portfólio de Projetos'],
  ['/dashboard/apresentacao', 'Modo Apresentação'],
  ['/dashboard', 'Visão Geral'],
] as const

export function getDashboardRouteTitle(pathname: string): string {
  const match = dashboardRouteTitles.find(([path]) =>
    pathname === path || (path !== '/dashboard' && pathname.startsWith(`${path}/`)),
  )
  return match?.[1] ?? 'SIGA SOLUÇÕES'
}
