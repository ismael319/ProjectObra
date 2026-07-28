import { Clock, ArrowRight } from 'lucide-react'

const recentProjects = [
  {
    id: 1,
    name: 'Sistema de Gestão de Obras',
    status: 'Em andamento',
    statusColor: 'bg-blue-100 text-blue-700',
    progress: 72,
    dueDate: '15/08/2026',
  },
  {
    id: 2,
    name: 'Automação Industrial v2',
    status: 'Em andamento',
    statusColor: 'bg-blue-100 text-blue-700',
    progress: 45,
    dueDate: '30/09/2026',
  },
  {
    id: 3,
    name: 'Auditoria de Segurança',
    status: 'Concluído',
    statusColor: 'bg-green-100 text-green-700',
    progress: 100,
    dueDate: '01/07/2026',
  },
  {
    id: 4,
    name: 'Migração de Dados',
    status: 'Atrasado',
    statusColor: 'bg-red-100 text-red-700',
    progress: 30,
    dueDate: '20/06/2026',
  },
  {
    id: 5,
    name: 'Plataforma EAD Corporativa',
    status: 'Pendente',
    statusColor: 'bg-amber-100 text-amber-700',
    progress: 0,
    dueDate: '01/10/2026',
  },
]

export default function RecentProjects() {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Projetos Recentes</h3>
        <button className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
          Ver todos <ArrowRight size={14} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                Projeto
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                Status
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                Progresso
              </th>
              <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider pb-3">
                Prazo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {recentProjects.map((project) => (
              <tr key={project.id} className="hover:bg-gray-50 transition">
                <td className="py-4">
                  <p className="text-sm font-medium text-gray-900">{project.name}</p>
                </td>
                <td className="py-4">
                  <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${project.statusColor}`}
                  >
                    {project.status}
                  </span>
                </td>
                <td className="py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-24 bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
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
                    <span className="text-xs text-gray-500">{project.progress}%</span>
                  </div>
                </td>
                <td className="py-4">
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <Clock size={14} />
                    {project.dueDate}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
