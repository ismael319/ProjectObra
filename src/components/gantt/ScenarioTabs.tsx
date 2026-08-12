import { useRef, useState } from 'react';
import { Plus, X, Pencil, Check, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useGanttStore, exportScenarioData, type ScenarioExportData } from '@/lib/gantt/store';

const COPIAR_NENHUM = '';
const EXPORT_TYPE = 'gantt-livre-cenario';

type ScenarioExportFile = ScenarioExportData & { type: string; version: number; nome: string };

export function ScenarioTabs() {
  const {
    scenarios, activeScenarioId, equipes, atividades, paradas,
    setActiveScenario, addScenario, duplicateScenario, importScenario, renameScenario, deleteScenario,
  } = useGanttStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [copiarDe, setCopiarDe] = useState(COPIAR_NENHUM);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleAdd = async () => {
    if (!newName.trim()) {
      setAdding(false);
      setCopiarDe(COPIAR_NENHUM);
      return;
    }
    if (copiarDe) {
      await duplicateScenario(newName.trim(), copiarDe);
    } else {
      await addScenario(newName.trim());
    }
    setNewName('');
    setCopiarDe(COPIAR_NENHUM);
    setAdding(false);
  };

  const activeScenario = scenarios.find((sc) => sc.id === activeScenarioId);

  const handleExport = () => {
    if (!activeScenarioId || !activeScenario) return;
    const data = exportScenarioData(equipes, atividades, paradas, activeScenarioId);
    const file: ScenarioExportFile = { type: EXPORT_TYPE, version: 1, nome: activeScenario.name, ...data };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cenario-${activeScenario.name.trim().replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Cenário exportado com sucesso');
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<ScenarioExportFile>;
      if (parsed.type !== EXPORT_TYPE || !Array.isArray(parsed.equipes) || !Array.isArray(parsed.atividades) || !Array.isArray(parsed.paradas)) {
        toast.error('Arquivo inválido — não é um export de cenário do Gantt Livre.');
        return;
      }
      const nomeSugerido = `${parsed.nome ?? 'Cenário importado'} (importado)`;
      const nome = window.prompt('Nome do novo cenário:', nomeSugerido);
      if (!nome || !nome.trim()) return;
      await importScenario(nome.trim(), { equipes: parsed.equipes, atividades: parsed.atividades, paradas: parsed.paradas });
      toast.success('Cenário importado com sucesso');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar cenário');
    }
  };

  return (
    <div className="flex min-h-14 items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 pt-1 pr-14 dark:border-slate-700 dark:bg-slate-800 sm:min-h-0 sm:px-3 sm:pt-2 sm:pr-32">
      {scenarios.map((sc) => {
        const active = sc.id === activeScenarioId;
        return (
          <div
            key={sc.id}
            onClick={() => setActiveScenario(sc.id)}
            className={`group flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-lg px-4 py-2 transition-colors sm:min-h-0 ${
              active
                ? 'bg-white dark:bg-slate-900 text-gray-900 dark:text-white border-t-2 border-blue-500'
                : 'bg-gray-200/60 dark:bg-slate-700/50 text-gray-500 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            {editingId === sc.id ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      renameScenario(sc.id, editName);
                      setEditingId(null);
                    }
                  }}
                  className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-xs px-2 py-0.5 rounded outline-none w-40"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    renameScenario(sc.id, editName);
                    setEditingId(null);
                  }}
                >
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <>
                <span className="text-xs font-medium">{sc.name}</span>
                <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(sc.id);
                      setEditName(sc.name);
                    }}
                    className="flex h-10 w-10 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white sm:h-7 sm:w-7"
                    aria-label={`Renomear cenário ${sc.name}`}
                  >
                    <Pencil size={12} />
                  </button>
                  {scenarios.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteScenario(sc.id);
                      }}
                      className="flex h-10 w-10 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400 sm:h-7 sm:w-7"
                      aria-label={`Excluir cenário ${sc.name}`}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
      {adding ? (
        <div className="flex items-center gap-1.5 px-3 py-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') {
                setAdding(false);
                setNewName('');
                setCopiarDe(COPIAR_NENHUM);
              }
            }}
            placeholder="Nome do cenário"
            className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-xs px-2 py-1 rounded outline-none border border-gray-300 dark:border-slate-600 w-40"
          />
          <select
            value={copiarDe}
            onChange={(e) => setCopiarDe(e.target.value)}
            title="Copiar equipes e atividades de outro cenário"
            className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-[11px] px-2 py-1 rounded outline-none border border-gray-300 dark:border-slate-600 max-w-[160px]"
          >
            <option value={COPIAR_NENHUM}>Vazio</option>
            {scenarios.map((sc) => (
              <option key={sc.id} value={sc.id}>Copiar de: {sc.name}</option>
            ))}
          </select>
          <button onClick={handleAdd} title="Criar cenário" className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300">
            <Check size={16} />
          </button>
          <button
            onClick={() => { setAdding(false); setNewName(''); setCopiarDe(COPIAR_NENHUM); }}
            title="Cancelar"
            className="text-gray-400 dark:text-slate-400 hover:text-gray-700 dark:hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setAdding(true)}
            className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-t-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-200/60 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white sm:min-h-0"
          >
            <Plus size={14} /> Novo
          </button>
          <button
            onClick={handleExport}
            disabled={!activeScenarioId}
            title="Exportar cenário atual (equipes + atividades) como arquivo"
            className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-t-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-200/60 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white sm:min-h-0"
          >
            <Download size={14} /> Exportar cenário
          </button>
          <button
            onClick={() => importFileRef.current?.click()}
            title="Importar cenário de um arquivo exportado"
            className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-t-lg px-3 py-2 text-xs text-gray-500 hover:bg-gray-200/60 hover:text-gray-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-white sm:min-h-0"
          >
            <Upload size={14} /> Importar cenário
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = '';
            }}
          />
        </>
      )}
    </div>
  );
}
