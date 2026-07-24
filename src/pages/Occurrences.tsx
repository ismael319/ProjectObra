import { useState } from 'react'
import { useProject } from '@/lib/project-context'
import { AlertTriangle, Plus, Trash2, X } from 'lucide-react'
import {
  OCCURRENCE_CATEGORIES,
  OCCURRENCE_SEVERITIES,
  getCategoryDef,
  getSeverityDef,
  isHighImpact,
  type OccurrenceCategory,
  type OccurrenceSeverity,
} from '@/lib/occurrence-types'

export default function Occurrences() {
  const { project, activities, occurrences, addOccurrence, removeOccurrence } = useProject()
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'outro' as OccurrenceCategory,
    severity: 'media' as OccurrenceSeverity,
    description: '',
    impactDays: 0,
    activityUid: undefined as number | undefined,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    addOccurrence({
      date: new Date(formData.date),
      type: formData.type,
      severity: formData.severity,
      description: formData.description,
      impactDays: formData.impactDays,
      activityUid: formData.activityUid,
    })
    setFormData({
      date: new Date().toISOString().split('T')[0],
      type: 'outro',
      severity: 'media',
      description: '',
      impactDays: 0,
      activityUid: undefined,
    })
    setShowForm(false)
  }

  const totalImpactDays = occurrences.reduce((sum, o) => sum + o.impactDays, 0)
  const highImpactCount = occurrences.filter((o) => isHighImpact(o.severity)).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ocorrências</h1>
          <p className="text-sm text-gray-500 mt-1">{project?.name || 'Nenhum projeto carregado'}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2.5 rounded-lg transition"
        >
          <Plus size={18} />
          Nova Ocorrência
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Total de Ocorrências</p>
          <p className="text-2xl font-bold text-gray-900">{occurrences.length}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Dias de Impacto</p>
          <p className="text-2xl font-bold text-red-600">{totalImpactDays}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Alto Impacto (Curva S)</p>
          <p className="text-2xl font-bold text-orange-600">{highImpactCount}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Segurança</p>
          <p className="text-2xl font-bold text-red-600">
            {occurrences.filter((o) => o.type === 'seguranca').length}
          </p>
        </div>
      </div>

      {/* New Occurrence Form */}
      {showForm && (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Registrar Ocorrência</h3>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as OccurrenceCategory })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {OCCURRENCE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gravidade
                  <span className="text-xs text-gray-400 font-normal ml-1">(alta/crítica vira ponto de atenção na Curva S)</span>
                </label>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value as OccurrenceSeverity })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {OCCURRENCE_SEVERITIES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
                placeholder="Descreva a ocorrência..."
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dias de Impacto</label>
                <input
                  type="number"
                  value={formData.impactDays}
                  onChange={(e) => setFormData({ ...formData, impactDays: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Atividade Afetada (opcional)</label>
                <select
                  value={formData.activityUid || ''}
                  onChange={(e) => setFormData({ ...formData, activityUid: parseInt(e.target.value) || undefined })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Nenhuma</option>
                  {activities.filter((a) => !a.isSummary).map((a, index) => (
                    <option key={`${a.uid}-${index}`} value={a.uid}>{a.wbs} - {a.name}</option>
                  ))}
                </select>
              </div>
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

      {/* Occurrences List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {occurrences.length === 0 ? (
          <div className="p-12 text-center">
            <AlertTriangle className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-500">Nenhuma ocorrência registrada</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {occurrences
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((occ) => {
                const categoryDef = getCategoryDef(occ.type)
                const severityDef = getSeverityDef(occ.severity)
                const CategoryIcon = categoryDef.icon
                const activity = occ.activityUid ? activities.find((a) => a.uid === occ.activityUid) : null

                return (
                  <div key={occ.id} className="p-4 hover:bg-gray-50 transition">
                    <div className="flex items-start gap-4">
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: categoryDef.color + '1a', color: categoryDef.color }}
                      >
                        <CategoryIcon size={20} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-medium text-gray-900">{categoryDef.label}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityDef.badgeClass}`}>
                            {severityDef.label}
                          </span>
                          {isHighImpact(occ.severity) && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium" title="Aparece como ponto de atenção na Curva S">
                              ⚠ Curva S
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {new Date(occ.date).toLocaleDateString('pt-BR')}
                          </span>
                          {occ.impactDays > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                              +{occ.impactDays} dias
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{occ.description}</p>
                        {activity && (
                          <p className="text-xs text-gray-500 mt-1">
                            Atividade: {activity.wbs} - {activity.name}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeOccurrence(occ.id)}
                        className="text-gray-400 hover:text-red-500 transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}
