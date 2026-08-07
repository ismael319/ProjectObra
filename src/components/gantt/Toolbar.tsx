import { useState } from 'react';
import { Calendar, Printer, FileSpreadsheet, Upload, Download, CalendarDays } from 'lucide-react';
import type { Granularidade } from '@/lib/gantt/histograma';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type Props = {
  granularidade: Granularidade;
  onGranularidadeChange: (g: Granularidade) => void;
  onPrint: () => void;
  onExportExcel: () => void;
  onImportExcel: () => void;
  onImportCronograma: () => void;
};

export function Toolbar({
  granularidade,
  onGranularidadeChange,
  onPrint,
  onExportExcel,
  onImportExcel,
  onImportCronograma,
}: Props) {
  const [excelMenuOpen, setExcelMenuOpen] = useState(false);
  const granOptions: { value: Granularidade; label: string; icon: typeof Calendar }[] = [
    { value: 'dia', label: 'Dia', icon: Calendar },
    { value: 'semana', label: 'Semana', icon: CalendarDays },
    { value: 'mes', label: 'Mês', icon: CalendarDays },
  ];

  return (
    <TooltipProvider delayDuration={300}>
    <div className="flex flex-wrap items-center gap-1 px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onImportCronograma}
            className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
          >
            <Calendar size={16} /> Cronograma
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          Busca atividades no(s) cronograma(s) do projeto (importado via XML) pra trazer pro Gantt Livre
          do cenário atual.
        </TooltipContent>
      </Tooltip>
      <div className="w-px h-6 bg-gray-200 dark:bg-slate-700" />
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onPrint}
            className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
          >
            <Printer size={16} /> Imprimir
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">Imprime a visão atual do Gantt (barras, equipes e período visível).</TooltipContent>
      </Tooltip>
      <div className="relative">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setExcelMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
            >
              <FileSpreadsheet size={16} /> Excel
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">Importa ou exporta as atividades do cenário atual em planilha .xlsx.</TooltipContent>
        </Tooltip>
        {excelMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setExcelMenuOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-20 w-52 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
              <button
                onClick={() => { onImportExcel(); setExcelMenuOpen(false); }}
                className="w-full flex items-center gap-2 text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 px-3 py-2 text-left"
              >
                <Upload size={14} /> Importar Excel
              </button>
              <button
                onClick={() => { onExportExcel(); setExcelMenuOpen(false); }}
                className="w-full flex items-center gap-2 text-xs text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 px-3 py-2 text-left"
              >
                <Download size={14} /> Exportar Excel
              </button>
            </div>
          </>
        )}
      </div>
      <div className="w-px h-6 bg-gray-200 dark:bg-slate-700" />
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1">
            {granOptions.map((opt) => {
              const Icon = opt.icon;
              const active = granularidade === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onGranularidadeChange(opt.value)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon size={16} /> {opt.label}
                </button>
              );
            })}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          Muda a resolução do eixo do tempo do Gantt e do histograma abaixo (dia, semana ou mês).
        </TooltipContent>
      </Tooltip>
    </div>
    </TooltipProvider>
  );
}
