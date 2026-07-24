import { useState } from 'react';
import { Plus, X, Pencil, Check } from 'lucide-react';
import { useGanttStore } from '@/lib/gantt/store';

export function ScenarioTabs() {
  const { scenarios, activeScenarioId, setActiveScenario, addScenario, renameScenario, deleteScenario } = useGanttStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) {
      setAdding(false);
      return;
    }
    await addScenario(newName.trim());
    setNewName('');
    setAdding(false);
  };

  return (
    <div className="flex items-center gap-1 px-3 pt-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 overflow-x-auto">
      {scenarios.map((sc) => {
        const active = sc.id === activeScenarioId;
        return (
          <div
            key={sc.id}
            onClick={() => setActiveScenario(sc.id)}
            className={`group flex items-center gap-2 px-4 py-2 rounded-t-lg cursor-pointer whitespace-nowrap transition-colors ${
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
                  className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm px-2 py-0.5 rounded outline-none w-40"
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
                <span className="text-sm font-medium">{sc.name}</span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(sc.id);
                      setEditName(sc.name);
                    }}
                    className="text-gray-400 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
                  >
                    <Pencil size={12} />
                  </button>
                  {scenarios.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteScenario(sc.id);
                      }}
                      className="text-gray-400 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400"
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
        <div className="flex items-center gap-1 px-3 py-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') {
                setAdding(false);
                setNewName('');
              }
            }}
            onBlur={handleAdd}
            placeholder="Nome do cenário"
            className="bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm px-2 py-0.5 rounded outline-none w-40"
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white rounded-t-lg hover:bg-gray-200/60 dark:hover:bg-slate-700/50 whitespace-nowrap"
        >
          <Plus size={14} /> Novo
        </button>
      )}
    </div>
  );
}
