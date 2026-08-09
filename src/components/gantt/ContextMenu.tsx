import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, GitBranch, Link2Off, ListPlus, MoveDown, MoveUp, Palette, Pencil, Trash2, Users } from 'lucide-react';
import type { Dependencia } from '@/lib/gantt/supabase';

type Props = {
  x: number;
  y: number;
  atividadeNome: string;
  predecessoras: Dependencia[];
  outrasAtividades: { id: string; nome: string }[];
  podeSubir: boolean;
  podeDescer: boolean;
  onClose: () => void;
  onEdit: () => void;
  onManageEquipes: () => void;
  onChangeColor: () => void;
  onAddAcima: () => void;
  onAddSubitem: () => void;
  onDelete: () => void;
  onMoverCima: () => void;
  onMoverBaixo: () => void;
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
  podeSubir,
  podeDescer,
  onClose,
  onEdit,
  onManageEquipes,
  onChangeColor,
  onAddAcima,
  onAddSubitem,
  onDelete,
  onMoverCima,
  onMoverBaixo,
  onStartSetPredecessora,
  onStartSetSucessora,
  onRemoveDependencia,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    });
  }, [x, y, predecessoras.length]);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    window.addEventListener('pointerdown', handler);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const hasCandidates = outrasAtividades.length > 1;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Ações de ${atividadeNome}`}
      className="fixed z-50 max-h-[calc(100dvh-16px)] min-w-[220px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-slate-600 dark:bg-slate-800"
      style={position}
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

      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left"
        onClick={() => { onManageEquipes(); onClose(); }}
      >
        <Users size={14} className="text-purple-500 dark:text-purple-400" />
        Equipes...
      </button>

      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left"
        onClick={onChangeColor}
      >
        <Palette size={14} className="text-pink-500 dark:text-pink-400" />
        Mudar cor
      </button>

      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left"
        onClick={() => { onAddAcima(); onClose(); }}
      >
        <ArrowUp size={14} className="text-teal-500 dark:text-teal-400" />
        Adicionar tarefa acima
      </button>

      <button
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-900 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-slate-700"
        onClick={() => { onAddSubitem(); onClose(); }}
      >
        <ListPlus size={14} className="text-blue-500 dark:text-blue-400" />
        Adicionar sub-item
      </button>

      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => { onMoverCima(); onClose(); }}
        disabled={!podeSubir}
      >
        <MoveUp size={14} className="text-indigo-500 dark:text-indigo-400" />
        Mover para cima
      </button>

      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={() => { onMoverBaixo(); onClose(); }}
        disabled={!podeDescer}
      >
        <MoveDown size={14} className="text-indigo-500 dark:text-indigo-400" />
        Mover para baixo
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

      <div className="my-1 border-t border-gray-100 dark:border-slate-700" />
      <button
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
        onClick={() => { onDelete(); onClose(); }}
      >
        <Trash2 size={14} />
        Excluir atividade
      </button>
    </div>
  );
}
