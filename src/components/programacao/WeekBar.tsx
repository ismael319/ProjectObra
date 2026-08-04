import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileDown, FileUp, Lock, Unlock, Download, Eraser, UserCog, Image, TriangleAlert } from 'lucide-react'
import { formatShortDate, parseISODateStr } from '@/lib/iso-week'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  isoYear: number
  isoWeek: number
  startDate: string
  endDate: string
  status: 'rascunho' | 'consolidado'
  /** Aderência calculada sobre o plano ORIGINAL da semana (ignora Extra/Inativa
   * feitos depois) — ver computeIndicatorsCronograma. */
  aderenciaCronograma: number
  /** Aderência calculada sobre o estado ATUAL das atividades (o que já era exibido
   * antes) — ver computeIndicators. */
  aderenciaAjustada: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onExportExcel: () => void
  onImportExcel: (file: File) => void
  onLock: () => void
  onUnlock: () => void
  onImportActivities: () => void
  onClearWeek: () => void
  onManageEngenheiros: () => void
  onExportSemanal: () => void
}

export default function WeekBar({
  isoYear,
  isoWeek,
  startDate,
  endDate,
  status,
  aderenciaCronograma,
  aderenciaAjustada,
  onPrev,
  onNext,
  onToday,
  onExportExcel,
  onImportExcel,
  onLock,
  onUnlock,
  onImportActivities,
  onClearWeek,
  onManageEngenheiros,
  onExportSemanal,
}: Props) {
  const start = parseISODateStr(startDate)
  const end = parseISODateStr(endDate)
  const isoLabel = `${isoYear}-S${String(isoWeek).padStart(2, '0')}`
  const locked = status === 'consolidado'
  const [actionsOpen, setActionsOpen] = useState(false)
  // Ajustada bem acima da do Cronograma = sinal de reprogramação incoerente (Extra/
  // Inativa usados pra "limpar" o número em vez de refletir o que foi entregue).
  const deltaPP = Math.round((aderenciaAjustada - aderenciaCronograma) * 100)
  const deltaSuspeito = deltaPP >= 10

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          title="Semana anterior"
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="px-2 text-sm font-medium tabular-nums text-gray-900 dark:text-white">
          {formatShortDate(start)} — {formatShortDate(end)}
          <span className="ml-2 text-gray-500 dark:text-gray-400">({isoLabel})</span>
        </div>
        <button
          onClick={onNext}
          title="Próxima semana"
          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <button
        onClick={onToday}
        className="px-3 py-1.5 text-sm font-medium border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
      >
        Semana atual
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full ${
              locked
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            {locked ? <Lock size={11} /> : null}
            {locked ? 'Bloqueada' : 'Rascunho'}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {locked
            ? 'Semana consolidada: os status das atividades já foram fechados e ficam travados contra edição (só atividades extras podem ser removidas). Desbloqueie no menu "Ações" pra editar de novo.'
            : 'Semana ainda em rascunho: os status podem ser editados livremente. Bloqueie no menu "Ações" quando o apontamento estiver fechado.'}
        </TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-4 text-sm">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span>Aderência cronograma:</span>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                {Math.round(aderenciaCronograma * 100)}%
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            Aderência do plano ORIGINAL da semana — ignora qualquer Extra/Inativa marcado depois. Mede se o
            que foi importado do cronograma acabou sendo entregue.
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <span>Aderência ajustada:</span>
              <span className="font-semibold tabular-nums text-gray-900 dark:text-white">
                {Math.round(aderenciaAjustada * 100)}%
              </span>
              {deltaSuspeito && (
                <span
                  className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400"
                  title={`${deltaPP} pontos percentuais acima da Aderência cronograma`}
                >
                  <TriangleAlert size={12} />
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            Aderência com o estado ATUAL das atividades (depois de qualquer reprogramação, Extra ou Inativa
            feito ao longo da semana). {deltaSuspeito ? `${deltaPP}pp acima da Aderência cronograma — vale conferir se a reprogramação foi coerente.` : 'Compare com a Aderência cronograma pra ver se a semana foi reprogramada com coerência.'}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActionsOpen((v) => !v)}
              className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Ações
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            Bloquear/desbloquear a semana, importar atividades do cronograma, exportar/importar Excel e
            limpar a semana inteira.
          </TooltipContent>
        </Tooltip>
        {actionsOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setActionsOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-20 p-1">
              {locked ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setActionsOpen(false); onUnlock() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
                    >
                      <Unlock size={14} className="text-green-600" />
                      Desbloquear semana
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">Volta a semana pro rascunho, liberando os status das atividades pra edição de novo.</TooltipContent>
                </Tooltip>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setActionsOpen(false); onLock() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
                    >
                      <Lock size={14} className="text-red-600" />
                      Bloquear semana
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">Consolida a semana: trava os status das atividades contra edição (só extras continuam removíveis).</TooltipContent>
                </Tooltip>
              )}
              <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setActionsOpen(false); onImportActivities() }}
                    disabled={locked}
                    title={locked ? 'Desbloqueie a semana para importar atividades' : undefined}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download size={14} className="text-purple-600" />
                    Importar atividades
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">Busca, nos cronogramas carregados, as tarefas com trabalho previsto nesta semana pra adicionar ao quadro.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setActionsOpen(false); onManageEngenheiros() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
                  >
                    <UserCog size={14} className="text-purple-600" />
                    Engenheiros por Área
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">Cadastra qual engenheiro responde por cada área do cronograma — sugerido automaticamente na 2ª etapa da importação.</TooltipContent>
              </Tooltip>
              <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setActionsOpen(false); onExportSemanal() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
                  >
                    <Image size={14} className="text-blue-600" />
                    Exportar Programação Semanal
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">Gera uma imagem com a semana inteira por Engenheiro, pra compartilhar no WhatsApp.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setActionsOpen(false); onExportExcel() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
                  >
                    <FileDown size={14} className="text-blue-600" />
                    Exportar Excel
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">Baixa as atividades desta semana em uma planilha .xlsx.</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition cursor-pointer">
                    <FileUp size={14} className="text-orange-600" />
                    Importar Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        setActionsOpen(false)
                        if (f) onImportExcel(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">Sobe uma planilha .xlsx previamente exportada pra atualizar status/observações em massa (casado pelo ID da atividade).</TooltipContent>
              </Tooltip>
              <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setActionsOpen(false); onClearWeek() }}
                    disabled={locked}
                    title={locked ? 'Desbloqueie a semana para limpar' : undefined}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <Eraser size={14} />
                    Limpar semana
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">Remove TODAS as atividades (incluindo extras) desta semana. Não pode ser desfeito.</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>
    </div>
    </TooltipProvider>
  )
}
