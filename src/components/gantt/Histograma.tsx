import { useMemo, useRef, useEffect, useState } from 'react';
import { Ban, Users, Wrench, Download, ChevronDown, ChevronRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { useGanttStore } from '@/lib/gantt/store';
import { columnWidthFor, addDays, toISODate, startOfWeek, startOfMonth, formatDayMonth, formatMonthYear, isoWeek } from '@/lib/gantt/dates';
import {
  calcularHistograma,
  getFuncoes,
  getCapacidadeMaxima,
  calcularHistogramaEquipamentos,
  getEquipamentos,
  type Granularidade,
} from '@/lib/gantt/histograma';

function colLabel(date: Date, gran: Granularidade): string {
  if (gran === 'dia') return formatDayMonth(date);
  if (gran === 'semana') return `S${String(isoWeek(date)).padStart(2, '0')}`;
  return formatMonthYear(date);
}

type Props = {
  granularidade: Granularidade;
  dataInicio: Date;
  dataFim: Date;
  scrollLeft: number;
  onScrollSync: (left: number) => void;
  // Mesma largura da coluna de rótulos do Gantt Livre acima — senão as
  // colunas de data dos dois painéis desalinham quando o Gantt é redimensionado.
  labelWidth: number;
};

type ModoHistograma = 'pessoas' | 'equipamentos';

const ROW_HEIGHT = 28;
const BAR_MAX_HEIGHT = 60;
const DATE_ROW_HEIGHT = 22;

export function Histograma({ granularidade, dataInicio, dataFim, scrollLeft, onScrollSync, labelWidth }: Props) {
  const { atividades, equipes, activeScenarioId, paradas } = useGanttStore();
  const [modo, setModo] = useState<ModoHistograma>('pessoas');
  // TOTAL GERAL/TOTAL POR DIA continuam sempre visíveis mesmo recolhido — só
  // as linhas de detalhe por função/equipamento (que ocupam mais espaço) somem.
  const [detalhesVisiveis, setDetalhesVisiveis] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const colWidth = columnWidthFor(granularidade);

  const scenarioAtividades = atividades.filter((a) => a.scenario_id === activeScenarioId);
  const scenarioEquipes = equipes.filter((e) => e.scenario_id === activeScenarioId);
  const scenarioParadas = paradas.filter((p) => p.scenario_id === activeScenarioId);
  const paradaSet = new Set(scenarioParadas.map((p) => p.data));

  const funcoes = useMemo(() => getFuncoes(scenarioEquipes), [scenarioEquipes]);
  const equipamentos = useMemo(() => getEquipamentos(scenarioEquipes), [scenarioEquipes]);
  const labels = modo === 'pessoas' ? funcoes : equipamentos;

  const histPessoas = useMemo(
    () => calcularHistograma(scenarioAtividades, scenarioEquipes, dataInicio, dataFim),
    [scenarioAtividades, scenarioEquipes, dataInicio, dataFim]
  );
  const histEquip = useMemo(
    () => calcularHistogramaEquipamentos(scenarioAtividades, scenarioEquipes, dataInicio, dataFim),
    [scenarioAtividades, scenarioEquipes, dataInicio, dataFim]
  );

  const { colData, colCount } = useMemo(() => {
    const cols: { date: Date; iso: string }[] = [];
    if (granularidade === 'dia') {
      for (let d = new Date(dataInicio); d <= dataFim; d = addDays(d, 1)) {
        cols.push({ date: new Date(d), iso: toISODate(d) });
      }
    } else if (granularidade === 'semana') {
      let d = startOfWeek(dataInicio);
      while (d <= dataFim) {
        cols.push({ date: new Date(d), iso: toISODate(d) });
        d = addDays(d, 7);
      }
    } else {
      let d = startOfMonth(dataInicio);
      while (d <= dataFim) {
        cols.push({ date: new Date(d), iso: toISODate(d) });
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    }
    return { colData: cols, colCount: cols.length };
  }, [dataInicio, dataFim, granularidade]);

  const colValues = useMemo(() => {
    return colData.map((col) => {
      const values: Record<string, number> = {};
      let total = 0;
      let dias = 0;
      const d = new Date(col.date);
      const step = granularidade === 'dia' ? 1 : granularidade === 'semana' ? 7 : 0;
      const iterDays = (cur: Date) => {
        if (cur > dataFim) return;
        dias++;
        const iso = toISODate(cur);
        if (modo === 'pessoas') {
          const h = histPessoas[iso];
          if (h) {
            labels.forEach((f) => { values[f] = (values[f] || 0) + (h.funcoes[f] || 0); });
            total += h.totalGeral;
          }
        } else {
          const h = histEquip[iso];
          if (h) {
            labels.forEach((eq) => { values[eq] = (values[eq] || 0) + (h.itens[eq] || 0); });
            total += h.totalGeral;
          }
        }
      };
      if (granularidade === 'mes') {
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        let cur = new Date(d);
        while (cur <= monthEnd && cur <= dataFim) {
          iterDays(cur);
          cur = addDays(cur, 1);
        }
      } else {
        for (let i = 0; i < step; i++) {
          iterDays(addDays(col.date, i));
        }
      }
      // Em semana/mês, cada coluna cobre vários dias — soma bruta dava um
      // número gigante (ex.: 120 pessoas/dia × 7 dias = 840), sem sentido
      // pra "quantas pessoas são necessárias". Mostra a média diária do
      // período, do jeito que fica na visualização por dia.
      if (dias > 1) {
        total = Math.round(total / dias);
        for (const k of Object.keys(values)) values[k] = Math.round(values[k] / dias);
      }
      return { values, total };
    });
  }, [colData, histPessoas, histEquip, labels, granularidade, dataFim, modo]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollLeft;
    }
  }, [scrollLeft]);

  const maxTotal = Math.max(...colValues.map((c) => c.total), 1);

  const handleScroll = () => {
    if (scrollRef.current) {
      onScrollSync(scrollRef.current.scrollLeft);
    }
  };

  const unidade = modo === 'pessoas' ? 'pessoas' : 'unidades';

  // Altura do painel acompanha o conteúdo — recolhido (só total) ele fica bem
  // baixinho em vez de manter o espaço vazio de quando os detalhes cabiam.
  // Cap no valor que já era o padrão (280 - cabeçalho) pra não crescer sem
  // limite com muitas funções/equipamentos — aí entra o scroll interno.
  const contentHeight = (detalhesVisiveis ? labels.length * ROW_HEIGHT : 0) + ROW_HEIGHT + BAR_MAX_HEIGHT + DATE_ROW_HEIGHT;
  const MAX_CONTENT_HEIGHT = 239;
  const panelContentHeight = Math.min(contentHeight, MAX_CONTENT_HEIGHT);

  const handleExportExcel = () => {
    const header = [modo === 'pessoas' ? 'Função' : 'Equipamento', ...colData.map((c) => colLabel(c.date, granularidade))];
    const rows = labels.map((f) => [f, ...colValues.map((cv) => cv.values[f] || 0)]);
    rows.push(['TOTAL GERAL', ...colValues.map((cv) => cv.total)]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Histograma');
    XLSX.writeFile(wb, `histograma-${modo}.xlsx`);
    toast.success('Histograma exportado com sucesso');
  };

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 border-t-2 border-gray-200 dark:border-slate-600">
      <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
        <button
          onClick={() => setDetalhesVisiveis((v) => !v)}
          title={detalhesVisiveis ? 'Ocultar detalhes (mantém o total)' : 'Mostrar detalhes'}
          className="flex items-center gap-1 text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wide hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {detalhesVisiveis ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Histograma
        </button>
        <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg border border-gray-300 dark:border-slate-600 ml-2">
          <button
            onClick={() => setModo('pessoas')}
            className={`flex items-center gap-1 px-3 py-1 text-[11px] rounded-l-lg transition-colors ${
              modo === 'pessoas' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Users size={12} /> Pessoas
          </button>
          <button
            onClick={() => setModo('equipamentos')}
            className={`flex items-center gap-1 px-3 py-1 text-[11px] rounded-r-lg transition-colors ${
              modo === 'equipamentos' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Wrench size={12} /> Equipamentos
          </button>
        </div>
        <span className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-slate-400 ml-2">
          <Ban size={12} className="text-red-500 dark:text-red-400" /> Dias com parada destacados em vermelho
        </span>
        <button
          onClick={handleExportExcel}
          className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-md transition-colors ml-auto"
        >
          <Download size={14} /> Exportar Excel
        </button>
      </div>

      <div className="flex overflow-hidden" style={{ height: panelContentHeight }}>
        <div className="shrink-0 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700" style={{ width: labelWidth }}>
          {detalhesVisiveis && labels.map((f) => (
            <div
              key={f}
              className="flex items-center px-3 border-b border-gray-100 dark:border-slate-800 text-xs text-gray-600 dark:text-slate-200 truncate"
              style={{ height: ROW_HEIGHT }}
              title={f}
            >
              {f}
            </div>
          ))}
          <div
            className="flex items-center px-3 border-b-2 border-gray-200 dark:border-slate-600 text-xs font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-800"
            style={{ height: ROW_HEIGHT }}
          >
            TOTAL GERAL
          </div>
          <div
            className="flex items-center px-3 text-xs font-bold text-blue-600 dark:text-blue-300 bg-gray-50/70 dark:bg-slate-800/50"
            style={{ height: BAR_MAX_HEIGHT }}
          >
            TOTAL / DIA
          </div>
          <div
            className="flex items-center px-3 text-[11px] font-medium text-gray-400 dark:text-slate-500 border-t border-gray-200 dark:border-slate-700"
            style={{ height: DATE_ROW_HEIGHT }}
          >
            Data
          </div>
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: colCount * colWidth, position: 'relative' }}>
            {detalhesVisiveis && labels.map((f) => (
              <div key={f} className="flex" style={{ height: ROW_HEIGHT }}>
                {colValues.map((cv, i) => {
                  const val = cv.values[f] || 0;
                  const cap = modo === 'pessoas' ? getCapacidadeMaxima(f) : null;
                  const overCap = cap !== null && val > cap;
                  const iso = colData[i].iso;
                  const isParada = paradaSet.has(iso);
                  return (
                    <div
                      key={i}
                      className={`text-center text-[11px] flex items-center justify-center border-r border-gray-100 dark:border-slate-800 ${
                        overCap
                          ? 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 font-bold'
                          : isParada
                          ? 'bg-red-50 dark:bg-red-950/40 text-gray-400 dark:text-slate-500'
                          : 'text-gray-600 dark:text-slate-200'
                      }`}
                      style={{ width: colWidth, height: ROW_HEIGHT }}
                    >
                      {val > 0 ? val : ''}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="flex border-b-2 border-gray-200 dark:border-slate-600 bg-gray-50/70 dark:bg-slate-800/50" style={{ height: ROW_HEIGHT }}>
              {colValues.map((cv, i) => {
                const iso = colData[i].iso;
                const isParada = paradaSet.has(iso);
                return (
                  <div
                    key={i}
                    className={`text-center text-xs font-bold flex items-center justify-center border-r border-gray-200 dark:border-slate-700 ${
                      isParada ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                    }`}
                    style={{ width: colWidth, height: ROW_HEIGHT }}
                  >
                    {cv.total > 0 ? cv.total : ''}
                  </div>
                );
              })}
            </div>

            <div className="flex items-end border-t border-gray-200 dark:border-slate-700" style={{ height: BAR_MAX_HEIGHT }}>
              {colValues.map((cv, i) => {
                const iso = colData[i].iso;
                const isParada = paradaSet.has(iso);
                const h = (cv.total / maxTotal) * (BAR_MAX_HEIGHT - 4);
                return (
                  <div
                    key={i}
                    className={`flex items-end justify-center border-r border-gray-100 dark:border-slate-800 ${
                      isParada ? 'bg-red-50 dark:bg-red-950/30' : ''
                    }`}
                    style={{ width: colWidth, height: BAR_MAX_HEIGHT }}
                  >
                    <div
                      className={`w-3/4 rounded-t transition-all duration-150 ${
                        isParada
                          ? 'bg-gradient-to-t from-red-700 to-red-500'
                          : 'bg-gradient-to-t from-blue-600 to-blue-400'
                      }`}
                      style={{ height: Math.max(h, cv.total > 0 ? 2 : 0) }}
                      title={`${cv.total} ${unidade}${isParada ? ' (dia de parada)' : ''}`}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex border-t border-gray-200 dark:border-slate-700" style={{ height: DATE_ROW_HEIGHT }}>
              {colData.map((c, i) => {
                const isParada = paradaSet.has(c.iso);
                return (
                  <div
                    key={i}
                    className={`text-center text-[9px] flex items-center justify-center border-r border-gray-100 dark:border-slate-800 whitespace-nowrap overflow-hidden ${
                      isParada ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-gray-400 dark:text-slate-500'
                    }`}
                    style={{ width: colWidth, height: DATE_ROW_HEIGHT }}
                  >
                    {colLabel(c.date, granularidade)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
