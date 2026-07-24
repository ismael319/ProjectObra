import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Users, Wrench } from 'lucide-react';
import { useGanttStore } from '@/lib/gantt/store';
import type { Equipe, FuncaoRow, EquipamentoRow } from '@/lib/gantt/supabase';

const COLORS = ['#2F6FE4', '#E07B2F', '#2FAE54', '#B23FE0', '#E0B23F', '#E03F5F', '#3FE0C0', '#5F3FE0'];

type Props = {
  open: boolean;
  onClose: () => void;
  editingEquipe?: Equipe | null;
};

export function EquipeModal({ open, onClose, editingEquipe }: Props) {
  const { addEquipe, updateEquipe } = useGanttStore();
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(COLORS[0]);
  const [funcoes, setFuncoes] = useState<FuncaoRow[]>([]);
  const [equipamentos, setEquipamentos] = useState<EquipamentoRow[]>([]);

  useEffect(() => {
    if (open) {
      setNome(editingEquipe?.nome || '');
      setCor(editingEquipe?.cor || COLORS[0]);
      setFuncoes(editingEquipe?.funcoes?.length ? editingEquipe.funcoes : [{ quantidade: 1, tipo: '', subtipo: '', local: '' }]);
      setEquipamentos(editingEquipe?.equipamentos?.length ? editingEquipe.equipamentos : []);
    }
  }, [open, editingEquipe]);

  if (!open) return null;

  const addFuncao = () => setFuncoes([...funcoes, { quantidade: 1, tipo: '', subtipo: '', local: '' }]);
  const removeFuncao = (i: number) => setFuncoes(funcoes.filter((_, idx) => idx !== i));
  const updateFuncao = (i: number, field: keyof FuncaoRow, value: string | number) =>
    setFuncoes(funcoes.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));

  const addEquip = () => setEquipamentos([...equipamentos, { quantidade: 1, descricao: '' }]);
  const removeEquip = (i: number) => setEquipamentos(equipamentos.filter((_, idx) => idx !== i));
  const updateEquip = (i: number, field: keyof EquipamentoRow, value: string | number) =>
    setEquipamentos(equipamentos.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));

  const handleSave = async () => {
    if (!nome.trim()) return;
    const cleanFuncoes = funcoes.filter((f) => f.tipo.trim());
    const cleanEquip = equipamentos.filter((e) => e.descricao.trim());
    if (editingEquipe) {
      await updateEquipe(editingEquipe.id, { nome: nome.trim(), cor, funcoes: cleanFuncoes, equipamentos: cleanEquip });
    } else {
      await addEquipe({ nome: nome.trim(), cor, funcoes: cleanFuncoes, equipamentos: cleanEquip });
    }
    onClose();
  };

  const inputCls = 'w-full bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm px-2.5 py-2 rounded-lg border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500 transition-colors';
  const labelCls = 'text-xs font-medium text-gray-500 dark:text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: cor }}>
              <Users size={20} className="text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {editingEquipe ? 'Editar Equipe' : 'Nova Equipe'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className={labelCls}>Nome da Equipe</label>
              <input
                autoFocus
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Equipe Alpha"
                className={inputCls}
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </div>
            <div className="w-32">
              <label className={labelCls}>Cor</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCor(c)}
                    className={`w-7 h-7 rounded-lg transition-transform ${cor === c ? 'ring-2 ring-gray-900 dark:ring-white scale-110' : 'hover:scale-105'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-white">Funções / Pessoal</label>
              <button
                onClick={addFuncao}
                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={12} /> Adicionar
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/60 text-xs text-gray-500 dark:text-slate-400">
                    <th className="text-left px-3 py-2 font-medium w-20">Qtd</th>
                    <th className="text-left px-3 py-2 font-medium">Tipo / Função</th>
                    <th className="text-left px-3 py-2 font-medium">Subtipo</th>
                    <th className="text-left px-3 py-2 font-medium">Local</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {funcoes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center text-gray-400 dark:text-slate-500 text-sm py-4">
                        Nenhuma função adicionada.
                      </td>
                    </tr>
                  )}
                  {funcoes.map((f, i) => (
                    <tr key={i} className="border-t border-gray-200 dark:border-slate-700">
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="1"
                          value={f.quantidade}
                          onChange={(e) => updateFuncao(i, 'quantidade', parseInt(e.target.value) || 1)}
                          className="w-16 bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={f.tipo}
                          onChange={(e) => updateFuncao(i, 'tipo', e.target.value)}
                          placeholder="Ex: PARANÁ"
                          className="w-full bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={f.subtipo}
                          onChange={(e) => updateFuncao(i, 'subtipo', e.target.value)}
                          placeholder="Ex: Soldador"
                          className="w-full bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={f.local}
                          onChange={(e) => updateFuncao(i, 'local', e.target.value)}
                          placeholder="Ex: Campo"
                          className="w-full bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => removeFuncao(i)}
                          className="text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                <Wrench size={15} className="text-gray-400 dark:text-slate-400" /> Equipamentos
              </label>
              <button
                onClick={addEquip}
                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={12} /> Adicionar
              </button>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/60 text-xs text-gray-500 dark:text-slate-400">
                    <th className="text-left px-3 py-2 font-medium w-20">Qtd</th>
                    <th className="text-left px-3 py-2 font-medium">Descrição</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {equipamentos.length === 0 && (
                    <tr>
                      <td colSpan={3} className="text-center text-gray-400 dark:text-slate-500 text-sm py-4">
                        Nenhum equipamento adicionado.
                      </td>
                    </tr>
                  )}
                  {equipamentos.map((e, i) => (
                    <tr key={i} className="border-t border-gray-200 dark:border-slate-700">
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          min="1"
                          value={e.quantidade}
                          onChange={(ev) => updateEquip(i, 'quantidade', parseInt(ev.target.value) || 1)}
                          className="w-16 bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={e.descricao}
                          onChange={(ev) => updateEquip(i, 'descricao', ev.target.value)}
                          placeholder="Ex: Betoneira"
                          className="w-full bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-slate-600 outline-none focus:border-blue-500"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          onClick={() => removeEquip(i)}
                          className="text-gray-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-slate-700 sticky bottom-0 bg-white dark:bg-slate-800 rounded-b-2xl">
          <button
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-gray-700 dark:text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!nome.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
          >
            {editingEquipe ? 'Salvar Alterações' : 'Criar Equipe'}
          </button>
        </div>
      </div>
    </div>
  );
}
