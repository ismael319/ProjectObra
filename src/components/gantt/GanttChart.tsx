import { useRef, useState, useEffect, useCallback, type WheelEvent } from 'react';
import { Plus, Trash2, Ban, ChevronDown, ChevronRight, ListPlus, Rows3, ChevronsDown, ChevronsUp } from 'lucide-react';
import { useGanttStore } from '@/lib/gantt/store';
import type { Atividade } from '@/lib/gantt/supabase';
import {
  columnWidthFor,
  parseDate,
  toISODate,
  addDays,
  daysBetween,
  startOfDay,
  startOfWeek,
  startOfMonth,
  isoWeek,
  isoWeekYear,
  formatMonthYear,
  formatDayMonth,
} from '@/lib/gantt/dates';
import type { Granularidade } from '@/lib/gantt/histograma';
import { ContextMenu } from './ContextMenu';
import { ColorPicker } from './ColorPicker';
import { EquipeAssocModal } from './EquipeAssocModal';
import { GANTT_COLORS } from '@/lib/chart-colors';

type Props = {
  granularidade: Granularidade;
  dataInicio: Date;
  dataFim: Date;
  scrollRef: React.RefObject<HTMLDivElement>;
  onScrollSync: (left: number) => void;
  onDateRangeChange: (inicio: Date, fim: Date) => void;
  // Controlado pelo componente pai — o Histograma usa a mesma largura, senão
  // as colunas dos dois painéis desalinham quando o usuário redimensiona.
  labelWidth: number;
  onLabelWidthChange: (w: number) => void;
};

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 64;
// Largura generosa o bastante pra mostrar o nome das atividades sem cortar de
// cara (ex.: "SISTEMA DE AERAÇÃO INTERNO") — antes começava em 176px e quase
// tudo aparecia truncado até o usuário arrastar a borda manualmente.
export const DEFAULT_LABEL_WIDTH = 400;
const MIN_LABEL_WIDTH = 120;
const MAX_LABEL_WIDTH = 520;
// Mesmo template pro cabeçalho e pra cada linha — trava o alinhamento tipo
// tabela de verdade: só a coluna do nome (1fr) varia de largura, as outras
// (%, início, término, ações) ficam sempre no mesmo lugar independente da
// indentação da hierarquia (que agora fica só dentro da célula do nome).
const LABEL_GRID_COLS = '1fr 34px 42px 42px 38px';

