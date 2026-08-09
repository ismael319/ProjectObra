import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Loader2, PanelLeftOpen, Presentation, X } from 'lucide-react';
import { toast } from 'sonner';
import { useGanttStore } from '@/lib/gantt/store';
import { usePresentationMode } from '@/lib/presentation-mode';
import { ScenarioTabs } from '@/components/gantt/ScenarioTabs';
import { Toolbar } from '@/components/gantt/Toolbar';
import { EquipesSidebar } from '@/components/gantt/EquipesSidebar';
import { GanttChart as GanttLivro, DEFAULT_LABEL_WIDTH } from '@/components/gantt/GanttChart';
import { Histograma } from '@/components/gantt/Histograma';
import ModalImportarCronograma from '@/components/gantt/ModalImportarCronograma';
import { parseDate, addDays, startOfWeek, toISODate } from '@/lib/gantt/dates';
import type { Granularidade } from '@/lib/gantt/histograma';
import type { Atividade } from '@/lib/gantt/supabase';

// Achata a árvore (parent_id) em ordem pai->filhos, igual à ordem visual do
// Gantt — sem isso a exportação saía na ordem crua do banco, misturando
// projeto, sub-item e item-irmão sem relação nenhuma entre linhas vizinhas.
function flattenTree(list: Atividade[]): { atv: Atividade; depth: number }[] {
  const byParent = new Map<string | null, Atividade[]>();
  for (const a of list) {
    const key = a.parent_id ?? null;
    const arr = byParent.get(key) ?? [];
    arr.push(a);
    byParent.set(key, arr);
  }
  for (const arr of byParent.values()) arr.sort((x, y) => x.ordem - y.ordem);

  const result: { atv: Atividade; depth: number }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const a of byParent.get(parentId) ?? []) {
      result.push({ atv: a, depth });
      walk(a.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

function excelToISODate(v: unknown, XLSX: typeof import('xlsx')): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return toISODate(v);
  if (typeof v === 'number') {
    const parsed = XLSX.SSF.parse_date_code(v);
    return parsed ? `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}` : null;
  }
  return String(v).trim().slice(0, 10) || null;
}

export default function GanttChartPage() {
  const { loading, error, loadAll, atividades, equipes, activeScenarioId, updateAtividade } = useGanttStore();
  const [granularidade, setGranularidade] = useState<Granularidade>('semana');
  const [showImportModal, setShowImportModal] = useState(false);
  const [equipesOpen, setEquipesOpen] = useState(() => window.innerWidth >= 1024);
  const [labelWidth, setLabelWidth] = useState(() => (
    window.innerWidth < 640
      ? Math.min(220, Math.max(176, window.innerWidth * 0.56))
      : Math.min(DEFAULT_LABEL_WIDTH, Math.max(200, window.innerWidth - 160))
  ));
  const { presentationMode, setPresentationMode } = usePresentationMode();
  const ganttScrollRef = useRef<HTMLDivElement>(null);
  const histogramaScrollRef = useRef<HTMLDivElement>(null);
  // Trava contra eco: quando um painel escreve o scrollLeft do outro via ref,
  // isso dispara o evento nativo "scroll" do painel escrito, que chamaria essa
  // mesma sincronização de volta — sem essa trava os dois painéis ficavam
  // "conversando" entre si por vários frames depois do usuário já ter parado
  // de rolar (o scroll continuava se movendo sozinho).
  const syncGuardRef = useRef<'gantt' | 'histograma' | null>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);

  // Modo apresentação = tela cheia de verdade (igual F11/F10), não só
  // esconder a barra lateral — precisa vir de um clique direto do usuário
  // (a Fullscreen API recusa chamar fora de um gesto do usuário).
  const handleTogglePresentation = () => {
    if (!presentationMode) {
      setPresentationMode(true);
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      setPresentationMode(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
  };

  // Se o usuário sair da tela cheia pelo ESC (não pelo nosso botão), sincroniza
  // o estado de volta — senão a barra lateral continuaria escondida mesmo com
  // o navegador já fora do modo tela cheia.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setPresentationMode(false);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [setPresentationMode]);

  // Sai do modo apresentação automaticamente ao deixar a página — sem isso a
  // barra lateral do app ficaria escondida (e a tela cheia ativa) em
  // qualquer outra tela depois.
  useEffect(() => {
    return () => {
      setPresentationMode(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [setPresentationMode]);

  const scenarioAtividades = useMemo(
    () => atividades.filter((a) => a.scenario_id === activeScenarioId),
    [atividades, activeScenarioId]
  );
  const prevRangeRef = useRef<{ min: string; max: string } | null>(null);

  const [dataInicio, setDataInicio] = useState<Date>(() => startOfWeek(new Date(2026, 5, 22)));
  const [dataFim, setDataFim] = useState<Date>(() => addDays(startOfWeek(new Date(2026, 5, 22)), 42));

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const compactar = (mobile: boolean) => {
      if (mobile) {
        setEquipesOpen(false);
        setLabelWidth((atual) => Math.min(atual, Math.max(176, window.innerWidth * 0.56)));
      } else {
        setLabelWidth((atual) => Math.max(atual, Math.min(DEFAULT_LABEL_WIDTH, Math.max(200, window.innerWidth - 160))));
      }
    };
    const handleChange = (event: MediaQueryListEvent) => compactar(event.matches);
    compactar(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (scenarioAtividades.length === 0) return;
    let minD = scenarioAtividades[0].data_inicio;
    let maxD = scenarioAtividades[0].data_fim;
    scenarioAtividades.forEach((a) => {
      if (a.data_inicio < minD) minD = a.data_inicio;
      if (a.data_fim > maxD) maxD = a.data_fim;
    });
    if (prevRangeRef.current?.min === minD && prevRangeRef.current?.max === maxD) return;
    prevRangeRef.current = { min: minD, max: maxD };
    const paddedStart = addDays(startOfWeek(parseDate(minD)), -7);
    const paddedEnd = addDays(startOfWeek(parseDate(maxD)), 14);
    setDataInicio(paddedStart);
    setDataFim(paddedEnd);
  }, [scenarioAtividades]);

  // Sincronização direta via DOM (ref.current.scrollLeft), não via estado do
  // React — ir por setState+render+effect adiciona um atraso perceptível
  // durante uma rolagem rápida (roda do mouse/trackpad dispara muitos eventos
  // de scroll por segundo). Escrever direto no elemento é síncrono e some o
  // atraso entre os dois painéis.
  const onGanttScroll = useCallback((left: number) => {
    if (syncGuardRef.current === 'gantt') {
      syncGuardRef.current = null;
      return;
    }
    const el = histogramaScrollRef.current;
    if (el && el.scrollLeft !== left) {
      syncGuardRef.current = 'histograma';
      el.scrollLeft = left;
    }
  }, []);

  const onHistogramaScroll = useCallback((left: number) => {
    if (syncGuardRef.current === 'histograma') {
      syncGuardRef.current = null;
      return;
    }
    const el = ganttScrollRef.current;
    if (el && el.scrollLeft !== left) {
      syncGuardRef.current = 'gantt';
      el.scrollLeft = left;
    }
  }, []);

  const onDateRangeChange = useCallback((inicio: Date, fim: Date) => {
    setDataInicio((prev) => (inicio < prev ? inicio : prev));
    setDataFim((prev) => (fim > prev ? fim : prev));
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = async () => {
    const XLSX = await import('xlsx');
    const scenarioEquipes = equipes.filter((e) => e.scenario_id === activeScenarioId);
    const rows = flattenTree(scenarioAtividades).map(({ atv: a, depth }) => ({
      ID: a.id,
      // Indentação por profundidade — sem isso um projeto e seus sub-itens
      // ficavam visualmente idênticos, uma linha atrás da outra sem hierarquia.
      Atividade: '    '.repeat(depth) + a.nome,
      'Data Início': parseDate(a.data_inicio),
      'Data Fim': parseDate(a.data_fim),
      '% Concluído': a.percentual_concluido,
      Equipes: a.equipes_alocadas
        .map((eqId) => scenarioEquipes.find((e) => e.id === eqId)?.nome)
        .filter(Boolean)
        .join('; '),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 16 }, { wch: 50 }, { wch: 13 }, { wch: 13 }, { wch: 12 }, { wch: 30 }];
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    const dateFmt = 'dd/mm/yyyy';
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      for (const col of ['C', 'D']) {
        const cell = ws[`${col}${r + 1}`];
        if (cell) cell.z = dateFmt;
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gantt Livre');
    XLSX.writeFile(wb, 'gantt-livre.xlsx');
    toast.success('Excel exportado com sucesso');
  };

  // Reimporta a planilha exportada (depois de ajustes) — casa cada linha pela
  // coluna ID com a atividade já existente e atualiza só os campos presentes.
  // Não cria atividade nova: linhas com ID vazio/desconhecido são ignoradas.
  const handleImportExcel = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const scenarioEquipes = equipes.filter((e) => e.scenario_id === activeScenarioId);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number | Date | null>>(ws, { defval: null });

      let atualizadas = 0;
      let ignoradas = 0;
      for (const row of rows) {
        const id = String(row.ID ?? '').trim();
        const atv = scenarioAtividades.find((a) => a.id === id);
        if (!id || !atv) { ignoradas++; continue; }

        const patch: Partial<Atividade> = {};
        // trim: a exportação prefixa espaços pra indentar a hierarquia visualmente.
        if (row.Atividade != null) patch.nome = String(row.Atividade).trim();
        const novoInicio = excelToISODate(row['Data Início'], XLSX);
        if (novoInicio) patch.data_inicio = novoInicio;
        const novoFim = excelToISODate(row['Data Fim'], XLSX);
        if (novoFim) patch.data_fim = novoFim;
        if (row['% Concluído'] != null) {
          patch.percentual_concluido = Math.max(0, Math.min(100, Number(row['% Concluído']) || 0));
        }
        if (row.Equipes != null) {
          const nomes = String(row.Equipes).split(';').map((s) => s.trim()).filter(Boolean);
          patch.equipes_alocadas = nomes
            .map((n) => scenarioEquipes.find((e) => e.nome.toLowerCase() === n.toLowerCase())?.id)
            .filter((v): v is string => !!v);
        }
        await updateAtividade(id, patch);
        atualizadas++;
      }
      toast.success(`Excel importado: ${atualizadas} atividade(s) atualizada(s)${ignoradas > 0 ? `, ${ignoradas} linha(s) ignorada(s) (ID não encontrado)` : ''}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao importar Excel';
      toast.error(msg);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16 text-red-500">
        Erro: {error}
      </div>
    );
  }

  return (
    // As margens cancelam o padding responsivo do DashboardLayout — p-4 no
    // celular e p-6 a partir de sm — sem criar overflow lateral.
    // Livre é uma tela densa de planejamento, então usa a viewport inteira
    // (menos o header fixo de 64px) em vez de sobrar moldura vazia ao redor.
    <div className="-m-4 h-[calc(100dvh-4rem)] sm:-m-6">
      <div className="bg-white dark:bg-slate-900 h-full overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="relative">
            <ScenarioTabs />
            <button
              onClick={handleTogglePresentation}
              title={presentationMode ? 'Sair do modo apresentação' : 'Modo apresentação (esconde a barra lateral do app)'}
              className={`absolute right-2 top-1 z-10 flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs transition-colors sm:top-2 sm:min-h-0 sm:min-w-0 sm:py-1.5 ${
                presentationMode
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-slate-700/50'
              }`}
            >
              {presentationMode ? <X size={14} /> : <Presentation size={14} />}
              <span className="sr-only sm:not-sr-only">{presentationMode ? 'Sair da apresentação' : 'Apresentação'}</span>
            </button>
          </div>
          <input
            ref={excelFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportExcel(file);
              e.target.value = '';
            }}
          />
          <Toolbar
            granularidade={granularidade}
            onGranularidadeChange={setGranularidade}
            onPrint={handlePrint}
            onExportExcel={handleExportExcel}
            onImportExcel={() => excelFileRef.current?.click()}
            onImportCronograma={() => setShowImportModal(true)}
          />
          <div className="flex min-w-0 flex-1 overflow-hidden">
            {equipesOpen ? (
              <EquipesSidebar onCollapse={() => setEquipesOpen(false)} />
            ) : (
              <button
                onClick={() => setEquipesOpen(true)}
                className="flex w-11 shrink-0 flex-col items-center justify-center gap-2 border-r border-gray-200 bg-gray-50 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white sm:w-8"
                title="Mostrar equipes"
              >
                <PanelLeftOpen size={16} />
                <span className="text-[10px] font-medium tracking-wide uppercase [writing-mode:vertical-rl]">Equipes</span>
              </button>
            )}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <GanttLivro
                  granularidade={granularidade}
                  dataInicio={dataInicio}
                  dataFim={dataFim}
                  scrollRef={ganttScrollRef}
                  onScrollSync={onGanttScroll}
                  onDateRangeChange={onDateRangeChange}
                  labelWidth={labelWidth}
                  onLabelWidthChange={setLabelWidth}
                />
              </div>
              <Histograma
                granularidade={granularidade}
                dataInicio={dataInicio}
                dataFim={dataFim}
                scrollRef={histogramaScrollRef}
                onScrollSync={onHistogramaScroll}
                labelWidth={labelWidth}
              />
            </div>
          </div>
        </div>
      </div>
      <ModalImportarCronograma open={showImportModal} onClose={() => setShowImportModal(false)} />
    </div>
  );
}
