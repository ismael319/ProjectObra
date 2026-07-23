import { useMemo, useRef, useEffect, useState } from 'react';
import { Ban, Users, Wrench } from 'lucide-react';
import { useGanttStore } from '@/lib/gantt/store';
import { DAY_WIDTH, addDays, toISODate, startOfWeek, startOfMonth } from '@/lib/gantt/dates';
import {
  calcularHistograma,
  getFuncoes,
  getCapacidadeMaxima,
  calcularHistogramaEquipamentos,
  getEquipamentos,
  type Granularidade,
} from '@/lib/gantt/histograma';

type Props = {
  granularidade: Granularidade;
  dataInicio: Date;
  dataFim: Date;
  scrollLeft: number;
  onScrollSync: (left: number) => void;
};

type ModoHistograma = 'pessoas' | 'equipamentos';

const ROW_HEIGHT = 28;
const LABEL_WIDTH = 224;
const BAR_MAX_HEIGHT = 60;

export function Histograma({ granularidade, dataInicio, dataFim, scrollLeft, onScrollSync }: Props) {
  const { atividades, equipes, activeScenarioId, paradas } = useGanttStore();
  const [modo, setModo] = useState<ModoHistograma>('pessoas');
  const scrollRef = useRef<HTMLDivElement>(null);

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
      const d = new Date(col.date);
      const step = granularidade === 'dia' ? 1 : granularidade === 'semana' ? 7 : 0;
      const iterDays = (cur: Date) => {
        if (cur > dataFim) return;
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

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900 border-t-2 border-gray-200 dark:border-slate-600" style={{ height: 280 }}>
      <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Histograma</h3>
        <div className="flex items-center bg-white dark:bg-slate-900 rounded-lg border border-gray-300 dark:border-slate-600 ml-2">
          <button
            onClick={() => setModo('pessoas')}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-l-lg transition-colors ${
              modo === 'pessoas' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Users size={12} /> Pessoas
          </button>
          <button
            onClick={() => setModo('equipamentos')}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded-r-lg transition-colors ${
              modo === 'equipamentos' ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Wrench size={12} /> Equipamentos
          </button>
        </div>
        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-400 ml-2">
          <Ban size={12} className="text-red-500 dark:text-red-400" /> Dias com parada destacados em vermelho
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="shrink-0 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700" style={{ width: LABEL_WIDTH }}>
          {labels.map((f) => (
            <div
              key={f}
              className="flex items-center px-3 border-b border-gray-100 dark:border-slate-800 text-sm text-gray-600 dark:text-slate-200 truncate"
              style={{ height: ROW_HEIGHT }}
              title={f}
            >
              {f}
            </div>
          ))}
          <div
            className="flex items-center px-3 border-b-2 border-gray-200 dark:border-slate-600 text-sm font-bold text-gray-900 dark:text-white bg-gray-50 dark:bg-slate-800"
            style={{ height: ROW_HEIGHT }}
          >
            TOTAL GERAL
          </div>
          <div
            className="flex items-center px-3 text-sm font-bold text-blue-600 dark:text-blue-300 bg-gray-50/70 dark:bg-slate-800/50"
            style={{ height: BAR_MAX_HEIGHT }}
          >
            TOTAL / DIA
          </div>
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-x-auto overflow-y-hidden">
          <div style={{ width: colCount * DAY_WIDTH, position: 'relative' }}>
            {labels.map((f) => (
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
                      className={`text-center text-xs flex items-center justify-center border-r border-gray-100 dark:border-slate-800 ${
                        overCap
                          ? 'bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 font-bold'
                          : isParada
                          ? 'bg-red-50 dark:bg-red-950/40 text-gray-400 dark:text-slate-500'
                          : 'text-gray-600 dark:text-slate-200'
                      }`}
                      style={{ width: DAY_WIDTH, height: ROW_HEIGHT }}
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
                    className={`text-center text-sm font-bold flex items-center justify-center border-r border-gray-200 dark:border-slate-700 ${
                      isParada ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'
                    }`}
                    style={{ width: DAY_WIDTH, height: ROW_HEIGHT }}
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
                    style={{ width: DAY_WIDTH, height: BAR_MAX_HEIGHT }}
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
          </div>
        </div>
      </div>
    </div>
  );
}
