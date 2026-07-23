import { useEffect, useRef } from 'react';
import { ArrowRight, GitBranch, Link2Off, Pencil } from 'lucide-react';
import type { Dependencia } from '@/lib/gantt/supabase';

type Props = {
  x: number;
  y: number;
  atividadeNome: string;
  predecessoras: Dependencia[];
  outrasAtividades: { id: string; nome: string }[];
  onClose: () => void;
  onEdit: () => void;
  onStartSetPredecessora: () => void;
  onStartSetSucessora: () => void;
  onRemoveDependencia: (predId: string) => void;
};

export function ContextMenu({
  x,
  y,
  atividadeNome,
  predecessoras,
  outrasAtividades,
  onClose,
  onEdit,
  onStartSetPredecessora,
  onStartSetSucessora,
  onRemoveDependencia,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', handler);
    window.addEventListener('contextmenu', handler);
    return () => {
      window.removeEventListener('mousedown', handler);
      window.removeEventListener('contextmenu', handler);
    };
  }, [onClose]);

  const hasCandidates = outrasAtividades.length > 1;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-xl py-1 min-w-[220px]"
      style={{ left: x, top: y }}
    >
      <div className="px-3 py-1.5 text-xs text-gray-400 dark:text-slate-400 border-b border-gray-100 dark:border-slate-700 truncate">
        {atividadeNome}
      </div>

      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left"
        onClick={() => { onEdit(); onClose(); }}
      >
        <Pencil size={14} className="text-amber-500 dark:text-amber-400" />
        Editar Atividade
      </button>

      <div className="border-t border-gray-100 dark:border-slate-700 my-1" />

      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => { onStartSetPredecessora(); onClose(); }}
        disabled={!hasCandidates}
      >
        <ArrowRight size={14} className="text-blue-500 dark:text-blue-400" />
        Definir como Predecessora de...
      </button>

      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => { onStartSetSucessora(); onClose(); }}
        disabled={!hasCandidates}
      >
        <GitBranch size={14} className="text-green-500 dark:text-green-400" />
        Definir como Sucessora de...
      </button>

      {predecessoras.length > 0 && (
        <>
          <div className="border-t border-gray-100 dark:border-slate-700 my-1" />
          <div className="px-3 py-1 text-xs text-gray-400 dark:text-slate-500">Remover dependência</div>
          {predecessoras.map((dep) => {
            const pred = outrasAtividades.find((a) => a.id === dep.id);
            if (!pred) return null;
            return (
              <button
                key={dep.id}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 dark:text-red-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left"
                onClick={() => { onRemoveDependencia(dep.id); onClose(); }}
              >
                <Link2Off size={12} />
                <span className="truncate">{pred.nome}</span>
                {dep.lag !== 0 && <span className="text-xs text-gray-400 dark:text-slate-500 ml-auto">+{dep.lag}d</span>}
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}
