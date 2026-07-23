import { useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, MinusCircle, XCircle, Trash2, Plus, X, Layers, Eraser, Download } from 'lucide-react'
import type { ActivityLike, ActivityStatus } from '@/lib/adherence'
import { parseISODateStr, formatShortDate } from '@/lib/iso-week'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  date: string | null
  activities: ActivityLike[]
  weekConsolidated: boolean
  onSetStatus: (id: string, status: ActivityStatus, observation: string | null) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddExtra: (payload: {
    planned_date: string
    name: string
    company: string | null
    discipline: string | null
    area: string | null
    stage: string | null
    foreman: string | null
  }) => Promise<void>
  onClearDay: () => void
  onAddFromCronograma: () => void
}

const EXTRAS_GROUP = '__extras__'

function statusCounts(activities: ActivityLike[]) {
  return {
    concluida: activities.filter((a) => a.status === 'concluida').length,
    parcial: activities.filter((a) => a.status === 'parcial').length,
    nao_concluida: activities.filter((a) => a.status === 'nao_concluida').length,
    pendente: activities.filter((a) => a.status === 'pendente').length,
  }
}

export default function ModalDetalheDia({
  open,
  onOpenChange,
  date,
  activities,
  weekConsolidated,
  onSetStatus,
  onDelete,
  onAddExtra,
  onClearDay,
  onAddFromCronograma,
}: Props) {
  const [showExtra, setShowExtra] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const map = new Map<string, ActivityLike[]>()
    for (const a of activities) {
      const key = a.source || EXTRAS_GROUP
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(a)
    }
    // Cronogramas em ordem alfabética primeiro, "Atividades Extras" sempre por último.
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === EXTRAS_GROUP) return 1
      if (b === EXTRAS_GROUP) return -1
      return a.localeCompare(b)
    })
  }, [activities])

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => onOpenChange(false)} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Atividades do dia {date ? formatShortDate(parseISODateStr(date)) : ''}
            </h2>
            {activities.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {activities.length} {activities.length === 1 ? 'atividade' : 'atividades'} · {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {activities.length > 0 && (
              <button
                onClick={onClearDay}
                disabled={weekConsolidated}
                title={weekConsolidated ? 'Desbloqueie a semana para limpar o dia' : 'Remover todas as atividades deste dia'}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Eraser size={13} /> Limpar dia
              </button>
            )}
            <button
              onClick={() => onOpenChange(false)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {activities.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma atividade programada para este dia.
            </p>
          )}
          {groups.map(([groupKey, groupActivities]) => {
            const isExtrasGroup = groupKey === EXTRAS_GROUP
            const isCollapsed = collapsedGroups.has(groupKey)
            const counts = statusCounts(groupActivities)
            return (
              <div key={groupKey} className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleGroup(groupKey)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${
                    isExtrasGroup
                      ? 'bg-sky-50/60 dark:bg-sky-900/10 hover:bg-sky-50 dark:hover:bg-sky-900/20'
                      : 'bg-purple-50/60 dark:bg-purple-900/10 hover:bg-purple-50 dark:hover:bg-purple-900/20'
                  }`}
                >
                  {isCollapsed ? <ChevronRight size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-400 shrink-0" />}
                  <Layers size={13} className={isExtrasGroup ? 'text-sky-500' : 'text-purple-500'} />
                  <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                    {isExtrasGroup ? 'Atividades Extras' : groupKey}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                    {groupActivities.length}
                  </span>
                  <div className="ml-auto flex items-center gap-2 text-[11px] shrink-0">
                    {counts.concluida > 0 && <span className="text-emerald-600 dark:text-emerald-400">{counts.concluida} concl.</span>}
                    {counts.parcial > 0 && <span className="text-amber-600 dark:text-amber-400">{counts.parcial} parc.</span>}
                    {counts.nao_concluida > 0 && <span className="text-red-600 dark:text-red-400">{counts.nao_concluida} não concl.</span>}
                  </div>
                </button>
                {!isCollapsed && (
                  <div className="p-2 space-y-2 bg-white dark:bg-gray-800">
                    {groupActivities.map((a) => (
                      <ActivityRow
                        key={a.id}
                        activity={a}
                        weekConsolidated={weekConsolidated}
                        onSetStatus={onSetStatus}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          {showExtra && date ? (
            <ExtraForm
              date={date}
              onCancel={() => setShowExtra(false)}
              onSubmit={async (p) => {
                await onAddExtra(p)
                setShowExtra(false)
              }}
            />
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                onClick={() => setShowExtra(true)}
                disabled={!date}
              >
                <Plus size={16} /> Cadastrar atividade extra
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-dashed border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={onAddFromCronograma}
                disabled={!date || weekConsolidated}
                title={weekConsolidated ? 'Desbloqueie a semana para adicionar do cronograma' : 'Buscar tarefas do cronograma pra este dia (ex.: um domingo com trabalho excepcional)'}
              >
                <Download size={16} /> Adicionar do cronograma
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityRow({
  activity,
  weekConsolidated,
  onSetStatus,
  onDelete,
}: {
  activity: ActivityLike
  weekConsolidated: boolean
  onSetStatus: Props['onSetStatus']
  onDelete: Props['onDelete']
}) {
  const [obs, setObs] = useState(activity.observation ?? '')
  const canDelete = !weekConsolidated || activity.is_extra

  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="truncate font-medium text-gray-900 dark:text-white">{activity.name}</span>
            {activity.is_extra && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded">
                Extra
              </span>
            )}
          </div>
          {activity.areaPath && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{activity.areaPath}</p>
          )}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            {activity.stage && <span>EDT: {activity.stage}</span>}
            {activity.discipline && <span>Disciplina: {activity.discipline}</span>}
            {activity.area && <span>Área: {activity.area}</span>}
            {activity.foreman && <span>Encarregado: {activity.foreman}</span>}
            {activity.company && <span>Empresa: {activity.company}</span>}
            <span>Previsto: {activity.planned_pct}%</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusButton
            active={activity.status === 'concluida'}
            tone="emerald"
            icon={<CheckCircle2 size={16} />}
            label="Concluída"
            onClick={() => onSetStatus(activity.id, 'concluida', obs || null)}
          />
          <StatusButton
            active={activity.status === 'parcial'}
            tone="amber"
            icon={<MinusCircle size={16} />}
            label="Parcial"
            onClick={() => onSetStatus(activity.id, 'parcial', obs || null)}
          />
          <StatusButton
            active={activity.status === 'nao_concluida'}
            tone="red"
            icon={<XCircle size={16} />}
            label="Não concluída"
            onClick={() => onSetStatus(activity.id, 'nao_concluida', obs || null)}
          />
          <button
            disabled={!canDelete}
            onClick={() => onDelete(activity.id)}
            title={canDelete ? 'Remover' : 'Semana bloqueada — só atividades extras podem ser removidas'}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition disabled:opacity-30"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <textarea
        placeholder="Observações"
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        onBlur={() => {
          if ((activity.observation ?? '') !== obs) {
            onSetStatus(activity.id, activity.status, obs || null)
          }
        }}
        className="mt-2 w-full min-h-[52px] text-xs px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  )
}

function StatusButton({
  active,
  tone,
  icon,
  label,
  onClick,
}: {
  active: boolean
  tone: 'emerald' | 'amber' | 'red'
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  const tones: Record<string, string> = {
    emerald: active ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : '',
    amber: active ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' : '',
    red: active ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : '',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`p-1.5 rounded-md transition hover:bg-gray-200 dark:hover:bg-gray-600 ${tones[tone]}`}
    >
      {icon}
    </button>
  )
}

function ExtraForm({
  date,
  onSubmit,
  onCancel,
}: {
  date: string
  onSubmit: (p: {
    planned_date: string
    name: string
    company: string | null
    discipline: string | null
    area: string | null
    stage: string | null
    foreman: string | null
  }) => Promise<void>
  onCancel: () => void
}) {
  const [f, setF] = useState({ name: '', company: '', discipline: '', area: '', stage: '', foreman: '' })

  return (
    <div className="rounded-md border border-dashed border-gray-300 dark:border-gray-600 p-3">
      <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">Nova atividade extra</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Nome *</label>
          <input
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>
        <Field label="Empresa" value={f.company} onChange={(v) => setF({ ...f, company: v })} />
        <Field label="Disciplina" value={f.discipline} onChange={(v) => setF({ ...f, discipline: v })} />
        <Field label="Área" value={f.area} onChange={(v) => setF({ ...f, area: v })} />
        <Field label="Etapa" value={f.stage} onChange={(v) => setF({ ...f, stage: v })} />
        <Field label="Encarregado" value={f.foreman} onChange={(v) => setF({ ...f, foreman: v })} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition">
          Cancelar
        </button>
        <button
          disabled={!f.name.trim()}
          onClick={() =>
            onSubmit({
              planned_date: date,
              name: f.name.trim(),
              company: f.company || null,
              discipline: f.discipline || null,
              area: f.area || null,
              stage: f.stage || null,
              foreman: f.foreman || null,
            })
          }
          className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      />
    </div>
  )
}
