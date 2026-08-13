import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save, ArrowRight, Plus, Minus, RotateCcw } from 'lucide-react'
import { getWeekAnalysis, getWeekBaseline, updateWeekAnalise, type WeekAnalysisItem } from '@/lib/programacao-db'
import { computeWeekAnalysisSummary, type ActivityLike, type WeekAnalysisSummary } from '@/lib/adherence'
import { formatBR } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  organizacaoId: string
  projetoId: string
  weekId: string
  weekLabel: string
  analiseAtual: string | null
  /** Peso da atividade parcial (app_settings) — sem isto o resumo usava 0.5 fixo
   * e divergia dos indicadores da semana. */
  partialWeight?: number
  /** Atividades ATUAIS da semana, como estão na tela. O resumo compara o plano
   * comprometido (week_baseline) com estas — antes o componente remontava os dois
   * lados a partir do retorno de get_week_analysis, perdendo inativa/fora do
   * plano e usando o status congelado do baseline, que hoje é sempre "pendente". */
  atividades: ActivityLike[]
  onSaved: () => void
}

export default function ModalAnaliseSemana({
  open,
  onClose,
  organizacaoId,
  projetoId,
  weekId,
  weekLabel,
  analiseAtual,
  onSaved,
  partialWeight = 0.5,
  atividades,
}: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [itens, setItens] = useState<WeekAnalysisItem[]>([])
  const [resumo, setResumo] = useState<WeekAnalysisSummary | null>(null)
  const [analise, setAnalise] = useState(analiseAtual ?? '')

  useEffect(() => {
    if (!open || !organizacaoId || !projetoId || !weekId) return
    setLoading(true)
    setError('')
    // As listas (reprogramados/extras/removidos) vêm do RPC; o RESUMO vem do
    // baseline real cruzado com as atividades atuais da tela. Remontar os dois
    // lados a partir do RPC descartava inativa/fora do plano e lia o status
    // congelado do baseline — que, com o snapshot no início da semana, é sempre
    // "pendente", o que zerava "Concluídos".
    Promise.all([getWeekAnalysis(organizacaoId, projetoId, weekId), getWeekBaseline(organizacaoId, projetoId, weekId)])
      .then(([analise, baseline]) => {
        setItens(analise)
        setResumo(computeWeekAnalysisSummary(baseline, atividades, partialWeight))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [open, organizacaoId, projetoId, weekId, atividades, partialWeight])

  useEffect(() => {
    setAnalise(analiseAtual ?? '')
  }, [analiseAtual])

  async function handleSave() {
    setSaving(true)
    try {
      await updateWeekAnalise(organizacaoId, projetoId, weekId, analise || null)
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const reprogramados = itens.filter(i => i.was_reprogrammed)
  const extrasAdicionados = itens.filter(i => i.was_added_after_lock)
  // Havia aqui uma lista `naoConcluidos` que nunca era renderizada e ainda lia
  // `baseline_status` — que hoje é sempre "pendente", já que o snapshot é do
  // início da semana. Quem informa não concluídos é resumo.naoConcluidas, que
  // olha o status atual.

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Análise Semanal — {weekLabel}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Carregando análise...
          </div>
        ) : error ? (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Resumo */}
            {resumo && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold">{resumo.totalBaseline}</div>
                  <div className="text-xs text-muted-foreground">Itens no baseline</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{resumo.concluidasNoBaseline}</div>
                  <div className="text-xs text-muted-foreground">Concluídos</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600">{resumo.naoConcluidas}</div>
                  <div className="text-xs text-muted-foreground">Não concluídos</div>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{resumo.reprogramadas}</div>
                  <div className="text-xs text-muted-foreground">Reprogramados</div>
                </div>
              </div>
            )}

            {/* Aderência. Layout responsivo veio da main; os rótulos, a regra do
                Badge e o texto explicativo vieram do plano comprometido — as duas
                coisas são independentes e ambas ficam. */}
            {resumo && (
              <div className="rounded-lg border p-3">
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <span className="text-muted-foreground">Plano comprometido:</span>{' '}
                    <span className="font-semibold">{Math.round(resumo.aderenciaBaseline * 100)}%</span>
                  </div>
                  <ArrowRight size={14} className="hidden text-muted-foreground sm:block" />
                  <div className="text-sm">
                    <span className="text-muted-foreground">Aderência atual:</span>{' '}
                    <span className="font-semibold">{Math.round(resumo.aderenciaAtual * 100)}%</span>
                  </div>
                  {/* Delta positivo é o sinal ruim aqui: significa que a conta
                      "atual" ficou ACIMA do compromisso, ou seja, o conjunto foi
                      alterado a favor do número. A main ainda tinha a regra
                      invertida (delta >= 0 => 'default'), de quando o baseline era
                      tirado no fechamento e o delta era sempre ~zero. */}
                  <Badge variant={resumo.delta > 0.05 ? 'destructive' : 'default'} className="sm:ml-2">
                    {resumo.delta >= 0 ? '+' : ''}{Math.round(resumo.delta * 100)}pp
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {resumo.delta > 0.05
                    ? 'A aderência atual está acima do plano comprometido: itens do compromisso saíram da conta (viraram extra, foram inativados ou excluídos). Vale conferir se a reprogramação foi coerente.'
                    : 'O plano comprometido é o conjunto congelado no início da semana; a aderência atual reflete o quadro como está agora. Quanto mais próximos, mais coerente foi a semana.'}
                </p>
              </div>
            )}

            {/* Reprogramados */}
            {reprogramados.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <RotateCcw size={14} className="text-blue-600" />
                  Reprogramados ({reprogramados.length})
                </h4>
                <div className="rounded-lg border max-h-40 overflow-y-auto">
                  {reprogramados.map((item) => (
                    <div key={item.activity_id} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-sm">
                      <span className="truncate">{item.activity_name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                        <span>{formatBR(item.baseline_date)}</span>
                        <ArrowRight size={12} />
                        <span>{formatBR(item.planned_date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extras adicionados */}
            {extrasAdicionados.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Plus size={14} className="text-green-600" />
                  Extras Adicionados ({extrasAdicionados.length})
                </h4>
                <div className="rounded-lg border max-h-40 overflow-y-auto">
                  {extrasAdicionados.map((item) => (
                    <div key={item.activity_id} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-sm">
                      <span className="truncate">{item.activity_name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatBR(item.planned_date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Removidos */}
            {itens.filter(i => i.was_removed_after_lock).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Minus size={14} className="text-red-600" />
                  Removidos ({itens.filter(i => i.was_removed_after_lock).length})
                </h4>
                <div className="rounded-lg border max-h-40 overflow-y-auto">
                  {itens.filter(i => i.was_removed_after_lock).map((item) => (
                    <div key={item.activity_id} className="flex items-center justify-between px-3 py-2 border-b last:border-b-0 text-sm">
                      <span className="truncate text-muted-foreground line-through">{item.activity_name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{formatBR(item.baseline_date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Campo de análise */}
            <div>
              <label className="text-sm font-medium mb-1 block">Observações da Semana</label>
              <Textarea
                value={analise}
                onChange={(e) => setAnalise(e.target.value)}
                placeholder="Registre observações sobre a semana: motivos dos não conformes, ações corretivas, lições aprendidas..."
                rows={4}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Análise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
