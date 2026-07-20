import { create } from 'zustand';
import { supabase, type Scenario, type Equipe, type Atividade, type Parada, type FuncaoRow, type EquipamentoRow, type Dependencia } from './supabase';

type State = {
  scenarios: Scenario[];
  equipes: Equipe[];
  atividades: Atividade[];
  paradas: Parada[];
  activeScenarioId: string | null;
  loading: boolean;
  error: string | null;
  loadAll: () => Promise<void>;
  setActiveScenario: (id: string) => void;
  addScenario: (name: string) => Promise<void>;
  renameScenario: (id: string, name: string) => Promise<void>;
  deleteScenario: (id: string) => Promise<void>;
  addEquipe: (data: { nome: string; cor: string; funcoes: FuncaoRow[]; equipamentos: EquipamentoRow[] }) => Promise<void>;
  updateEquipe: (id: string, patch: Partial<Equipe>) => Promise<void>;
  deleteEquipe: (id: string) => Promise<void>;
  addAtividade: (nome: string, dataInicio: string, dataFim: string, equipesAlocadas: string[], cor: string) => Promise<void>;
  updateAtividade: (id: string, patch: Partial<Atividade>) => Promise<void>;
  deleteAtividade: (id: string) => Promise<void>;
  toggleParada: (data: string) => Promise<void>;
};

const genId = (prefix: string) =>
  prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function deriveLegacy(funcoes: FuncaoRow[]): { funcao: string; quantidade_funcionarios: number } {
  const first = funcoes[0];
  return {
    funcao: first?.tipo || '',
    quantidade_funcionarios: funcoes.reduce((s, f) => s + f.quantidade, 0),
  };
}

export const useGanttStore = create<State>((set, get) => ({
  scenarios: [],
  equipes: [],
  atividades: [],
  paradas: [],
  activeScenarioId: null,
  loading: true,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [{ data: scns }, { data: eqs }, { data: atvs }, { data: prds }] = await Promise.all([
        supabase.from('scenarios').select('*').order('created_at'),
        supabase.from('equipes').select('*'),
        supabase.from('atividades').select('*').order('ordem'),
        supabase.from('paradas').select('*'),
      ]);
      const scenarios = (scns || []) as Scenario[];
      const activeId = scenarios[0]?.id ?? null;
      set({
        scenarios,
        equipes: (eqs || []) as Equipe[],
        atividades: (atvs || []).map((a) => ({
          ...a,
          predecessoras: Array.isArray(a.predecessoras)
            ? a.predecessoras.map((p: Dependencia | string) => typeof p === 'string' ? { id: p, lag: 0 } : p)
            : [],
        })) as Atividade[],
        paradas: (prds || []) as Parada[],
        activeScenarioId: activeId,
        loading: false,
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  setActiveScenario: (id) => set({ activeScenarioId: id }),

  addScenario: async (name) => {
    const id = genId('scn');
    const { error } = await supabase.from('scenarios').insert({ id, name });
    if (error) throw error;
    set((s) => ({
      scenarios: [...s.scenarios, { id, name }],
      activeScenarioId: id,
    }));
  },

  renameScenario: async (id, name) => {
    await supabase.from('scenarios').update({ name }).eq('id', id);
    set((s) => ({
      scenarios: s.scenarios.map((sc) => (sc.id === id ? { ...sc, name } : sc)),
    }));
  },

  deleteScenario: async (id) => {
    await supabase.from('scenarios').delete().eq('id', id);
    set((s) => {
      const remaining = s.scenarios.filter((sc) => sc.id !== id);
      return {
        scenarios: remaining,
        activeScenarioId: s.activeScenarioId === id ? remaining[0]?.id ?? null : s.activeScenarioId,
      };
    });
  },

  addEquipe: async ({ nome, cor, funcoes, equipamentos }) => {
    const sid = get().activeScenarioId;
    if (!sid) return;
    const id = genId('eq');
    const legacy = deriveLegacy(funcoes);
    await supabase.from('equipes').insert({
      id,
      scenario_id: sid,
      nome,
      cor,
      funcoes,
      equipamentos,
      funcao: legacy.funcao,
      quantidade_funcionarios: legacy.quantidade_funcionarios,
    });
    set((s) => ({
      equipes: [
        ...s.equipes,
        { id, scenario_id: sid, nome, cor, funcoes, equipamentos, ...legacy },
      ],
    }));
  },

  updateEquipe: async (id, patch) => {
    const merged = { ...get().equipes.find((e) => e.id === id), ...patch } as Equipe | undefined;
    let dbPatch: Record<string, unknown> = { ...patch };
    if (patch.funcoes && merged) {
      const legacy = deriveLegacy(merged.funcoes);
      dbPatch = { ...dbPatch, ...legacy };
      patch.funcao = legacy.funcao;
      patch.quantidade_funcionarios = legacy.quantidade_funcionarios;
    }
    await supabase.from('equipes').update(dbPatch).eq('id', id);
    set((s) => ({
      equipes: s.equipes.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  },

  deleteEquipe: async (id) => {
    await supabase.from('equipes').delete().eq('id', id);
    set((s) => ({
      equipes: s.equipes.filter((e) => e.id !== id),
      atividades: s.atividades.map((a) => ({
        ...a,
        equipes_alocadas: a.equipes_alocadas.filter((eq) => eq !== id),
      })),
    }));
  },

  addAtividade: async (nome, dataInicio, dataFim, equipesAlocadas, cor) => {
    const sid = get().activeScenarioId;
    if (!sid) return;
    const id = genId('atv');
    const ordem = get().atividades.filter((a) => a.scenario_id === sid).length;
    const predecessoras: Dependencia[] = [];
    await supabase.from('atividades').insert({
      id,
      scenario_id: sid,
      nome,
      data_inicio: dataInicio,
      data_fim: dataFim,
      equipes_alocadas: equipesAlocadas,
      cor,
      ordem,
      predecessoras,
    });
    set((s) => ({
      atividades: [
        ...s.atividades,
        { id, scenario_id: sid, nome, data_inicio: dataInicio, data_fim: dataFim, equipes_alocadas: equipesAlocadas, cor, ordem, predecessoras },
      ],
    }));
  },

  updateAtividade: async (id, patch) => {
    await supabase.from('atividades').update(patch).eq('id', id);
    set((s) => ({
      atividades: s.atividades.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  },

  deleteAtividade: async (id) => {
    await supabase.from('atividades').delete().eq('id', id);
    set((s) => ({
      atividades: s.atividades
        .filter((a) => a.id !== id)
        .map((a) => ({
          ...a,
          predecessoras: a.predecessoras.filter((p) => p.id !== id),
        })),
    }));
  },

  toggleParada: async (data) => {
    const sid = get().activeScenarioId;
    if (!sid) return;
    const existing = get().paradas.find((p) => p.scenario_id === sid && p.data === data);
    if (existing) {
      await supabase.from('paradas').delete().eq('id', existing.id);
      set((s) => ({ paradas: s.paradas.filter((p) => p.id !== existing.id) }));
    } else {
      const id = genId('prd');
      await supabase.from('paradas').insert({ id, scenario_id: sid, data });
      set((s) => ({ paradas: [...s.paradas, { id, scenario_id: sid, data }] }));
    }
  },
}));
