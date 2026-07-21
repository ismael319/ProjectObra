import { useState, useRef } from 'react'
import { Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Layers, Clock, Upload, RefreshCw, FileUp } from 'lucide-react'
import { useProjects, type CronogramaInfo } from '@/lib/project-store'
import { parseMSProjectXML } from '@/lib/xml-parser'
import CronogramaUploadModal from './CronogramaUploadModal'

export default function CronogramaManager() {
  const { currentProject, addCronograma, removeCronograma, toggleCronograma, updateCronograma, recalculateAllDates } = useProjects()
  const [showUpload, setShowUpload] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingWeight, setEditingWeight] = useState<string | null>(null)
  const [weightValue, setWeightValue] = useState('')
  const [editingName, setEditingName] = useState<string | null>(null)
  const [nameValue, setNameValue] = useState('')
  const updateFileRefs = useRef<Record<string, HTMLInputElement>>({})

  if (!currentProject) return null

  const cronogramas = currentProject.cronogramas || []
  const activeCount = cronogramas.filter((c) => c.ativo).length

  const handleUpload = (cronograma: CronogramaInfo) => {
    addCronograma(currentProject.id, cronograma)
  }

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja excluir este cronograma?')) {
      removeCronograma(currentProject.id, id)
    }
  }

  const handleToggle = (id: string) => {
    toggleCronograma(currentProject.id, id)
  }

  const startEditWeight = (c: CronogramaInfo) => {
    setEditingWeight(c.id)
    setWeightValue(c.peso.toString())
  }

  const saveWeight = (id: string) => {
    const val = parseFloat(weightValue)
    if (!isNaN(val) && val > 0) {
      updateCronograma(currentProject.id, id, { peso: val })
    }
    setEditingWeight(null)
  }

  const startEditName = (c: CronogramaInfo) => {
    setEditingName(c.id)
    setNameValue(c.nome)
  }

  const saveName = (id: string) => {
    const trimmed = nameValue.trim()
    if (trimmed) {
      updateCronograma(currentProject.id, id, { nome: trimmed })
    }
    setEditingName(null)
  }

  const totalPeso = cronogramas
    .filter((c) => c.ativo)
    .reduce((sum, c) => sum + c.peso, 0)

  const handleRecalculate = () => {
    recalculateAllDates(currentProject.id)
  }

  const handleUpdateFile = (cronogramaId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string
        const parsed = parseMSProjectXML(text)
        updateCronograma(currentProject.id, cronogramaId, { dados: parsed, dataUpload: new Date().toISOString() })
      } catch {
        alert('Erro ao parsear o arquivo XML. Verifique se é um arquivo MSPDI válido.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden transition-colors">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <Layers size={20} className="text-blue-500" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Cronogramas</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {activeCount} ativo{activeCount !== 1 ? 's' : ''} de {cronogramas.length}
              {totalPeso > 0 && ` · Peso total: ${totalPeso.toFixed(1)}`}
            </p>
          </div>
        </div>
        <button
          onClick={handleRecalculate}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition"
          title="Recalcular datas e avanço a partir dos cronogramas existentes"
        >
          <RefreshCw size={16} />
          Recalcular
        </button>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
        >
          <Upload size={16} />
          Upload XML
        </button>
      </div>

      {cronogramas.length === 0 ? (
        <div className="p-12 text-center">
          <Layers size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">Nenhum cronograma carregado</p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition flex items-center gap-2 mx-auto"
          >
            <Upload size={16} />
            Fazer upload do primeiro cronograma
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {cronogramas.map((c) => {
            const isExpanded = expandedId === c.id
            const actCount = c.dados?.activities?.length || 0
            const resCount = c.dados?.resources?.length || 0
            const start = c.dados?.startDate
            const finish = c.dados?.finishDate

            return (
              <li key={c.id} className="transition-colors">
                <div className="flex items-center gap-4 px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <button onClick={() => handleToggle(c.id)} className="shrink-0 transition-colors" title={c.ativo ? 'Desativar' : 'Ativar'}>
                    {c.ativo ? (
                      <ToggleRight size={28} className="text-green-500" />
                    ) : (
                      <ToggleLeft size={28} className="text-gray-300 dark:text-gray-600" />
                    )}
                  </button>

                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {editingName === c.id ? (
                        <input
                          type="text"
                          value={nameValue}
                          onChange={(e) => setNameValue(e.target.value)}
                          onBlur={() => saveName(c.id)}
                          onKeyDown={(e) => e.key === 'Enter' && saveName(c.id)}
                          className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => startEditName(c)}
                          className={`text-sm font-medium truncate text-left hover:underline ${c.ativo ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500 line-through'}`}
                          title="Clique para renomear"
                        >
                          {c.nome}
                        </button>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                        v{c.versao}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                        {c.tipo}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">
                      {c.descricao || `${actCount} atividades · ${resCount} recursos`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {editingWeight === c.id ? (
                      <input
                        type="number"
                        min={0.01}
                        step={0.1}
                        value={weightValue}
                        onChange={(e) => setWeightValue(e.target.value)}
                        onBlur={() => saveWeight(c.id)}
                        onKeyDown={(e) => e.key === 'Enter' && saveWeight(c.id)}
                        className="w-16 px-2 py-1 text-xs border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => startEditWeight(c)}
                        className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                        title="Editar peso"
                      >
                        {c.peso.toFixed(1)}
                      </button>
                    )}

                    <input
                      ref={(el) => { if (el) updateFileRefs.current[c.id] = el }}
                      type="file"
                      accept=".xml"
                      className="hidden"
                      onChange={(e) => handleUpdateFile(c.id, e)}
                    />
                    <button
                      onClick={() => updateFileRefs.current[c.id]?.click()}
                      className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition group"
                      title="Atualizar dados do cronograma (re-upload XML)"
                    >
                      <FileUp size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition" />
                    </button>

                    <button
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
                    >
                      {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                    </button>

                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition group"
                    >
                      <Trash2 size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-red-500 transition" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-6 pb-4 ml-16">
                    <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 space-y-3 text-sm">
                      {c.descricao && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs">Descrição</span>
                          <p className="text-gray-900 dark:text-white">{c.descricao}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs">Atividades</span>
                          <p className="font-medium text-gray-900 dark:text-white">{actCount}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs">Recursos</span>
                          <p className="font-medium text-gray-900 dark:text-white">{resCount}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs">Início</span>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {start ? new Date(start).toLocaleDateString('pt-BR') : '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400 text-xs">Término</span>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {finish ? new Date(finish).toLocaleDateString('pt-BR') : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          Upload: {new Date(c.dataUpload).toLocaleString('pt-BR')}
                        </div>
                        {c.dados?.baselines && (
                          <div>Baselines: {c.dados.baselines.map((b) => b.label).join(', ')}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <CronogramaUploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onUpload={handleUpload}
        existingCount={cronogramas.length}
      />
    </div>
  )
}
