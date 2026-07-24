import { useState } from 'react';
import { Plus, Trash2, Users, Pencil } from 'lucide-react';
import { useGanttStore } from '@/lib/gantt/store';
import { EquipeModal } from './EquipeModal';
import type { Equipe } from '@/lib/gantt/supabase';

export function EquipesSidebar() {
  const { equipes, activeScenarioId, deleteEquipe } = useGanttStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEquipe, setEditingEquipe] = useState<Equipe | null>(null);

  const scenarioEquipes = equipes.filter((e) => e.scenario_id === activeScenarioId);

  const openNew = () => {
    setEditingEquipe(null);
    setModalOpen(true);
  };

  const openEdit = (eq: Equipe) => {
    setEditingEquipe(eq);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingEquipe(null);
  };

  return (
    <div className="w-52 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white tracking-wide uppercase">Equipes</h2>
        <button
          onClick={openNew}
          className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-md transition-colors"
        >
          <Plus size={14} /> Nova
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {scenarioEquipes.length === 0 && (
          <p className="text-gray-400 dark:text-slate-500 text-sm text-center mt-8 px-4">
            Nenhuma equipe cadastrada. Clique em "+ Nova" para começar.
          </p>
        )}
        {scenarioEquipes.map((eq) => {
          const totalPessoas = eq.funcoes.reduce((s, f) => s + f.quantidade, 0);
          const totalEquip = eq.equipamentos.reduce((s, e) => s + e.quantidade, 0);
          return (
            <div
              key={eq.id}
              className="group px-4 py-3 border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: eq.cor }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{eq.nome}</p>
                    {eq.funcoes.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {eq.funcoes.map((f, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                          >
                            {f.quantidade}x {f.tipo}
                            {f.subtipo ? ` (${f.subtipo})` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Users size={11} /> {totalPessoas} pessoas
                      </span>
                      {totalEquip > 0 && <span>{totalEquip} equip.</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(eq)} className="text-gray-400 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white p-1">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => deleteEquipe(eq.id)} className="text-gray-400 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 p-1">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <EquipeModal open={modalOpen} onClose={closeModal} editingEquipe={editingEquipe} />
    </div>
  );
}