const COLORS = GANTT_COLORS;
// Índice bate com Date.getDay(): 0=domingo, 1=segunda, ..., 6=sábado.
const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function GanttChart({ granularidade, dataInicio, dataFim, scrollRef, onScrollSync, onDateRangeChange, labelWidth, onLabelWidthChange }: Props) {
  const { atividades, equipes, activeScenarioId, addAtividade, addAtividadeAcima, moverAtividade, updateAtividade, deleteAtividade, paradas, toggleParada } = useGanttStore();
  const [adding, setAdding] = useState(false);
  // Quando setado, o submit do formulário "Nova atividade" insere na posição
  // dessa atividade (empurrando ela pra baixo) em vez de no fim da lista de
  // irmãos — ver handleStartAddAcima, disparado pelo menu de contexto.
  const [insertAboveId, setInsertAboveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // `cor` anotado como string: GANTT_COLORS é `as const`, então COLORS[0]
  // entraria como o tipo literal '#2F6FE4' e o campo não aceitaria a cor de uma
  // atividade já existente ao abrir a edição.
  const [form, setForm] = useState({ nome: '', equipes: [] as string[], cor: COLORS[0] as string, duracao: 7, dataInicio: '', dataFim: '', parentId: null as string | null, percentualConcluido: 0 });
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; atvId: string } | null>(null);
  const [colorMenu, setColorMenu] = useState<{ x: number; y: number; atvId: string } | null>(null);
  const [selectingFor, setSelectingFor] = useState<{ mode: 'predecessora' | 'sucessora'; sourceId: string; targetId?: string; lag: number } | null>(null);
  const [equipeAssocAtvId, setEquipeAssocAtvId] = useState<string | null>(null);
  const [estruturaMenuOpen, setEstruturaMenuOpen] = useState(false);
  const [paradaMenuOpen, setParadaMenuOpen] = useState(false);
  const [paradaWeekdays, setParadaWeekdays] = useState<Set<number>>(new Set());
  const labelResizeState = useRef<{ startX: number; startWidth: number } | null>(null);
  const labelScrollRef = useRef<HTMLDivElement>(null);
  // Só centraliza uma vez — sem essa trava, toda vez que a coluna de hoje
  // mudasse de índice (ex.: o range de datas se ajusta depois que o
  // cronograma carrega) o scroll voltaria a pular pro meio, brigando com uma
  // rolagem manual que o usuário já tenha feito.
  const jaCentralizouHoje = useRef(false);
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
  const scenarioEquipes = equipes
    .filter((e) => e.scenario_id === activeScenarioId)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const scenarioParadas = paradas.filter((p) => p.scenario_id === activeScenarioId);
  const paradaSet = new Set(scenarioParadas.map((p) => p.data));
  // Achata a árvore (pai/filho via parent_id) em ordem visual — respeitando
  // colapso — pra usar como a lista que efetivamente vira linha na tabela/barras
  // (mantém as duas colunas, rótulo e timeline, alinhadas pelo mesmo índice).
  const visibleAtividades = buildVisibleTree(scenarioAtividades, collapsed);

  const columns = buildColumns(dataInicio, dataFim, granularidade);
  const colWidth = columnWidthFor(granularidade);
  const totalWidth = columns.length * colWidth;
  // Qual coluna contém hoje — dia/semana/mês atual conforme a granularidade —
  // pra destacar no cabeçalho e nas linhas. -1 se hoje estiver fora do range
  // visível (ex.: cronograma todo no passado ou no futuro).
  const todayIdx = findColumnIndex(startOfDay(new Date()), columns, granularidade);

  // Centraliza o scroll horizontal na coluna de hoje assim que ela existir de
  // verdade (só depois que o range de datas termina de se ajustar ao
  // cronograma carregado — antes disso todayIdx pode estar fora do range
  // provisório e o efeito simplesmente não faz nada até recalcular).
  useEffect(() => {
    if (jaCentralizouHoje.current || todayIdx < 0) return;
    const container = scrollRef.current;
    if (!container) return;
    jaCentralizouHoje.current = true;
    const alvo = todayIdx * colWidth + colWidth / 2 - container.clientWidth / 2;
    container.scrollLeft = Math.max(0, alvo);
  }, [todayIdx, colWidth, scrollRef]);

  const handleScroll = useCallback(
    (e: WheelEvent<HTMLDivElement>) => {
      onScrollSync(e.currentTarget.scrollLeft);
      // A coluna de rótulos rola verticalmente por conta própria (senão fica
      // impossível ver atividades além da altura visível) — sincroniza com o
      // scroll do timeline pra rótulo e barra continuarem na mesma linha.
      if (labelScrollRef.current) labelScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    },
    [onScrollSync]
  );

  const handleLabelScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (scrollRef.current) scrollRef.current.scrollTop = e.currentTarget.scrollTop;
  };

  useEffect(() => {
    const findDependentes = (atvId: string, atividades: typeof scenarioAtividades): typeof atividades => {
      return atividades.filter((a) => (a.predecessoras ?? []).some((p) => p.id === atvId));
    };

    const handleMove = (e: MouseEvent) => {
      const d = dragState.current;
      if (!d) return;
      const deltaPx = e.clientX - d.startX;
      // 1 coluna só vale 1 dia em 'dia' — em 'semana'/'mes' cada coluna cobre
      // vários dias, então o arraste precisa avançar mais dias por pixel pra
      // continuar acompanhando o mouse (senão a barra "atrasa" dele).
      const diasPorColuna = granularidade === 'dia' ? 1 : granularidade === 'semana' ? 7 : 30.44;
      const deltaDays = Math.round((deltaPx / columnWidthFor(granularidade)) * diasPorColuna);
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
  }, [updateAtividade, dataInicio, dataFim, onDateRangeChange, granularidade]);

  // Arraste da coluna de nomes (frentes/atividades) — largura fixa cortava
  // nomes longos ("ARMAZÉM GRANELEIRO...", etc.) sem dar jeito de ver inteiro.
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const r = labelResizeState.current;
      if (!r) return;
      const next = Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, r.startWidth + (e.clientX - r.startX)));
      onLabelWidthChange(next);
    };
    const handleUp = () => {
      labelResizeState.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [onLabelWidthChange]);

  const onLabelResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    labelResizeState.current = { startX: e.clientX, startWidth: labelWidth };
  };

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
      setInsertAboveId(null);
      return;
    }
    const start = form.dataInicio ? parseDate(form.dataInicio) : dataInicio;
    const end = form.dataFim ? parseDate(form.dataFim) : addDays(start, (form.duracao || 1) - 1);
    // A cor da equipe manda; sem equipe, mantém a cor já escolhida (manual ou
    // o padrão inicial do form) em vez de sempre resetar pra COLORS[0].
    const equipeCor = scenarioEquipes.find((e) => e.id === form.equipes[0])?.cor || form.cor || COLORS[0];
    const percentual = Math.max(0, Math.min(100, form.percentualConcluido));
    if (insertAboveId) {
      await addAtividadeAcima(insertAboveId, form.nome.trim(), toISODate(start), toISODate(end), form.equipes, equipeCor, percentual);
    } else {
      await addAtividade(form.nome.trim(), toISODate(start), toISODate(end), form.equipes, equipeCor, form.parentId, percentual);
    }
    setForm({ nome: '', equipes: [], cor: COLORS[0], duracao: 7, dataInicio: '', dataFim: '', parentId: null, percentualConcluido: 0 });
    setAdding(false);
    setInsertAboveId(null);
  };

  const handleStartAddSubitem = (parentId: string) => {
    setForm({ nome: '', equipes: [], cor: COLORS[0], duracao: 7, dataInicio: '', dataFim: '', parentId, percentualConcluido: 0 });
    setEditing(null);
    setInsertAboveId(null);
    setAdding(true);
  };

  // Abre o seletor de cor no lugar do menu de contexto (mesma posição x/y) —
  // ver ColorPicker.tsx. A cor só tem efeito visual de fato quando a
  // atividade não tem equipe vinculada (a cor da equipe sempre prevalece).
  const handleStartChangeColor = (atvId: string, x: number, y: number) => {
    setCtxMenu(null);
    setColorMenu({ x, y, atvId });
  };

  // Menu de contexto "Adicionar tarefa acima" — abre o mesmo formulário de
  // Nova atividade, já com o pai certo (o mesmo da atividade clicada), mas
  // marcando pra inserir na posição dela em vez de no fim da lista.
  const handleStartAddAcima = (atvId: string) => {
    const atv = scenarioAtividades.find((a) => a.id === atvId);
    if (!atv) return;
    setForm({ nome: '', equipes: [], cor: COLORS[0], duracao: 7, dataInicio: '', dataFim: '', parentId: atv.parent_id, percentualConcluido: 0 });
    setEditing(null);
    setInsertAboveId(atvId);
    setAdding(true);
  };

  // Expandir/recolher tudo de uma vez, ou até um nível específico (igual ao
  // menu "Estrutura de Tópicos" do MS Project) — sem isso, com muitas
  // subatividades era clique por clique pra abrir/fechar cada uma.
  const handleExpandAll = () => setCollapsed(new Set());

  const handleCollapseAll = () => {
    const parentIds = new Set(scenarioAtividades.filter((a) => a.parent_id).map((a) => a.parent_id as string));
    setCollapsed(new Set(scenarioAtividades.filter((a) => parentIds.has(a.id)).map((a) => a.id)));
  };

  const handleCollapseToLevel = (level: number) => {
    const byParent = new Map<string | null, Atividade[]>();
    for (const a of scenarioAtividades) {
      const key = a.parent_id ?? null;
      const arr = byParent.get(key) ?? [];
      arr.push(a);
      byParent.set(key, arr);
    }
    const next = new Set<string>();
    function walk(parentId: string | null, depth: number) {
      for (const a of byParent.get(parentId) ?? []) {
        const children = byParent.get(a.id) ?? [];
        if (children.length > 0) {
          if (depth >= level - 1) next.add(a.id);
          else walk(a.id, depth + 1);
        }
      }
    }
    walk(null, 0);
    setCollapsed(next);
  };

  const handleToggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      dataFim: atv.data_fim,
      parentId: atv.parent_id,
      percentualConcluido: atv.percentual_concluido,
    });
    setEditing(atvId);
    setAdding(false);
    setInsertAboveId(null);
  };

  const handleSaveEdit = async () => {
    if (!editing || !form.nome.trim()) {
      setEditing(null);
      return;
    }
    const start = form.dataInicio ? parseDate(form.dataInicio) : dataInicio;
    const end = form.dataFim ? parseDate(form.dataFim) : addDays(start, (form.duracao || 1) - 1);
    // A cor da equipe manda; sem equipe, mantém a cor já escolhida (manual ou
    // o padrão inicial do form) em vez de sempre resetar pra COLORS[0].
    const equipeCor = scenarioEquipes.find((e) => e.id === form.equipes[0])?.cor || form.cor || COLORS[0];
    await updateAtividade(editing, {
      nome: form.nome.trim(),
      data_inicio: toISODate(start),
      data_fim: toISODate(end),
      equipes_alocadas: form.equipes,
      cor: equipeCor,
      percentual_concluido: Math.max(0, Math.min(100, form.percentualConcluido)),
    });
    setForm({ nome: '', equipes: [], cor: COLORS[0], duracao: 7, dataInicio: '', dataFim: '', parentId: null, percentualConcluido: 0 });
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

  // Marca/desmarca de uma vez todos os dias de determinado(s) dia(s) da
  // semana (ex.: todo domingo) dentro do período visível — sem isso era
  // clique dia por dia no cabeçalho pra cancelar cada domingo do cronograma.
  const handleBulkParada = async (weekdays: Set<number>, activate: boolean) => {
    if (weekdays.size === 0) return;
    const datas: string[] = [];
    for (let d = new Date(dataInicio); d <= dataFim; d = addDays(d, 1)) {
      if (!weekdays.has(d.getDay())) continue;
      const iso = toISODate(d);
      const jaParada = paradaSet.has(iso);
      if (activate ? !jaParada : jaParada) datas.push(iso);
    }
    if (datas.length === 0) return;

    // Conta quantos dias novos caem no range ORIGINAL de cada atividade antes
    // de mexer em qualquer data — senão o término ir crescendo/encolhendo no
    // meio do loop bagunçaria a contagem dos dias seguintes.
    const deltaPorAtividade = new Map<string, number>();
    for (const atv of scenarioAtividades) {
      const start = parseDate(atv.data_inicio);
      const end = parseDate(atv.data_fim);
      const count = datas.filter((iso) => { const t = parseDate(iso); return t >= start && t <= end; }).length;
      if (count > 0) deltaPorAtividade.set(atv.id, activate ? count : -count);
    }

    for (const iso of datas) await toggleParada(iso);
    for (const [atvId, delta] of deltaPorAtividade) {
      const atv = scenarioAtividades.find((a) => a.id === atvId);
      if (!atv) continue;
      const end = parseDate(atv.data_fim);
      await updateAtividade(atvId, { data_fim: toISODate(addDays(end, delta)) });
    }
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

  // Se a dependente já começa antes do fim da predecessora (+ latência), joga
  // a dependente pra frente na hora de criar o vínculo (preservando a duração
  // dela) — sem isso, o vínculo era gravado mas a barra só "obedecia" de
  // verdade depois de alguém arrastar a predecessora manualmente.
  const applyPredecessorConstraint = async (predId: string, depId: string, lag: number) => {
    const pred = scenarioAtividades.find((a) => a.id === predId);
    const dep = scenarioAtividades.find((a) => a.id === depId);
    if (!pred || !dep) return;
    const requiredStart = addDays(parseDate(pred.data_fim), 1 + lag);
    const depStart = parseDate(dep.data_inicio);
    if (requiredStart > depStart) {
      const duration = daysBetween(depStart, parseDate(dep.data_fim));
      await updateAtividade(depId, {
        data_inicio: toISODate(requiredStart),
        data_fim: toISODate(addDays(requiredStart, duration)),
      });
    }
  };

  const handleConfirmLag = async () => {
    if (!selectingFor || !selectingFor.targetId) return;
    const lag = selectingFor.lag;
    if (selectingFor.mode === 'predecessora') {
      const target = scenarioAtividades.find((a) => a.id === selectingFor.targetId);
      if (!target) return;
      const newPreds = [...(target.predecessoras ?? []), { id: selectingFor.sourceId, lag }];
      await updateAtividade(selectingFor.targetId, { predecessoras: newPreds });
      await applyPredecessorConstraint(selectingFor.sourceId, selectingFor.targetId, lag);
    } else {
      const current = scenarioAtividades.find((a) => a.id === selectingFor.sourceId);
      if (!current) return;
      const newPreds = [...(current.predecessoras ?? []), { id: selectingFor.targetId, lag }];
      await updateAtividade(selectingFor.sourceId, { predecessoras: newPreds });
      await applyPredecessorConstraint(selectingFor.targetId, selectingFor.sourceId, lag);
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
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {(adding || editing) && (
        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 flex-wrap">
          {form.parentId && (
            <span className="text-[11px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md shrink-0">
              Sub-item de: {scenarioAtividades.find((a) => a.id === form.parentId)?.nome ?? '—'}
            </span>
          )}
          {insertAboveId && (
            <span className="text-[11px] text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 px-2 py-1 rounded-md shrink-0">
              Inserindo acima de: {scenarioAtividades.find((a) => a.id === insertAboveId)?.nome ?? '—'}
            </span>
          )}
          <input
            autoFocus
            placeholder="Nome da atividade"
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && (editing ? handleSaveEdit() : handleAddAtividade())}
            className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500 w-52"
          />
          <div className="flex flex-col">
            <label className="text-[11px] text-gray-500 dark:text-slate-500 mb-0.5">Início</label>
            <input
              type="date"
              value={form.dataInicio || toISODate(dataInicio)}
              onChange={(e) => {
                const novoInicio = e.target.value;
                const start = parseDate(novoInicio);
                const end = addDays(start, (form.duracao || 1) - 1);
                setForm({ ...form, dataInicio: novoInicio, dataFim: toISODate(end) });
              }}
              className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-xs px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-gray-500 dark:text-slate-500 mb-0.5">Duração (dias)</label>
            <input
              type="number"
              min="1"
              value={form.duracao}
              onChange={(e) => {
                const duracao = parseInt(e.target.value) || 1;
                const start = form.dataInicio ? parseDate(form.dataInicio) : dataInicio;
                const end = addDays(start, duracao - 1);
                setForm({ ...form, duracao, dataFim: toISODate(end) });
              }}
              className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-xs px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500 w-24"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-gray-500 dark:text-slate-500 mb-0.5">Término</label>
            <input
              type="date"
              value={form.dataFim || toISODate(addDays(form.dataInicio ? parseDate(form.dataInicio) : dataInicio, (form.duracao || 1) - 1))}
              onChange={(e) => {
                const novoFim = e.target.value;
                const start = form.dataInicio ? parseDate(form.dataInicio) : dataInicio;
                const end = parseDate(novoFim);
                const duracao = Math.max(1, daysBetween(start, end) + 1);
                setForm({ ...form, dataFim: novoFim, duracao });
              }}
              className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-xs px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-gray-500 dark:text-slate-500 mb-0.5">Equipe</label>
            <select
              value={form.equipes[0] || ''}
              onChange={(e) => setForm({ ...form, equipes: e.target.value ? [e.target.value] : [] })}
              className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-xs px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500"
            >
              <option value="">Selecione...</option>
              {scenarioEquipes.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-[11px] text-gray-500 dark:text-slate-500 mb-0.5">% concluído</label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.percentualConcluido}
              onChange={(e) => setForm({ ...form, percentualConcluido: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
              className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-xs px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500 w-20"
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={editing ? handleSaveEdit : handleAddAtividade}
              disabled={!form.nome.trim()}
              className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {editing ? 'Salvar' : 'Adicionar'}
            </button>
            <button onClick={() => { setAdding(false); setEditing(null); setInsertAboveId(null); }} className="bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-white text-xs px-4 py-2 rounded-lg transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wide">Gantt Livre</h3>
          <div className="relative">
            <button
              onClick={() => setEstruturaMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-md transition-colors"
            >
              <Rows3 size={14} /> Estrutura
            </button>
            {estruturaMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setEstruturaMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 w-44 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
                  <button
                    onClick={() => { handleExpandAll(); setEstruturaMenuOpen(false); }}
                    className="w-full flex items-center gap-2 text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 px-3 py-2 text-left"
                  >
                    <ChevronsDown size={14} /> Expandir tudo
                  </button>
                  <button
                    onClick={() => { handleCollapseAll(); setEstruturaMenuOpen(false); }}
                    className="w-full flex items-center gap-2 text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 px-3 py-2 text-left"
                  >
                    <ChevronsUp size={14} /> Recolher tudo
                  </button>
                  <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      onClick={() => { handleCollapseToLevel(n); setEstruturaMenuOpen(false); }}
                      className="w-full flex items-center gap-2 text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 px-3 py-2 text-left"
                    >
                      Nível {n}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => setParadaMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 px-2.5 py-1.5 rounded-md transition-colors"
            >
              <Ban size={14} /> Paradas
            </button>
            {paradaMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setParadaMenuOpen(false)} />
                <div className="absolute left-0 top-full mt-1 z-20 w-56 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg p-3">
                  <p className="text-[11px] font-semibold text-gray-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
                    Marcar dia(s) da semana como parada
                  </p>
                  <div className="space-y-1 mb-3">
                    {WEEKDAY_LABELS.map((label, idx) => (
                      <label key={idx} className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paradaWeekdays.has(idx)}
                          onChange={() => {
                            setParadaWeekdays((prev) => {
                              const next = new Set(prev);
                              if (next.has(idx)) next.delete(idx);
                              else next.add(idx);
                              return next;
                            });
                          }}
                          className="w-3.5 h-3.5"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mb-2">Aplica no período visível no momento.</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBulkParada(paradaWeekdays, true)}
                      disabled={paradaWeekdays.size === 0}
                      className="flex-1 text-[11px] font-medium bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-md transition-colors"
                    >
                      Marcar parada
                    </button>
                    <button
                      onClick={() => handleBulkParada(paradaWeekdays, false)}
                      disabled={paradaWeekdays.size === 0}
                      className="flex-1 text-[11px] font-medium bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-white px-3 py-1.5 rounded-md transition-colors"
                    >
                      Desmarcar
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-md"
        >
          <Plus size={14} /> Nova Atividade
        </button>
      </div>

      {selectingFor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/60 border-b border-blue-200 dark:border-blue-700">
          {!selectingFor.targetId ? (
            <span className="text-[11px] text-blue-700 dark:text-blue-200">
              {selectingFor.mode === 'predecessora'
                ? `Clique na barra que será PRECESSORA de "${scenarioAtividades.find((a) => a.id === selectingFor.sourceId)?.nome}"`
                : `Clique na barra que será SUCESSORA de "${scenarioAtividades.find((a) => a.id === selectingFor.sourceId)?.nome}"`}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-blue-700 dark:text-blue-200">Latência (dias):</span>
              <input
                type="number"
                value={selectingFor.lag}
                onChange={(e) => setSelectingFor({ ...selectingFor, lag: parseInt(e.target.value) || 0 })}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmLag()}
                className="w-16 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-[11px] px-2 py-1 rounded border border-blue-400 dark:border-blue-500 outline-none focus:border-blue-500 dark:focus:border-blue-400"
                autoFocus
              />
              <button onClick={handleConfirmLag} className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded">OK</button>
              <button onClick={() => setSelectingFor(null)} className="text-[11px] bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-white px-3 py-1 rounded">Cancelar</button>
            </div>
          )}
          <span className="text-[11px] text-blue-600 dark:text-blue-400 ml-auto">ESC para cancelar</span>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div
          ref={labelScrollRef}
          onScroll={handleLabelScroll}
          className="shrink-0 bg-white dark:bg-slate-900 overflow-y-auto overflow-x-hidden"
          style={{ width: labelWidth }}
        >
          <div
            className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-1"
            style={{ height: HEADER_HEIGHT, display: 'grid', gridTemplateColumns: LABEL_GRID_COLS, alignItems: 'center', columnGap: 4 }}
          >
            <span className="min-w-0 pl-4 text-[10px] font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide truncate">
              Atividade
            </span>
            <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 text-right">%</span>
            <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 text-right">Início</span>
            <span className="text-[10px] font-semibold text-gray-500 dark:text-slate-400 text-right">Térm.</span>
            <span />
          </div>
          {visibleAtividades.map(({ atv, depth, hasChildren }) => {
            const equipesNomes = atv.equipes_alocadas
              .map((eqId) => scenarioEquipes.find((e) => e.id === eqId)?.nome)
              .filter(Boolean)
              .join(', ');
            return (
              <div
                key={atv.id}
                onContextMenu={(e) => onBarContextMenu(e, atv.id)}
                onDoubleClick={() => handleStartEdit(atv.id)}
                className="group border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/30 px-1"
                style={{ height: ROW_HEIGHT, display: 'grid', gridTemplateColumns: LABEL_GRID_COLS, alignItems: 'center', columnGap: 4 }}
              >
                <div className="flex items-center min-w-0" style={{ paddingLeft: 4 + depth * 14 }}>
                  <button
                    onClick={() => hasChildren && handleToggleCollapse(atv.id)}
                    className="w-4 shrink-0 flex items-center justify-center text-gray-400 dark:text-slate-500 p-0.5"
                  >
                    {hasChildren ? (
                      collapsed.has(atv.id) ? <ChevronRight size={12} /> : <ChevronDown size={12} />
                    ) : (
                      <span className="inline-block w-3" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs truncate ${hasChildren ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-slate-200'}`}>
                      {atv.nome}
                    </p>
                    {equipesNomes && <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">{equipesNomes}</p>}
                  </div>
                </div>
                <span
                  className={`text-[9px] font-semibold tabular-nums text-right ${
                    atv.percentual_concluido >= 100
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : atv.percentual_concluido > 0
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-gray-300 dark:text-slate-600'
                  }`}
                  title="% de trabalho concluído"
                >
                  {atv.percentual_concluido}%
                </span>
                <span
                  className="text-[9px] text-gray-400 dark:text-slate-500 tabular-nums text-right whitespace-nowrap"
                  title="Data de início"
                >
                  {formatDayMonth(parseDate(atv.data_inicio))}
                </span>
                <span
                  className="text-[9px] text-gray-400 dark:text-slate-500 tabular-nums text-right whitespace-nowrap"
                  title="Data de término"
                >
                  {formatDayMonth(parseDate(atv.data_fim))}
                </span>
                <div className="opacity-0 group-hover:opacity-100 flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleStartAddSubitem(atv.id)}
                    className="text-gray-400 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400"
                    title="Adicionar sub-item"
                  >
                    <ListPlus size={12} />
                  </button>
                  <button
                    onClick={() => deleteAtividade(atv.id)}
                    className="text-gray-400 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                    title="Excluir"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div
          onMouseDown={onLabelResizeMouseDown}
          className="w-1.5 shrink-0 cursor-col-resize bg-gray-200 dark:bg-slate-700 hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors"
          title="Arraste para redimensionar"
        />

        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-auto">
          <div style={{ width: totalWidth, position: 'relative' }}>
            <div className="sticky top-0 z-20 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-600" style={{ height: HEADER_HEIGHT }}>
              <HeaderRow columns={columns} granularidade={granularidade} paradaSet={paradaSet} onToggleParada={handleToggleParada} colWidth={colWidth} todayIdx={todayIdx} />
            </div>

            {visibleAtividades.length === 0 ? (
              <div className="flex items-center justify-center" style={{ height: 200 }}>
                <p className="text-gray-400 dark:text-slate-500 text-xs">Nenhuma atividade. Clique em "+ Nova Atividade".</p>
              </div>
            ) : (
              <>
               {visibleAtividades.map(({ atv }) => {
                const start = parseDate(atv.data_inicio);
                const end = parseDate(atv.data_fim);
                const duration = daysBetween(start, end) + 1;
                const left = dateToX(start, columns, granularidade, colWidth);
                const width = dateToX(addDays(end, 1), columns, granularidade, colWidth) - left;
                const equipeCor = scenarioEquipes.find((e) => e.id === atv.equipes_alocadas[0])?.cor || atv.cor;

                return (
                  <div key={atv.id} className="relative flex" style={{ height: ROW_HEIGHT }}>
                    <GridRow columns={columns} paradaSet={paradaSet} onToggleParada={handleToggleParada} colWidth={colWidth} todayIdx={todayIdx} />
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
                      <span className="text-[11px] text-white font-medium truncate px-1">
                        {atv.nome} ({duration}d) {atv.percentual_concluido > 0 ? `· ${atv.percentual_concluido}%` : ''}
                      </span>
                      <div className="absolute left-1.5 right-1.5 bottom-1 h-1 bg-black/20 dark:bg-white/20 rounded-full pointer-events-none overflow-hidden">
                        <div
                          className="h-full bg-white/90 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(0, atv.percentual_concluido))}%` }}
                        />
                      </div>
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
                style={{ width: totalWidth, height: visibleAtividades.length * ROW_HEIGHT }}
              >
                <defs>
                  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                    <polygon points="0 0, 8 3, 0 6" fill="#94a3b8" />
                  </marker>
                </defs>
                {visibleAtividades.map(({ atv }, atvIdx) =>
                  (atv.predecessoras ?? []).map((dep) => {
                    const predIdx = visibleAtividades.findIndex((v) => v.atv.id === dep.id);
                    const pred = visibleAtividades[predIdx]?.atv;
                    if (predIdx === -1 || !pred) return null;

                    const predStart = parseDate(pred.data_inicio);
                    const predEnd = parseDate(pred.data_fim);
                    const predLeft = dateToX(predStart, columns, granularidade, colWidth);
                    const predWidth = dateToX(addDays(predEnd, 1), columns, granularidade, colWidth) - predLeft;

                    const curStart = parseDate(atv.data_inicio);
                    const curLeft = dateToX(curStart, columns, granularidade, colWidth);

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
                            className="fill-gray-500 dark:fill-slate-400 text-[9px]"
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

      {ctxMenu && (() => {
        const atvCtx = scenarioAtividades.find((a) => a.id === ctxMenu.atvId);
        // Irmãos (mesmo pai) em ordem — pra saber se dá pra mover pra
        // cima/baixo (primeiro/último da lista não tem vizinho naquele lado).
        const irmaosCtx = atvCtx
          ? scenarioAtividades
              .filter((a) => (a.parent_id ?? null) === (atvCtx.parent_id ?? null))
              .sort((a, b) => a.ordem - b.ordem)
          : [];
        const idxCtx = atvCtx ? irmaosCtx.findIndex((a) => a.id === atvCtx.id) : -1;
        return (
          <ContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            atividadeNome={atvCtx?.nome || ''}
            predecessoras={atvCtx?.predecessoras ?? []}
            outrasAtividades={scenarioAtividades.map((a) => ({ id: a.id, nome: a.nome }))}
            podeSubir={idxCtx > 0}
            podeDescer={idxCtx >= 0 && idxCtx < irmaosCtx.length - 1}
            onClose={() => setCtxMenu(null)}
            onEdit={() => handleStartEdit(ctxMenu.atvId)}
            onManageEquipes={() => setEquipeAssocAtvId(ctxMenu.atvId)}
            onChangeColor={() => handleStartChangeColor(ctxMenu.atvId, ctxMenu.x, ctxMenu.y)}
            onAddAcima={() => handleStartAddAcima(ctxMenu.atvId)}
            onMoverCima={() => moverAtividade(ctxMenu.atvId, 'cima')}
            onMoverBaixo={() => moverAtividade(ctxMenu.atvId, 'baixo')}
            onStartSetPredecessora={() => setSelectingFor({ mode: 'predecessora', sourceId: ctxMenu.atvId, lag: 0 })}
            onStartSetSucessora={() => setSelectingFor({ mode: 'sucessora', sourceId: ctxMenu.atvId, lag: 0 })}
            onRemoveDependencia={handleRemoveDependencia}
          />
        );
      })()}

      {colorMenu && (
        <ColorPicker
          x={colorMenu.x}
          y={colorMenu.y}
          corAtual={scenarioAtividades.find((a) => a.id === colorMenu.atvId)?.cor ?? COLORS[0]}
          onClose={() => setColorMenu(null)}
          onSelect={(cor) => updateAtividade(colorMenu.atvId, { cor })}
        />
      )}

      <EquipeAssocModal
        atividade={scenarioAtividades.find((a) => a.id === equipeAssocAtvId) ?? null}
        onClose={() => setEquipeAssocAtvId(null)}
      />
    </div>
  );
}

// Achata a árvore (parent_id) em ordem visual pai->filhos, respeitando o
// colapso — essa é a lista que efetivamente vira linha na tabela/timeline, pra
// manter as duas colunas alinhadas pelo mesmo índice.
function buildVisibleTree(
  list: Atividade[],
  collapsed: Set<string>,
): { atv: Atividade; depth: number; hasChildren: boolean }[] {
  const byParent = new Map<string | null, Atividade[]>();
  for (const a of list) {
    const key = a.parent_id ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(a);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((x, y) => x.ordem - y.ordem);

  const result: { atv: Atividade; depth: number; hasChildren: boolean }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const a of byParent.get(parentId) ?? []) {
      const children = byParent.get(a.id) ?? [];
      result.push({ atv: a, depth, hasChildren: children.length > 0 });
      if (children.length > 0 && !collapsed.has(a.id)) walk(a.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

// Em 'semana', o cabeçalho vem em duas camadas (label = ano-semana, sublabel
// = período) — uma linha só ficava espremida demais pro que cabe numa coluna.
type Column = { date: Date; label: string; sublabel?: string };

function buildColumns(inicio: Date, fim: Date, gran: Granularidade): Column[] {
  const cols: Column[] = [];
  if (gran === 'dia') {
    for (let d = new Date(inicio); d <= fim; d = addDays(d, 1)) {
      cols.push({ date: new Date(d), label: String(d.getDate()) });
    }
  } else if (gran === 'semana') {
    let d = startOfWeek(inicio);
    while (d <= fim) {
      const we = addDays(d, 6);
      cols.push({
        date: new Date(d),
        label: `${isoWeekYear(d)}-S${String(isoWeek(d)).padStart(2, '0')}`,
        sublabel: `${formatDayMonth(d)}-${formatDayMonth(we)}`,
      });
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

// Quantos dias uma coluna cobre — em 'dia' é sempre 1, em 'semana' é sempre 7,
// mas em 'mes' varia (28-31) conforme o mês daquela coluna especificamente.
function columnSpanDays(columns: Column[], idx: number, gran: Granularidade): number {
  if (idx + 1 < columns.length) return daysBetween(columns[idx].date, columns[idx + 1].date);
  if (gran === 'mes') {
    const d = columns[idx].date;
    return daysBetween(d, new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
  return gran === 'semana' ? 7 : 1;
}

// Índice da coluna que contém a data — usado tanto pra posicionar barras
// (dateToX) quanto pra destacar a coluna de "hoje" no cabeçalho/linhas.
// -1 se a data cair fora do range de colunas (ex.: hoje fora do período
// visível do cronograma).
function findColumnIndex(date: Date, columns: Column[], gran: Granularidade): number {
  for (let i = 0; i < columns.length; i++) {
    const span = columnSpanDays(columns, i, gran);
    const spanEnd = addDays(columns[i].date, span);
    if (date >= columns[i].date && date < spanEnd) return i;
  }
  return -1;
}

// Converte uma data em posição X (px) alinhada às colunas do cabeçalho —
// crucial pra granularidade 'semana'/'mes', onde 1 coluna = colWidth px mas
// cobre vários dias, então "dias desde o início * colWidth" (que só vale
// pra 'dia') colocava as barras muito mais à direita do que o cabeçalho.
function dateToX(date: Date, columns: Column[], gran: Granularidade, colWidth: number): number {
  if (columns.length === 0) return 0;
  let idx = findColumnIndex(date, columns, gran);
  if (idx === -1) idx = date < columns[0].date ? 0 : columns.length - 1;
  const span = columnSpanDays(columns, idx, gran);
  const fracDays = daysBetween(columns[idx].date, date);
  return idx * colWidth + (span > 0 ? fracDays / span : 0) * colWidth;
}

function HeaderRow({
  columns,
  granularidade,
  paradaSet,
  onToggleParada,
  colWidth,
  todayIdx,
}: {
  columns: Column[];
  granularidade: Granularidade;
  paradaSet: Set<string>;
  onToggleParada: (iso: string) => void;
  colWidth: number;
  todayIdx: number;
}) {
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
              className="text-[11px] text-gray-500 dark:text-slate-300 text-center border-r border-gray-200 dark:border-slate-700 py-1.5 font-medium"
              style={{ width: w.span * colWidth }}
            >
              {w.label}
            </div>
          ))}
        </div>
        <div className="flex border-t border-gray-200 dark:border-slate-700">
          {columns.map((c, i) => {
            const iso = toISODate(c.date);
            const isParada = paradaSet.has(iso);
            const isToday = i === todayIdx;
            return (
              <div
                key={i}
                onClick={() => onToggleParada(iso)}
                className={`text-[11px] text-center border-r border-gray-100 dark:border-slate-800 py-1 flex items-center justify-center cursor-pointer transition-colors ${
                  isParada
                    ? 'bg-red-100 hover:bg-red-200 dark:bg-red-950/80 dark:hover:bg-red-900/70 text-red-600 dark:text-red-400 font-bold'
                    : isToday
                    ? 'bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/60 dark:hover:bg-blue-800/70 text-blue-700 dark:text-blue-300 font-bold ring-1 ring-inset ring-blue-400 dark:ring-blue-500'
                    : 'text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
                style={{ width: colWidth }}
                title={isParada ? 'Dia inativo (parada) — clique para reativar' : isToday ? 'Hoje' : 'Clique para marcar como parada'}
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
    <div className="flex h-full">
      {columns.map((c, i) => {
        const isToday = i === todayIdx;
        return (
          <div
            key={i}
            className={`text-[11px] text-center border-r border-gray-200 dark:border-slate-700 font-medium flex flex-col items-center justify-center gap-0.5 px-1 ${
              isToday
                ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-400 dark:ring-blue-500'
                : 'text-gray-500 dark:text-slate-300'
            }`}
            style={{ width: colWidth }}
            title={isToday ? 'Período atual' : undefined}
          >
            <span className="truncate w-full">{c.label}</span>
            {c.sublabel && <span className={`text-[9px] font-normal whitespace-nowrap ${isToday ? 'text-blue-500 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}>{c.sublabel}</span>}
          </div>
        );
      })}
    </div>
  );
}

function GridRow({
  columns,
  paradaSet,
  onToggleParada,
  colWidth,
  todayIdx,
}: {
  columns: Column[];
  paradaSet: Set<string>;
  onToggleParada: (iso: string) => void;
  colWidth: number;
  todayIdx: number;
}) {
  return (
    <div className="flex">
      {columns.map((c, i) => {
        const isWeekend = c.date.getDay() === 0 || c.date.getDay() === 6;
        const iso = toISODate(c.date);
        const isParada = paradaSet.has(iso);
        const isToday = i === todayIdx;
        return (
          <div
            key={i}
            onClick={() => onToggleParada(iso)}
            className={`border-r border-gray-100 dark:border-slate-800 cursor-pointer transition-colors ${
              isParada
                ? 'bg-red-100 hover:bg-red-200 dark:bg-red-950/70 dark:hover:bg-red-900/70'
                : isToday
                ? 'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-800/40'
                : isWeekend
                ? 'bg-gray-50 hover:bg-gray-100 dark:bg-slate-800/40 dark:hover:bg-slate-700/40'
                : 'hover:bg-gray-50 dark:hover:bg-slate-700/30'
            }`}
            style={{ width: colWidth, height: ROW_HEIGHT }}
            title={isParada ? 'Dia inativo (parada) — clique para reativar' : 'Clique para marcar como parada'}
          />
        );
      })}
    </div>
  );
}
