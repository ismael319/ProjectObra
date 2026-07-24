import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useGanttStore } from '@/lib/gantt/store';
import { ScenarioTabs } from '@/components/gantt/ScenarioTabs';
import { Toolbar } from '@/components/gantt/Toolbar';
import { EquipesSidebar } from '@/components/gantt/EquipesSidebar';
import { GanttChart as GanttLivro } from '@/components/gantt/GanttChart';
import { Histograma } from '@/components/gantt/Histograma';
import { parseDate, addDays, startOfWeek } from '@/lib/gantt/dates';
import type { Granularidade } from '@/lib/gantt/histograma';

export default function GanttChartPage() {
  const { loading, error, loadAll, atividades, equipes, activeScenarioId } = useGanttStore();
  const [granularidade, setGranularidade] = useState<Granularidade>('dia');
  const [scrollLeft, setScrollLeft] = useState(0);
  const ganttScrollRef = useRef<HTMLDivElement>(null);

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

  const onScrollSync = useCallback((left: number) => {
    setScrollLeft(left);
  }, []);

  const onDateRangeChange = useCallback((inicio: Date, fim: Date) => {
    setDataInicio((prev) => (inicio < prev ? inicio : prev));
    setDataFim((prev) => (fim > prev ? fim : prev));
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleExportExcel = () => {
    const scenarioEquipes = equipes.filter((e) => e.scenario_id === activeScenarioId);
    const rows: string[] = [];
    rows.push('ID,Atividade,Data Inicio,Data Fim,Equipes,Cor');
    scenarioAtividades.forEach((a) => {
      const eqNomes = a.equipes_alocadas
        .map((eqId) => scenarioEquipes.find((e) => e.id === eqId)?.nome)
        .filter(Boolean)
        .join('; ');
      rows.push(`${a.id},"${a.nome}",${a.data_inicio},${a.data_fim},"${eqNomes}",${a.cor}`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gantt-livre.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      console.log('Imported data:', text);
      alert('Importação iniciada. Verifique o console para os dados importados.');
    };
    input.click();
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
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 100px)' }}>
        <div className="h-full flex flex-col">
          <ScenarioTabs />
          <Toolbar
            granularidade={granularidade}
            onGranularidadeChange={setGranularidade}
            onPrint={handlePrint}
            onExportExcel={handleExportExcel}
            onImport={handleImport}
          />
          <div className="flex flex-1 overflow-hidden">
            <EquipesSidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <GanttLivro
                  granularidade={granularidade}
                  dataInicio={dataInicio}
                  dataFim={dataFim}
                  scrollRef={ganttScrollRef}
                  onScrollSync={onScrollSync}
                  onDateRangeChange={onDateRangeChange}
                />
              </div>
              <Histograma
                granularidade={granularidade}
                dataInicio={dataInicio}
                dataFim={dataFim}
                scrollLeft={scrollLeft}
                onScrollSync={onScrollSync}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
