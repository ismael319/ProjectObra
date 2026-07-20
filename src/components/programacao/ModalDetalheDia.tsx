import { useState } from 'react'
import { CheckCircle2, MinusCircle, XCircle, Trash2, Plus, X } from 'lucide-react'
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
}: Props) {
  const [showExtra, setShowExtra] = useState(false)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px]" onClick={() => onOpenChange(false)} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Atividades do dia {date ? formatShortDate(parseISODateStr(date)) : ''}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {activities.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Nenhuma atividade programada para este dia.
            </p>
          )}
          {activities.map((a) => (
            <ActivityRow
              key={a.id}
              activity={a}
              weekConsolidated={weekConsolidated}
              onSetStatus={onSetStatus}
              onDelete={onDelete}
            />
          ))}
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
            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              onClick={() => setShowExtra(true)}
              disabled={!date}
            >
              <Plus size={16} /> Cadastrar atividade extra
            </button>
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
  const isCronograma = !!activity.source

  return (
    <div className={`rounded-md border p-3 ${
      isCronograma
        ? 'border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10'
        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-gray-900 dark:text-white">{activity.name}</span>
            {isCronograma && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded">
                Cronograma
              </span>
            )}
            {activity.is_extra && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded">
                Extra
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
            {isCronograma && activity.source && <span>Cronograma: {activity.source}</span>}
            {activity.discipline && <span>Disciplina: {activity.discipline}</span>}
            {activity.area && <span>Área: {activity.area}</span>}
            {activity.stage && <span>EDT: {activity.stage}</span>}
            {activity.foreman && <span>Encarregado: {activity.foreman}</span>}
            {activity.company && <span>Empresa: {activity.company}</span>}
            <span>Previsto: {activity.planned_pct}%</span>
          </div>
        </div>
        {!isCronograma && (
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
              title="Remover"
              className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition disabled:opacity-30"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      {!isCronograma && (
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
      )}
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
