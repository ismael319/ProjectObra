import { useState } from 'react'
import { useProject } from '@/lib/project-context'
import { Users, Plus, Trash2, X, Clock } from 'lucide-react'

export default function LaborTracking() {
  const { project, activities, resources, laborEntries, addLaborEntry, removeLaborEntry } = useProject()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    activityUid: 0,
    resourceUid: 0,
    hours: 0,
    description: '',
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    addLaborEntry({
      date: new Date(formData.date),
      activityUid: formData.activityUid,
      resourceUid: formData.resourceUid,
      hours: formData.hours,
      description: formData.description,
    })
    setFormData({
      date: new Date().toISOString().split('T')[0],
      activityUid: 0,
      resourceUid: 0,
      hours: 0,
      description: '',
    })
    setShowForm(false)
  }

  // Calcular totais por recurso
  const totalsByResource = resources.map((res) => {
    const entries = laborEntries.filter((e) => e.resourceUid === res.uid)
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)
    return { ...res, totalHours, entries: entries.length }
  }).filter((r) => r.totalHours > 0)

  // Calcular totais por atividade
  const totalsByActivity = activities.filter((a) => !a.isSummary).map((act) => {
    const entries = laborEntries.filter((e) => e.activityUid === act.uid)
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0)
    return { ...act, totalHours, entries: entries.length }
  }).filter((a) => a.totalHours > 0)

  const totalHoursAll = laborEntries.reduce((sum, e) => sum + e.hours, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Apontamento de Mão de Obra</h1>
          <p className="text-sm text-gray-500 mt-1">{project?.name || 'Nenhum projeto carregado'}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg transition"
        >
          <Plus size={18} />
          Novo Apontamento
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Total de Horas (HH)</p>
          <p className="text-2xl font-bold text-gray-900">{totalHoursAll.toFixed(1)}h</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Apontamentos</p>
          <p className="text-2xl font-bold text-gray-900">{laborEntries.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Recursos Envolvidos</p>
          <p className="text-2xl font-bold text-gray-900">
            {new Set(laborEntries.map((e) => e.resourceUid)).size}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Atividades Atendidas</p>
          <p className="text-2xl font-bold text-gray-900">
            {new Set(laborEntries.map((e) => e.activityUid)).size}
          </p>
        </div>
      </div>

      {/* New Entry Form */}
      {showForm && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Registrar Horas (HH)</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horas</label>
                <input
                  type="number"
                  value={formData.hours}
                  onChange={(e) => setFormData({ ...formData, hours: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="0.5"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recurso</label>
                <select
                  value={formData.resourceUid}
                  onChange={(e) => setFormData({ ...formData, resourceUid: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value={0}>Selecione...</option>
                  {resources.map((r) => (
                    <option key={r.uid} value={r.uid}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Atividade</label>
                <select
                  value={formData.activityUid}
                  onChange={(e) => setFormData({ ...formData, activityUid: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value={0}>Selecione...</option>
                  {activities.filter((a) => !a.isSummary).map((a) => (
                    <option key={a.uid} value={a.uid}>{a.wbs} - {a.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observação</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ex: Instalação de tubulação..."
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Registrar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Resource */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Horas por Recurso</h3>
          </div>
          {totalsByResource.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Nenhum apontamento</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {totalsByResource.map((r) => (
                <div key={r.uid} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-500">{r.group || 'Sem grupo'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{r.totalHours.toFixed(1)}h</p>
                    <p className="text-xs text-gray-500">{r.entries} apontamentos</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Horas por Atividade</h3>
          </div>
          {totalsByActivity.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Nenhum apontamento</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {totalsByActivity.map((a) => (
                <div key={a.uid} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.name}</p>
                    <p className="text-xs text-gray-500">WBS: {a.wbs}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{a.totalHours.toFixed(1)}h</p>
                    <p className="text-xs text-gray-500">{a.entries} apontamentos</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Entries List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Histórico de Apontamentos</h3>
        </div>
        {laborEntries.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-500">Nenhum apontamento registrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Data</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Recurso</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Atividade</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Horas</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Observação</th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {laborEntries
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((entry) => {
                    const resource = resources.find((r) => r.uid === entry.resourceUid)
                    const activity = activities.find((a) => a.uid === entry.activityUid)

                    return (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm text-gray-600">
                          {new Date(entry.date).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">
                          {resource?.name || 'Desconhecido'}
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-600">
                          {activity ? `${activity.wbs} - ${activity.name}` : 'Desconhecida'}
                        </td>
                        <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">
                          {entry.hours}h
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-500">
                          {entry.description || '-'}
                        </td>
                        <td className="px-6 py-3">
                          <button
                            onClick={() => removeLaborEntry(entry.id)}
                            className="text-gray-400 hover:text-red-500 transition"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
