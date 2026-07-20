import { Calendar, Printer, FileSpreadsheet, Upload, CalendarDays } from 'lucide-react';
import type { Granularidade } from '@/lib/gantt/histograma';

type Props = {
  granularidade: Granularidade;
  onGranularidadeChange: (g: Granularidade) => void;
  onPrint: () => void;
  onExportExcel: () => void;
  onImport: () => void;
};

export function Toolbar({ granularidade, onGranularidadeChange, onPrint, onExportExcel, onImport }: Props) {
  const granOptions: { value: Granularidade; label: string; icon: typeof Calendar }[] = [
    { value: 'dia', label: 'Dia', icon: Calendar },
    { value: 'semana', label: 'Semana', icon: CalendarDays },
    { value: 'mes', label: 'Mês', icon: CalendarDays },
  ];

  return (
    <div className="flex items-center gap-1 px-3 py-2 bg-slate-800 border-b border-slate-700">
      <button className="flex items-center gap-1.5 text-sm text-slate-200 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors">
        <Calendar size={16} /> Cronograma
      </button>
      <div className="w-px h-6 bg-slate-700" />
      <button
        onClick={onPrint}
        className="flex items-center gap-1.5 text-sm text-slate-200 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
      >
        <Printer size={16} /> Imprimir
      </button>
      <button
        onClick={onExportExcel}
        className="flex items-center gap-1.5 text-sm text-slate-200 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
      >
        <FileSpreadsheet size={16} /> Excel
      </button>
      <button
        onClick={onImport}
        className="flex items-center gap-1.5 text-sm text-slate-200 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-md transition-colors"
      >
        <Upload size={16} /> Importar
      </button>
      <div className="w-px h-6 bg-slate-700" />
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
                  : 'text-slate-200 hover:text-white hover:bg-slate-700'
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
