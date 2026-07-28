import { useState } from 'react'
import {
  Plus,
  Search,
  Filter,
  MoreVertical,
  Clock,
  CheckCircle,
  AlertTriangle,
  Pause,
  Calendar,
  Users,
  ArrowUpRight,
} from 'lucide-react'

const allProjects = [
  {
    id: 1,
    name: 'Sistema de Gestão de Obras',
    description: 'Plataforma completa para acompanhamento de obras em tempo real',
    status: 'Em andamento',
    statusColor: 'bg-blue-100 text-blue-700',
    statusIcon: Clock,
    progress: 72,
    dueDate: '15/08/2026',
    team: ['Ana', 'Carlos', 'Maria'],
    priority: 'Alta',
    priorityColor: 'text-red-600',
  },
  {
    id: 2,
    name: 'Automação Industrial v2',
    description: 'Sistema de automação para linha de produção',
    status: 'Em andamento',
    statusColor: 'bg-blue-100 text-blue-700',
    statusIcon: Clock,
    progress: 45,
    dueDate: '30/09/2026',
    team: ['Pedro', 'Lucia'],
    priority: 'Média',
    priorityColor: 'text-amber-600',
  },
  {
    id: 3,
    name: 'Auditoria de Segurança',
    description: 'Auditoria completa de segurança da informação',
    status: 'Concluído',
    statusColor: 'bg-green-100 text-green-700',
    statusIcon: CheckCircle,
    progress: 100,
    dueDate: '01/07/2026',
    team: ['Roberto'],
    priority: 'Baixa',
    priorityColor: 'text-green-600',
  },
  {
    id: 4,
    name: 'Migração de Dados',
    description: 'Migração do sistema legado para nuvem',
    status: 'Atrasado',
    statusColor: 'bg-red-100 text-red-700',
    statusIcon: AlertTriangle,
    progress: 30,
    dueDate: '20/06/2026',
    team: ['Ana', 'Pedro', 'João', 'Maria'],
    priority: 'Alta',
    priorityColor: 'text-red-600',
  },
  {
    id: 5,
    name: 'Plataforma EAD Corporativa',
    description: 'Portal de treinamentos e cursos online',
    status: 'Pendente',
    statusColor: 'bg-amber-100 text-amber-700',
    statusIcon: Pause,
    progress: 0,
    dueDate: '01/10/2026',
    team: ['Carlos'],
    priority: 'Baixa',
    priorityColor: 'text-green-600',
  },
  {
    id: 6,
    name: 'App Mobile React Native',
    description: 'Aplicativo móvel para gestão de equipes de campo',
    status: 'Em andamento',
    statusColor: 'bg-blue-100 text-blue-700',
    statusIcon: Clock,
    progress: 58,
    dueDate: '20/11/2026',
    team: ['Lucia', 'João', 'Roberto'],
    priority: 'Média',
    priorityColor: 'text-amber-600',
  },
]

const statusFilters = ['Todos', 'Em andamento', 'Concluído', 'Atrasado', 'Pendente']

export default function Projects() {
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('Todos')

  const filteredProjects = allProjects.filter((project) => {
    const matchesSearch = project.name.toLowerCase().includes(search.toLowerCase())
    const matchesFilter = activeFilter === 'Todos' || project.status === activeFilter
    return matchesSearch && matchesFilter
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projetos</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filteredProjects.length} projeto{filteredProjects.length !== 1 ? 's' : ''} encontrado{filteredProjects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg transition">
          <Plus size={18} />
          Novo Projeto
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center bg-white border border-gray-200 rounded-lg px-4 py-2.5 flex-1">
          <Search size={18} className="text-gray-400" />
          <input
            type="text"
            placeholder="Buscar projetos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none ml-2 text-sm text-gray-700 w-full"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {statusFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                activeFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredProjects.map((project) => {
          const StatusIcon = project.statusIcon
          return (
            <div
              key={project.id}
              className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition group cursor-pointer"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${project.statusColor}`}
                >
                  <StatusIcon size={12} />
                  {project.status}
                </span>
                <button className="text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition">
                  <MoreVertical size={16} />
                </button>
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition">
                {project.name}
              </h3>
              <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                {project.description}
              </p>

              {/* Progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-gray-500">Progresso</span>
                  <span className="text-xs font-medium text-gray-700">{project.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      project.progress === 100
                        ? 'bg-green-500'
                        : project.progress > 50
                        ? 'bg-blue-500'
                        : project.progress > 0
                        ? 'bg-amber-500'
                        : 'bg-gray-300'
                    }`}
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Calendar size={14} />
                  {project.dueDate}
                </div>
                <div className="flex items-center gap-1.5 text-sm text-gray-500">
                  <Users size={14} />
                  {project.team.length}
                </div>
                <span className={`text-xs font-medium ${project.priorityColor}`}>
                  {project.priority}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {filteredProjects.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">Nenhum projeto encontrado</p>
        </div>
      )}
    </div>
  )
}
