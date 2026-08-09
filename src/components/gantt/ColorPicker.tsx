import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Mesma paleta de COLORS do GanttChart.tsx (não exportada de lá, então
// repetida aqui) — os presets clicáveis, além do seletor de cor livre.
const PRESET_COLORS = ['#2F6FE4', '#E07B2F', '#2FAE54', '#B23FE0', '#E0B23F', '#E03F5F', '#3FE0C0', '#5F3FE0'];

type Props = {
  x: number;
  y: number;
  corAtual: string;
  onClose: () => void;
  onSelect: (cor: string) => void;
};

// Cor manual da atividade — só tem efeito visual quando ela não tem nenhuma
// equipe vinculada (a cor da equipe sempre prevalece nas barras do Gantt, ver
// GanttChart.tsx onde a barra é desenhada).
export function ColorPicker({ x, y, corAtual, onClose, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('contextmenu', handler);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('contextmenu', handler);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl p-3 w-56"
      style={position}
    >
      <p className="text-xs font-medium text-gray-700 dark:text-slate-200 mb-2">Cor da atividade</p>
      <div className="grid grid-cols-8 gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => { onSelect(c); onClose(); }}
            title={c}
            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${
              c.toLowerCase() === corAtual.toLowerCase() ? 'border-gray-900 dark:border-white' : 'border-transparent'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3">
        <input
          type="color"
          value={corAtual}
          onChange={(e) => onSelect(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-gray-200 dark:border-slate-600 bg-transparent"
        />
        <span className="text-[11px] text-gray-400 dark:text-slate-500">Cor personalizada</span>
      </div>
      <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-2 leading-snug">
        Só aparece se a atividade não tiver equipe vinculada — quando tem, a cor da equipe sempre prevalece.
      </p>
    </div>
  );
}
