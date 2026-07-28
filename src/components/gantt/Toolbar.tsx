import { useState } from 'react';
import { Calendar, Printer, FileSpreadsheet, Upload, Download, CalendarDays } from 'lucide-react';
import type { Granularidade } from '@/lib/gantt/histograma';

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
    <div className="flex items-center gap-1 px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
      <button
        onClick={onImportCronograma}
        className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
        title="Importar atividades do cronograma do projeto"
      >
        <Calendar size={16} /> Cronograma
      </button>
      <div className="w-px h-6 bg-gray-200 dark:bg-slate-700" />
      <button
        onClick={onPrint}
        className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
      >
        <Printer size={16} /> Imprimir
      </button>
      <div className="relative">
        <button
          onClick={() => setExcelMenuOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-200 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
        >
          <FileSpreadsheet size={16} /> Excel
        </button>
        {excelMenuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setExcelMenuOpen(false)} />
            <div className="absolute left-0 top-full mt-1 z-20 w-52 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
              <button
                onClick={() => { onImportExcel(); setExcelMenuOpen(false); }}
                className="w-full flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 px-3 py-2 text-left"
              >
                <Upload size={14} /> Importar Excel
              </button>
              <button
                onClick={() => { onExportExcel(); setExcelMenuOpen(false); }}
                className="w-full flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 px-3 py-2 text-left"
              >
                <Download size={14} /> Exportar Excel
              </button>
            </div>
          </>
        )}
      </div>
      <div className="w-px h-6 bg-gray-200 dark:bg-slate-700" />
      <div className="flex items-center gap-1">
        {granOptions.map((opt) => {
          const Icon = opt.icon;
          const active = granularidade === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onGranularidadeChange(opt.value)}
              className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md transition-colors ${
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
    </div>
  );
}
