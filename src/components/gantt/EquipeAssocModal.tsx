import { useState } from 'react';
import { X, Plus, Users } from 'lucide-react';
import { useGanttStore } from '@/lib/gantt/store';
import { EquipeModal } from './EquipeModal';
import type { Atividade } from '@/lib/gantt/supabase';

type Props = {
  atividade: Atividade | null;
  onClose: () => void;
};

// Aberto pelo menu de contexto (botão direito numa atividade) — junta os dois
// pedidos numa tela só: marcar/desmarcar equipes já cadastradas, ou cadastrar
// uma nova e ela já sair vinculada, sem precisar abrir o form de editar
// atividade inteiro só pra isso.
export function EquipeAssocModal({ atividade, onClose }: Props) {
  const { equipes, activeScenarioId, updateAtividade } = useGanttStore();
  const [novaEquipeOpen, setNovaEquipeOpen] = useState(false);

  if (!atividade) return null;
  const scenarioEquipes = equipes.filter((e) => e.scenario_id === activeScenarioId);
  const alocadas = new Set(atividade.equipes_alocadas);

  const toggle = (equipeId: string) => {
    const next = alocadas.has(equipeId)
      ? atividade.equipes_alocadas.filter((id) => id !== equipeId)
      : [...atividade.equipes_alocadas, equipeId];
    updateAtividade(atividade.id, { equipes_alocadas: next });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Users size={18} /> Equipes da atividade
              </h2>
              <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{atividade.nome}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 shrink-0">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {scenarioEquipes.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-6">Nenhuma equipe cadastrada ainda.</p>
            )}
            {scenarioEquipes.map((eq) => (
              <label
                key={eq.id}
                className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <input type="checkbox" checked={alocadas.has(eq.id)} onChange={() => toggle(eq.id)} className="w-3.5 h-3.5" />
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: eq.cor }} />
                <span className="text-sm text-gray-800 dark:text-slate-200 truncate">{eq.nome}</span>
              </label>
            ))}
          </div>

          <div className="px-5 py-4 border-t border-gray-200 dark:border-slate-700">
            <button
              onClick={() => setNovaEquipeOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg transition-colors"
            >
              <Plus size={14} /> Nova equipe
            </button>
          </div>
        </div>
      </div>

      <EquipeModal
        open={novaEquipeOpen}
        onClose={() => setNovaEquipeOpen(false)}
        editingEquipe={null}
        onCreated={(id) => toggle(id)}
      />
    </>
  );
}
