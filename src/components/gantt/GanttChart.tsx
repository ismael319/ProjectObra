import { useRef, useState, useEffect, useCallback, type WheelEvent } from 'react';
import { Plus, Trash2, Ban } from 'lucide-react';
import { useGanttStore } from '@/lib/gantt/store';
import {
  DAY_WIDTH,
  parseDate,
  toISODate,
  addDays,
  daysBetween,
  startOfWeek,
  startOfMonth,
  isoWeek,
  isoWeekYear,
  formatWeekHeader,
  formatMonthYear,
} from '@/lib/gantt/dates';
import type { Granularidade } from '@/lib/gantt/histograma';
import { ContextMenu } from './ContextMenu';

type Props = {
  granularidade: Granularidade;
  dataInicio: Date;
  dataFim: Date;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScrollSync: (left: number) => void;
  onDateRangeChange: (inicio: Date, fim: Date) => void;
};

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 64;
const LABEL_WIDTH = 176;

const COLORS = ['#2F6FE4', '#E07B2F', '#2FAE54', '#B23FE0', '#E0B23F', '#E03F5F', '#3FE0C0', '#5F3FE0'];

export function GanttChart({ granularidade, dataInicio, dataFim, scrollRef, onScrollSync, onDateRangeChange }: Props) {
  const { atividades, equipes, activeScenarioId, addAtividade, updateAtividade, deleteAtividade, paradas, toggleParada } = useGanttStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ nome: '', equipes: [] as string[], cor: COLORS[0], duracao: 7, dataInicio: '' });
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; atvId: string } | null>(null);
  const [selectingFor, setSelectingFor] = useState<{ mode: 'predecessora' | 'sucessora'; sourceId: string; targetId?: string; lag: number } | null>(null);
  const dragState = useRef<{
    id: string;
    type: 'move' | 'resize-l' | 'resize-r';
    startX: number;
    origStart: Date;
    origEnd: Date;
  } | null>(null);

  const scenarioAtividades = atividades
    .filter((a) => a.scenario_id === activeScenarioId)
    .sort((a, b) => a.ordem - b.ordem);
  const scenarioEquipes = equipes.filter((e) => e.scenario_id === activeScenarioId);
  const scenarioParadas = paradas.filter((p) => p.scenario_id === activeScenarioId);
  const paradaSet = new Set(scenarioParadas.map((p) => p.data));

  const columns = buildColumns(dataInicio, dataFim, granularidade);
  const totalWidth = columns.length * DAY_WIDTH;

  const handleScroll = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      onScrollSync(e.currentTarget.scrollLeft);
    },
    [onScrollSync]
  );

  useEffect(() => {
    const findDependentes = (atvId: string, atividades: typeof scenarioAtividades): typeof atividades => {
      return atividades.filter((a) => (a.predecessoras ?? []).some((p) => p.id === atvId));
    };

    const handleMove = (e: MouseEvent) => {
      const d = dragState.current;
      if (!d) return;
      const deltaPx = e.clientX - d.startX;
      const deltaDays = Math.round(deltaPx / DAY_WIDTH);
      if (deltaDays === 0) return;

      let newStart = new Date(d.origStart);
      let newEnd = new Date(d.origEnd);

      if (d.type === 'move') {
        newStart = addDays(d.origStart, deltaDays);
        newEnd = addDays(d.origEnd, deltaDays);
      } else if (d.type === 'resize-l') {
        newStart = addDays(d.origStart, deltaDays);
        if (newStart >= newEnd) newStart = addDays(newEnd, -1);
      } else if (d.type === 'resize-r') {
        newEnd = addDays(d.origEnd, deltaDays);
        if (newEnd <= newStart) newEnd = addDays(newStart, 1);
      }

      updateAtividade(d.id, { data_inicio: toISODate(newStart), data_fim: toISODate(newEnd) });

      const propagate = (parentId: string, currentActivities: typeof scenarioAtividades, parentDelta: number) => {
        const dependentes = findDependentes(parentId, currentActivities);
        dependentes.forEach((dep) => {
          const pred = (dep.predecessoras ?? []).find((p) => p.id === parentId);
          if (!pred) return;
          const depStart = parseDate(dep.data_inicio);
          const depEnd = parseDate(dep.data_fim);
          const newDepStart = addDays(depStart, parentDelta);
          const newDepEnd = addDays(depEnd, parentDelta);
          updateAtividade(dep.id, { data_inicio: toISODate(newDepStart), data_fim: toISODate(newDepEnd) });
          propagate(dep.id, currentActivities, parentDelta);
        });
      };

      if (d.type === 'move') {
        propagate(d.id, scenarioAtividades, deltaDays);
      }

      if (newStart < dataInicio) onDateRangeChange(newStart, dataFim);
      if (newEnd > dataFim) onDateRangeChange(dataInicio, newEnd);
    };

    const handleUp = () => {
      dragState.current = null;
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [updateAtividade, dataInicio, dataFim, onDateRangeChange]);

  const onBarMouseDown = (e: React.MouseEvent, atvId: string, type: 'move' | 'resize-l' | 'resize-r') => {
    e.preventDefault();
    e.stopPropagation();
    const atv = scenarioAtividades.find((a) => a.id === atvId);
    if (!atv) return;
    dragState.current = {
      id: atvId,
      type,
      startX: e.clientX,
      origStart: parseDate(atv.data_inicio),
      origEnd: parseDate(atv.data_fim),
    };
  };

  const handleAddAtividade = async () => {
    if (!form.nome.trim()) {
      setAdding(false);
      return;
    }
    const start = form.dataInicio ? parseDate(form.dataInicio) : dataInicio;
    const end = addDays(start, (form.duracao || 1) - 1);
    const equipeCor = scenarioEquipes.find((e) => e.id === form.equipes[0])?.cor || COLORS[0];
    await addAtividade(form.nome.trim(), toISODate(start), toISODate(end), form.equipes, equipeCor);
    setForm({ nome: '', equipes: [], cor: COLORS[0], duracao: 7, dataInicio: '' });
    setAdding(false);
  };

  const handleStartEdit = (atvId: string) => {
    const atv = scenarioAtividades.find((a) => a.id === atvId);
    if (!atv) return;
    const start = parseDate(atv.data_inicio);
    const end = parseDate(atv.data_fim);
    const duracao = daysBetween(start, end) + 1;
    setForm({
      nome: atv.nome,
      equipes: atv.equipes_alocadas,
      cor: atv.cor,
      duracao,
      dataInicio: atv.data_inicio,
    });
    setEditing(atvId);
    setAdding(false);
  };

  const handleSaveEdit = async () => {
    if (!editing || !form.nome.trim()) {
      setEditing(null);
      return;
    }
    const start = form.dataInicio ? parseDate(form.dataInicio) : dataInicio;
    const end = addDays(start, (form.duracao || 1) - 1);
    const equipeCor = scenarioEquipes.find((e) => e.id === form.equipes[0])?.cor || COLORS[0];
    await updateAtividade(editing, {
      nome: form.nome.trim(),
      data_inicio: toISODate(start),
      data_fim: toISODate(end),
      equipes_alocadas: form.equipes,
      cor: equipeCor,
    });
    setForm({ nome: '', equipes: [], cor: COLORS[0], duracao: 7, dataInicio: '' });
    setEditing(null);
  };

  const handleToggleParada = async (isoDate: string) => {
    const willActivate = !paradaSet.has(isoDate);
    await toggleParada(isoDate);
    const target = parseDate(isoDate);
    scenarioAtividades.forEach((atv) => {
      const start = parseDate(atv.data_inicio);
      const end = parseDate(atv.data_fim);
      if (target >= start && target <= end) {
        const delta = willActivate ? 1 : -1;
        updateAtividade(atv.id, { data_fim: toISODate(addDays(end, delta)) });
      }
    });
  };

  const onBarContextMenu = (e: React.MouseEvent, atvId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectingFor(null);
    setCtxMenu({ x: e.clientX, y: e.clientY, atvId });
  };

  const handleSelectTarget = (targetId: string) => {
    if (!selectingFor) return;
    if (selectingFor.sourceId === targetId) { setSelectingFor(null); return; }
    setSelectingFor({ ...selectingFor, targetId, lag: 0 });
  };

  const handleConfirmLag = async () => {
    if (!selectingFor || !selectingFor.targetId) return;
    const lag = selectingFor.lag;
    if (selectingFor.mode === 'predecessora') {
      const target = scenarioAtividades.find((a) => a.id === selectingFor.targetId);
      if (!target) return;
      const newPreds = [...(target.predecessoras ?? []), { id: selectingFor.sourceId, lag }];
      await updateAtividade(selectingFor.targetId, { predecessoras: newPreds });
    } else {
      const current = scenarioAtividades.find((a) => a.id === selectingFor.sourceId);
      if (!current) return;
      const newPreds = [...(current.predecessoras ?? []), { id: selectingFor.targetId, lag }];
      await updateAtividade(selectingFor.sourceId, { predecessoras: newPreds });
    }
    setSelectingFor(null);
  };

  const handleRemoveDependencia = async (predId: string) => {
    if (!ctxMenu) return;
    const current = scenarioAtividades.find((a) => a.id === ctxMenu.atvId);
    if (!current) return;
    const newPreds = (current.predecessoras ?? []).filter((p) => p.id !== predId);
    await updateAtividade(ctxMenu.atvId, { predecessoras: newPreds });
  };

  useEffect(() => {
    if (!selectingFor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectingFor(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectingFor]);

  return (
    <div className="flex flex-col h-full bg-slate-900">
      {(adding || editing) && (
        <div className="flex items-center gap-2 px-4 py-3 bg-slate-800 border-b border-slate-700 flex-wrap">
          <input
            autoFocus
            placeholder="Nome da atividade"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (editing ? handleSaveEdit() : handleAddAtividade())}
            className="bg-slate-900 text-white text-sm px-3 py-2 rounded-lg border border-slate-600 outline-none focus:border-blue-500 w-52"
          />
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 mb-0.5">Início</label>
            <input
              type="date"
              value={form.dataInicio || toISODate(dataInicio)}
              onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
              className="bg-slate-900 text-white text-sm px-2.5 py-2 rounded-lg border border-slate-600 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 mb-0.5">Duração (dias)</label>
            <input
              type="number"
              min="1"
              value={form.duracao}
              onChange={(e) => setForm({ ...form, duracao: parseInt(e.target.value) || 1 })}
              className="bg-slate-900 text-white text-sm px-2.5 py-2 rounded-lg border border-slate-600 outline-none focus:border-blue-500 w-24"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-slate-500 mb-0.5">Equipe</label>
            <select
              value={form.equipes[0] || ''}
              onChange={(e) => setForm({ ...form, equipes: e.target.value ? [e.target.value] : [] })}
              className="bg-slate-900 text-white text-sm px-2.5 py-2 rounded-lg border border-slate-600 outline-none focus:border-blue-500"
            >
              <option value="">Selecione...</option>
              {scenarioEquipes.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={editing ? handleSaveEdit : handleAddAtividade}
              disabled={!form.nome.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {editing ? 'Salvar' : 'Adicionar'}
            </button>
            <button onClick={() => { setAdding(false); setEditing(null); }} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Gantt Livre</h3>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-md"
        >
          <Plus size={14} /> Nova Atividade
        </button>
      </div>

      {selectingFor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-900/60 border-b border-blue-700">
          {!selectingFor.targetId ? (
            <span className="text-xs text-blue-200">
              {selectingFor.mode === 'predecessora'
                ? `Clique na barra que será PRECESSORA de "${scenarioAtividades.find((a) => a.id === selectingFor.sourceId)?.nome}"`
                : `Clique na barra que será SUCESSORA de "${scenarioAtividades.find((a) => a.id === selectingFor.sourceId)?.nome}"`}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-blue-200">Latência (dias):</span>
              <input
                type="number"
                value={selectingFor.lag}
                onChange={(e) => setSelectingFor({ ...selectingFor, lag: parseInt(e.target.value) || 0 })}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmLag()}
                className="w-16 bg-slate-800 text-white text-xs px-2 py-1 rounded border border-blue-500 outline-none focus:border-blue-400"
                autoFocus
              />
              <button onClick={handleConfirmLag} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded">OK</button>
              <button onClick={() => setSelectingFor(null)} className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded">Cancelar</button>
            </div>
          )}
          <span className="text-xs text-blue-400 ml-auto">ESC para cancelar</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="shrink-0 bg-slate-900 border-r border-slate-700" style={{ width: LABEL_WIDTH }}>
          <div className="border-b border-slate-700" style={{ height: HEADER_HEIGHT }} />
          {scenarioAtividades.map((atv) => {
            const equipesNomes = atv.equipes_alocadas
              .map((eqId) => scenarioEquipes.find((e) => e.id === eqId)?.nome)
              .filter(Boolean)
              .join(', ');
            return (
              <div
                key={atv.id}
                className="group flex items-center justify-between px-3 border-b border-slate-800 hover:bg-slate-800/30"
                style={{ height: ROW_HEIGHT }}
              >
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{atv.nome}</p>
                  {equipesNomes && <p className="text-xs text-slate-500 truncate">{equipesNomes}</p>}
                </div>
                <button
                  onClick={() => deleteAtividade(atv.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 ml-2 shrink-0"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
        </div>

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, position: 'relative' }}>
            <div className="sticky top-0 z-20 bg-slate-800 border-b border-slate-600" style={{ height: HEADER_HEIGHT }}>
              <HeaderRow columns={columns} granularidade={granularidade} paradaSet={paradaSet} />
            </div>

            {scenarioAtividades.length === 0 ? (
              <div className="flex items-center justify-center" style={{ height: 200 }}>
                <p className="text-slate-500 text-sm">Nenhuma atividade. Clique em "+ Nova Atividade".</p>
              </div>
            ) : (
              <>
               {scenarioAtividades.map((atv) => {
                const start = parseDate(atv.data_inicio);
                const end = parseDate(atv.data_fim);
                const offsetDays = daysBetween(dataInicio, start);
                const duration = daysBetween(start, end) + 1;
                const left = offsetDays * DAY_WIDTH;
                const width = duration * DAY_WIDTH;
                const equipeCor = scenarioEquipes.find((e) => e.id === atv.equipes_alocadas[0])?.cor || atv.cor;

                return (
                  <div key={atv.id} className="relative flex" style={{ height: ROW_HEIGHT }}>
                    <GridRow columns={columns} paradaSet={paradaSet} onToggleParada={handleToggleParada} />
                    <div
                      className={`absolute rounded-md shadow-lg flex items-center px-2 select-none z-10 ${
                        selectingFor
                          ? 'cursor-pointer ring-2 ring-blue-400/70 hover:ring-blue-300'
                          : 'cursor-grab active:cursor-grabbing'
                      }`}
                      style={{
                        left: left + 1,
                        width: Math.max(width - 2, 20),
                        top: 6,
                        height: ROW_HEIGHT - 12,
                        backgroundColor: equipeCor,
                        opacity: selectingFor && selectingFor.sourceId === atv.id ? 0.5 : 1,
                      }}
                      onMouseDown={(e) => {
                        if (selectingFor) {
                          e.preventDefault();
                          handleSelectTarget(atv.id);
                        } else {
                          onBarMouseDown(e, atv.id, 'move');
                        }
                      }}
                      onContextMenu={(e) => onBarContextMenu(e, atv.id)}
                      onDoubleClick={() => handleStartEdit(atv.id)}
                    >
                      <div
                        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/20 hover:bg-white/40 rounded-l-md"
                        onMouseDown={(e) => onBarMouseDown(e, atv.id, 'resize-l')}
                      />
                      <span className="text-xs text-white font-medium truncate px-1">
                        {atv.nome} ({duration}d)
                      </span>
                      <div
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/20 hover:bg-white/40 rounded-r-md"
                        onMouseDown={(e) => onBarMouseDown(e, atv.id, 'resize-r')}
                      />
                    </div>
                  </div>
                );
              })}
              <svg
                className="absolute top-0 left-0 pointer-events-none z-20"
                style={{ width: totalWidth, height: scenarioAtividades.length * ROW_HEIGHT }}
              >
                <defs>
                  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                  </marker>
                </defs>
                {scenarioAtividades.map((atv, atvIdx) =>
                  (atv.predecessoras ?? []).map((dep) => {
                    const predIdx = scenarioAtividades.findIndex((a) => a.id === dep.id);
                    const pred = scenarioAtividades[predIdx];
                    if (predIdx === -1 || !pred) return null;

                    const predStart = parseDate(pred.data_inicio);
                    const predEnd = parseDate(pred.data_fim);
                    const predLeft = daysBetween(dataInicio, predStart) * DAY_WIDTH;
                    const predWidth = (daysBetween(predStart, predEnd) + 1) * DAY_WIDTH;

                    const curStart = parseDate(atv.data_inicio);
                    const curLeft = daysBetween(dataInicio, curStart) * DAY_WIDTH;

                    const x1 = predLeft + predWidth;
                    const y1 = predIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
                    const x2 = curLeft;
                    const y2 = atvIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

                    const midX = x1 + (x2 - x1) / 2;

                    return (
                      <g key={`${dep.id}-${atv.id}`}>
                        <path
                          d={`M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`}
                          fill="none"
                          stroke="#94a3b8"
                          strokeWidth="1.5"
                          strokeDasharray="4 2"
                          markerEnd="url(#arrowhead)"
                        />
                        {dep.lag > 0 && (
                          <text
                            x={midX}
                            y={Math.min(y1, y2) - 4}
                            textAnchor="middle"
                            className="fill-slate-400 text-[9px]"
                          >
                            +{dep.lag}d
                          </text>
                        )}
                      </g>
                    );
                  })
                )}
              </svg>
              </>
            )}
          </div>
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          atividadeNome={scenarioAtividades.find((a) => a.id === ctxMenu.atvId)?.nome || ''}
          predecessoras={scenarioAtividades.find((a) => a.id === ctxMenu.atvId)?.predecessoras ?? []}
          outrasAtividades={scenarioAtividades.map((a) => ({ id: a.id, nome: a.nome }))}
          onClose={() => setCtxMenu(null)}
          onEdit={() => handleStartEdit(ctxMenu.atvId)}
          onStartSetPredecessora={() => setSelectingFor({ mode: 'predecessora', sourceId: ctxMenu.atvId, lag: 0 })}
          onStartSetSucessora={() => setSelectingFor({ mode: 'sucessora', sourceId: ctxMenu.atvId, lag: 0 })}
          onRemoveDependencia={handleRemoveDependencia}
        />
      )}
    </div>
  );
}

type Column = { date: Date; label: string };

function buildColumns(inicio: Date, fim: Date, gran: Granularidade): Column[] {
  const cols: Column[] = [];
  if (gran === 'dia') {
    for (let d = new Date(inicio); d <= fim; d = addDays(d, 1)) {
      cols.push({ date: new Date(d), label: String(d.getDate()) });
    }
  } else if (gran === 'semana') {
    let d = startOfWeek(inicio);
    while (d <= fim) {
      cols.push({ date: new Date(d), label: formatWeekHeader(d) });
      d = addDays(d, 7);
    }
  } else {
    let d = startOfMonth(inicio);
    while (d <= fim) {
      cols.push({ date: new Date(d), label: formatMonthYear(d) });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
  }
  return cols;
}

function HeaderRow({ columns, granularidade, paradaSet }: { columns: Column[]; granularidade: Granularidade; paradaSet: Set<string> }) {
  if (granularidade === 'dia') {
    const weeks: { label: string; span: number }[] = [];
    columns.forEach((c) => {
      const wk = `${isoWeekYear(c.date)}-S${String(isoWeek(c.date)).padStart(2, '0')}`;
      if (weeks.length > 0 && weeks[weeks.length - 1].label === wk) {
        weeks[weeks.length - 1].span++;
      } else {
        weeks.push({ label: wk, span: 1 });
      }
    });
    return (
      <div className="flex flex-col">
        <div className="flex">
          {weeks.map((w, i) => (
            <div
              key={i}
              className="text-xs text-slate-300 text-center border-r border-slate-700 py-1.5 font-medium"
              style={{ width: w.span * DAY_WIDTH }}
            >
              {w.label}
            </div>
          ))}
        </div>
        <div className="flex border-t border-slate-700">
          {columns.map((c, i) => {
            const iso = toISODate(c.date);
            const isParada = paradaSet.has(iso);
            return (
              <div
                key={i}
                className={`text-xs text-center border-r border-slate-800 py-1 flex items-center justify-center ${
                  isParada ? 'bg-red-950/80 text-red-400 font-bold' : 'text-slate-400'
                }`}
                style={{ width: DAY_WIDTH }}
              >
                {isParada ? <Ban size={10} /> : c.label}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="flex">
      {columns.map((c, i) => (
        <div
          key={i}
          className="text-xs text-slate-300 text-center border-r border-slate-700 py-3 font-medium"
          style={{ width: DAY_WIDTH }}
        >
          {c.label}
        </div>
      ))}
    </div>
  );
}

function GridRow({ columns, paradaSet, onToggleParada }: { columns: Column[]; paradaSet: Set<string>; onToggleParada: (iso: string) => void }) {
  return (
    <div className="flex">
      {columns.map((c, i) => {
        const isWeekend = c.date.getDay() === 0 || c.date.getDay() === 6;
        const iso = toISODate(c.date);
        const isParada = paradaSet.has(iso);
        return (
          <div
            key={i}
            onClick={() => onToggleParada(iso)}
            className={`border-r border-slate-800 cursor-pointer transition-colors ${
              isParada
                ? 'bg-red-950/70 hover:bg-red-900/70'
                : isWeekend
                ? 'bg-slate-800/40 hover:bg-slate-700/40'
                : 'hover:bg-slate-700/30'
            }`}
            style={{ width: DAY_WIDTH, height: ROW_HEIGHT }}
            title={isParada ? 'Dia inativo (parada) — clique para reativar' : 'Clique para marcar como parada'}
          />
        );
      })}
    </div>
  );
}
