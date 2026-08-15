import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileDown, FileUp, Lock, Unlock, Download, Eraser, UserCog, Image, TriangleAlert, ClipboardCheck, Undo2, CircleAlert } from 'lucide-react'
import { formatShortDate, parseISODateStr } from '@/lib/iso-week'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { WeekStatus } from '@/lib/programacao-db'

interface Props {
  isoYear: number
  isoWeek: number
  startDate: string
  endDate: string
  status: WeekStatus
  /** Só vale enquanto `status === 'consolidado'` — fechar a semana não marca
   * isso sozinho, é uma confirmação à parte (ver concluirAnaliseSemanal). */
  analiseConcluida: boolean
  /** Papel efetivo do usuário no módulo Engenharia — só quem tem Edição pode
   * bloquear/desbloquear a semana (a RLS já barra no banco; isso só evita
   * oferecer a ação pra quem não pode usá-la). */
  podeEditar: boolean
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
  /** Congela o plano da semana (baseline) e move o estado pra 'comprometida'. */
  onComprometer: () => void
  /** Descarta o plano comprometido e volta pra montagem — destrutivo. */
  onReabrirMontagem: () => void
  onClearWeek: () => void
  onManageEngenheiros: () => void
  onExportSemanal: () => void
  onAnalysis: () => void
}

export default function WeekBar({
  isoYear,
  isoWeek,
  startDate,
  endDate,
  status,
  analiseConcluida,
  podeEditar,
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
  onComprometer,
  onReabrirMontagem,
  onClearWeek,
  onManageEngenheiros,
  onExportSemanal,
  onAnalysis,
}: Props) {
  const start = parseISODateStr(startDate)
  const end = parseISODateStr(endDate)
  const isoLabel = `${isoYear}-S${String(isoWeek).padStart(2, '0')}`
  const locked = status === 'consolidado'
  const comprometida = status === 'comprometida'
  const [actionsOpen, setActionsOpen] = useState(false)

  // Três estados, três leituras diferentes do quadro — ver WeekStatus.
  const badge = locked
    ? {
        rotulo: 'Fechada',
        classe: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
        icone: <Lock size={11} />,
        ajuda:
          'Semana fechada: status travados contra edição e o PPC do plano comprometido congelado. Desbloqueie no menu "Ações" pra editar de novo.',
      }
    : comprometida
      ? {
          rotulo: 'Comprometida',
          classe: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
          icone: <ClipboardCheck size={11} />,
          ajuda:
            'O plano da semana foi congelado num baseline e a semana está rodando. Apontar status é livre — é o dia a dia. Mexer no CONJUNTO (excluir, marcar Extra, inativar) continua possível, mas fica registrado na Análise Semanal e aparece como diferença entre o PPC comprometido e a aderência ajustada.',
        }
      : {
          rotulo: 'Em montagem',
          classe: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
          icone: null,
          ajuda:
            'Semana ainda em montagem: importe do cronograma, ajuste os dias e marque o que fica "fora desta semana". Ainda não existe PPC — ninguém se comprometeu com nada. Use "Comprometer semana" quando o plano estiver fechado.',
        }
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
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full ${badge.classe}`}
          >
            {badge.icone}
            {badge.rotulo}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {badge.ajuda}
        </TooltipContent>
      </Tooltip>

      {/* Fechar a semana e concluir a Análise Semanal são passos distintos
          de propósito (ver concluirAnaliseSemanal) — este selo é o que deixa
          visível que ainda falta alguém revisar o resumo, mesmo com o
          status/PPC já travados. */}
      {locked && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full ${
                analiseConcluida
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              }`}
            >
              {analiseConcluida ? <ClipboardCheck size={11} /> : <CircleAlert size={11} />}
              {analiseConcluida ? 'Análise concluída' : 'Análise pendente'}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {analiseConcluida
              ? 'Alguém já revisou o resumo da Análise Semanal e confirmou.'
              : 'A semana está fechada, mas ainda falta revisar o resumo em Análise Semanal e confirmar.'}
          </TooltipContent>
        </Tooltip>
      )}

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
              {/* Uma ação por estado, na ordem do ciclo: montagem → comprometida
                  → fechada. Antes o menu só tinha Bloquear/Desbloquear, porque o
                  compromisso não existia como passo — o baseline era tirado no
                  fechamento, o que fazia dele uma cópia do resultado. */}
              {locked ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setActionsOpen(false); onUnlock() }}
                      disabled={!podeEditar}
                      title={!podeEditar ? 'Só quem tem nível de acesso Edição pode desbloquear a semana' : undefined}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <Unlock size={14} className="text-green-600" />
                      Reabrir semana
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    {podeEditar
                      ? 'Volta a semana pra "Comprometida", liberando os status pra edição. O plano comprometido é mantido — reabrir não gera um baseline novo.'
                      : 'Só quem tem nível de acesso Edição pode reabrir a semana.'}
                  </TooltipContent>
                </Tooltip>
              ) : comprometida ? (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => { setActionsOpen(false); onLock() }}
                        disabled={!podeEditar}
                        title={!podeEditar ? 'Só quem tem nível de acesso Edição pode fechar a semana' : undefined}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <Lock size={14} className="text-red-600" />
                        Fechar semana
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      {podeEditar
                        ? 'Encerra a semana: trava status e conjunto contra edição e congela o PPC do plano comprometido.'
                        : 'Só quem tem nível de acesso Edição pode fechar a semana.'}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => { setActionsOpen(false); onReabrirMontagem() }}
                        disabled={!podeEditar}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      >
                        <Undo2 size={14} />
                        Voltar pra montagem
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs">
                      Descarta o plano comprometido desta semana e volta pra montagem. Use só pra corrigir um comprometimento feito por engano — o compromisso assumido é apagado.
                    </TooltipContent>
                  </Tooltip>
                </>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setActionsOpen(false); onComprometer() }}
                      disabled={!podeEditar}
                      title={!podeEditar ? 'Só quem tem nível de acesso Edição pode comprometer a semana' : undefined}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    >
                      <ClipboardCheck size={14} />
                      Comprometer semana
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">
                    {podeEditar
                      ? 'Congela o plano desta semana: o conjunto de atividades vira o compromisso contra o qual o PPC é medido. Faça isso no INÍCIO da semana, depois de importar do cronograma e marcar o que fica "fora desta semana". Apontar status continua livre.'
                      : 'Só quem tem nível de acesso Edição pode comprometer a semana.'}
                  </TooltipContent>
                </Tooltip>
              )}
              <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => { setActionsOpen(false); onImportActivities() }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
                  >
                    <Download size={14} className="text-purple-600" />
                    Importar atividades
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-xs">Busca, nos cronogramas carregados, as tarefas com trabalho previsto nesta semana pra adicionar ao quadro. Funciona mesmo com a semana bloqueada.</TooltipContent>
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
              {/* Disponível já na semana comprometida, não só na fechada: com o
                  baseline gravado no início, a análise passa a ter o que
                  comparar durante a semana — antes o plano só existia depois de
                  fechar, então não havia nada pra mostrar. */}
              {(locked || comprometida) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => { setActionsOpen(false); onAnalysis() }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition"
                    >
                      <ClipboardCheck size={14} className="text-green-600" />
                      Análise Semanal
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-xs">Compara o plano comprometido com o que aconteceu: itens não concluídos, reprogramações, extras e removidos, mais o campo de observações da semana.</TooltipContent>
                </Tooltip>
              )}
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
