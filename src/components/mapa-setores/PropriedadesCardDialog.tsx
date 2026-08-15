import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import type { CronogramaInfo } from '@/lib/project-store'
import { useSalvarPropriedadesDoCard, type MapaSetoresMarcador } from '@/lib/mapa-setores/mapa-setores-db'
import {
  CAMPO_LABEL,
  listarAtividadesSelecionaveis,
  listarColunasPersonalizadas,
  vinculoOrfao,
  type CampoCard,
  type FonteTipo,
  type VinculoCampo,
} from '@/lib/mapa-setores/progresso'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizacaoId: string
  plantaId: string
  marcador: MapaSetoresMarcador
  cronogramasAtivos: CronogramaInfo[]
  camposAtuais: VinculoCampo[]
}

interface EstadoCampo {
  fonte: FonteTipo | null
  activityUid: string | null
  customFieldId: string | null
}

const CAMPOS: CampoCard[] = ['inicio', 'termino', 'avanco_prev', 'avanco_concl']

const ESTADO_VAZIO: Record<CampoCard, EstadoCampo> = {
  inicio: { fonte: null, activityUid: null, customFieldId: null },
  termino: { fonte: null, activityUid: null, customFieldId: null },
  avanco_prev: { fonte: null, activityUid: null, customFieldId: null },
  avanco_concl: { fonte: null, activityUid: null, customFieldId: null },
}

export default function PropriedadesCardDialog({
  open, onOpenChange, organizacaoId, plantaId, marcador, cronogramasAtivos, camposAtuais,
}: Props) {
  const [cronogramaId, setCronogramaId] = useState<string | null>(marcador.cronograma_id)
  const [estado, setEstado] = useState<Record<CampoCard, EstadoCampo>>(ESTADO_VAZIO)

  const salvar = useSalvarPropriedadesDoCard(plantaId)

  useEffect(() => {
    if (!open) return
    setCronogramaId(marcador.cronograma_id)
    const inicial = { ...ESTADO_VAZIO }
    for (const c of camposAtuais) {
      inicial[c.campo] = {
        fonte: c.fonteTipo,
        activityUid: String(c.activityUid),
        customFieldId: c.customFieldId,
      }
    }
    setEstado(inicial)
  }, [open, marcador, camposAtuais])

  const cronograma = useMemo(() => cronogramasAtivos.find((c) => c.id === cronogramaId), [cronogramasAtivos, cronogramaId])

  const opcoesCronograma = useMemo(
    () => cronogramasAtivos.map((c) => ({ value: c.id, label: c.nome })),
    [cronogramasAtivos],
  )

  const opcoesAtividade = useMemo(() => {
    const atividades = listarAtividadesSelecionaveis(cronograma)
    return atividades.map((a) => ({
      value: String(a.activityUid),
      label: `${a.wbs} — ${a.nome}`,
      group: a.isSummary ? 'Tarefas-resumo (rollup)' : 'Atividades',
    }))
  }, [cronograma])

  const opcoesColuna = useMemo(
    () => listarColunasPersonalizadas(cronograma).map((c) => ({ value: c.fieldId, label: c.nome })),
    [cronograma],
  )

  function trocarCronograma(novoId: string | null) {
    setCronogramaId(novoId)
    setEstado(ESTADO_VAZIO)
  }

  function setFonte(campo: CampoCard, fonte: FonteTipo | null) {
    setEstado((prev) => ({ ...prev, [campo]: { fonte, activityUid: null, customFieldId: null } }))
  }

  function setActivityUid(campo: CampoCard, activityUid: string | null) {
    setEstado((prev) => ({ ...prev, [campo]: { ...prev[campo], activityUid } }))
  }

  function setCustomFieldId(campo: CampoCard, customFieldId: string | null) {
    setEstado((prev) => ({ ...prev, [campo]: { ...prev[campo], customFieldId } }))
  }

  async function handleSalvar() {
    const campos = CAMPOS.filter((c) => estado[c].fonte && estado[c].activityUid).map((c) => ({
      campo: c,
      fonteTipo: estado[c].fonte!,
      activityUid: Number(estado[c].activityUid),
      customFieldId: estado[c].fonte === 'coluna_personalizada' ? estado[c].customFieldId : null,
    }))

    const semColuna = campos.find((c) => c.fonteTipo === 'coluna_personalizada' && !c.customFieldId)
    if (semColuna) {
      toast.error(`Escolha a coluna personalizada de "${CAMPO_LABEL[semColuna.campo]}".`)
      return
    }

    try {
      await salvar.mutateAsync({ organizacaoId, marcadorId: marcador.id, cronogramaId, campos })
      toast.success('Propriedades do card salvas')
      onOpenChange(false)
    } catch (err) {
      toast.error(`Não foi possível salvar: ${err instanceof Error ? err.message : err}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Propriedades do card — {marcador.nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Cronograma</Label>
            <Combobox
              options={opcoesCronograma}
              value={cronogramaId}
              onChange={trocarCronograma}
              placeholder="Escolha o cronograma..."
              allowClear={false}
            />
            <p className="text-xs text-muted-foreground">
              Os 4 campos abaixo só enxergam atividades deste cronograma.
            </p>
          </div>

          {cronogramaId && (
            <div className="space-y-3">
              {CAMPOS.map((campo) => {
                const e = estado[campo]
                const orfao =
                  e.fonte && e.activityUid
                    ? vinculoOrfao(cronograma, { campo, fonteTipo: e.fonte, activityUid: Number(e.activityUid), customFieldId: e.customFieldId })
                    : false
                return (
                  <div key={campo} className="border rounded-md p-2.5 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <Label className="text-xs font-semibold uppercase tracking-wide">{CAMPO_LABEL[campo]}</Label>
                      <div className="flex gap-1">
                        <Button type="button" size="sm" variant={e.fonte === null ? 'default' : 'outline'} onClick={() => setFonte(campo, null)}>
                          Nenhuma
                        </Button>
                        <Button type="button" size="sm" variant={e.fonte === 'atividade' ? 'default' : 'outline'} onClick={() => setFonte(campo, 'atividade')}>
                          Atividade
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={e.fonte === 'coluna_personalizada' ? 'default' : 'outline'}
                          onClick={() => setFonte(campo, 'coluna_personalizada')}
                        >
                          Coluna
                        </Button>
                      </div>
                    </div>

                    {e.fonte && (
                      <div className="space-y-2">
                        <Combobox
                          options={opcoesAtividade}
                          value={e.activityUid}
                          onChange={(v) => setActivityUid(campo, v)}
                          placeholder="Buscar atividade por nome ou WBS..."
                        />
                        {e.fonte === 'coluna_personalizada' && (
                          opcoesColuna.length === 0 ? (
                            <p className="text-xs text-amber-600">
                              Este cronograma não tem coluna personalizada configurada no MS Project.
                            </p>
                          ) : (
                            <Combobox
                              options={opcoesColuna}
                              value={e.customFieldId}
                              onChange={(v) => setCustomFieldId(campo, v)}
                              placeholder="Escolha a coluna..."
                            />
                          )
                        )}
                        {orfao && (
                          <p className="text-xs text-amber-600">
                            Esta atividade não foi encontrada no cronograma atual (pode ter sido removida numa reimportação).
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} disabled={salvar.isPending || !cronogramaId}>
            {salvar.isPending && <Loader2 className="animate-spin mr-1" size={15} />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
