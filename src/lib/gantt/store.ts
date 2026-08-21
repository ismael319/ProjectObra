import { create } from 'zustand';
import { toast } from 'sonner';
import { supabase, type Scenario, type Equipe, type Atividade, type Parada, type FuncaoRow, type EquipamentoRow, type Dependencia } from './supabase';

type State = {
  scenarios: Scenario[];
  equipes: Equipe[];
  atividades: Atividade[];
  paradas: Parada[];
  activeScenarioId: string | null;
  // Obra e organização cujos cenários estão carregados — todo cenário novo
  // (addScenario/duplicateScenario/importScenario) nasce vinculado a elas.
  // Setados por loadAll, que é quem sabe qual obra está ativa na tela.
  projetoId: string | null;
  organizacaoId: string | null;
  loading: boolean;
  error: string | null;
  // Cada obra tem seu próprio conjunto de cenários — precisa saber qual obra
  // (e organização, pra gravar nos inserts) carregar.
  loadAll: (projetoId: string, organizacaoId: string) => Promise<void>;
  setActiveScenario: (id: string) => void;
  addScenario: (name: string) => Promise<void>;
  // Cria um cenário novo já copiando equipes, atividades (hierarquia,
  // dependências e vínculo de equipe remapeados pros novos ids) e paradas
  // de um cenário existente — pra não ter que recriar tudo do zero.
  duplicateScenario: (name: string, sourceScenarioId: string) => Promise<void>;
  // Mesma cópia de duplicateScenario, mas a partir de dados de um arquivo
  // (exportScenarioData/JSON), não de outro cenário já carregado no store —
  // usado pra importar um cenário exportado (de outro projeto, backup, etc.).
  importScenario: (name: string, data: ScenarioExportData) => Promise<void>;
  renameScenario: (id: string, name: string) => Promise<void>;
  deleteScenario: (id: string) => Promise<void>;
  // Retorna o id criado (ou null se falhou) — usado pra auto-vincular a
  // equipe recém-criada numa atividade sem o usuário ter que procurar de novo.
  addEquipe: (data: { nome: string; cor: string; funcoes: FuncaoRow[]; equipamentos: EquipamentoRow[] }) => Promise<string | null>;
  updateEquipe: (id: string, patch: Partial<Equipe>) => Promise<void>;
  deleteEquipe: (id: string) => Promise<void>;
  addAtividade: (nome: string, dataInicio: string, dataFim: string, equipesAlocadas: string[], cor: string, parentId?: string | null, percentualConcluido?: number) => Promise<void>;
  // Insere uma atividade nova exatamente na posição da atividade de referência
  // (mesmo pai dela), empurrando ela e as demais abaixo uma posição pra baixo —
  // usado pelo "Adicionar tarefa acima" do menu de contexto da lista.
  addAtividadeAcima: (
    referenciaId: string,
    nome: string,
    dataInicio: string,
    dataFim: string,
    equipesAlocadas: string[],
    cor: string,
    percentualConcluido?: number,
  ) => Promise<void>;
  // Insere várias atividades de uma vez preservando hierarquia (ex.: import do
  // cronograma) — `items` já vem em ordem pai-antes-do-filho, referenciando o pai
  // pelo tempId de outro item da mesma leva (ou null = raiz).
  addAtividadesBulk: (items: {
    tempId: string;
    parentTempId: string | null;
    nome: string;
    dataInicio: string;
    dataFim: string;
    equipesAlocadas: string[];
    cor: string;
    percentualConcluido?: number;
  }[]) => Promise<void>;
  updateAtividade: (id: string, patch: Partial<Atividade>) => Promise<void>;
  // Troca a posição da atividade com a irmã (mesmo pai) imediatamente acima
  // ou abaixo dela na lista — usado pelo "Mover para cima/baixo" do menu de
  // contexto.
  moverAtividade: (id: string, direcao: 'cima' | 'baixo') => Promise<void>;
  deleteAtividade: (id: string) => Promise<void>;
  toggleParada: (data: string) => Promise<void>;
  // Pilha de "fotos" de atividades/paradas pra Ctrl+Z no Gantt Livre — quem
  // chama uma ação (GanttChart.tsx) tira a foto ANTES de mexer, uma vez por
  // comando do usuário (ex.: uma vez por arraste inteiro, não por pixel
  // movido) — ver snapshotForUndo. undo() desfaz tudo que mudou desde a
  // última foto, de uma vez.
  undoStack: { atividades: Atividade[]; paradas: Parada[] }[];
  snapshotForUndo: () => void;
  undo: () => Promise<void>;
};

const genId = (prefix: string) =>
  prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Formato do arquivo de exportação de cenário — equipes/atividades/paradas
// crus (com os ids antigos, que são só remapeados na importação).
export type ScenarioExportData = {
  equipes: Equipe[];
  atividades: Atividade[];
  paradas: Parada[];
};

export function exportScenarioData(equipes: Equipe[], atividades: Atividade[], paradas: Parada[], scenarioId: string): ScenarioExportData {
  return {
    equipes: equipes.filter((e) => e.scenario_id === scenarioId),
    atividades: atividades.filter((a) => a.scenario_id === scenarioId),
    paradas: paradas.filter((p) => p.scenario_id === scenarioId),
  };
}

// Copia equipes/atividades/paradas de uma origem (outro cenário no store, ou
// um arquivo JSON importado) pra dentro de `targetScenarioId` — gera ids
// novos e remapeia toda referência (parent_id, equipes_alocadas,
// predecessoras) pros ids novos. Usado por duplicateScenario e importScenario.
async function copyScenarioData(
  targetScenarioId: string,
  sourceEquipes: Equipe[],
  sourceAtividades: Atividade[],
  sourceParadas: Parada[],
): Promise<{ equipes: Equipe[]; atividades: Atividade[]; paradas: Parada[] }> {
  const equipeIdMap = new Map<string, string>();
  const novasEquipes: Equipe[] = [];
  for (const eq of sourceEquipes) {
    const newId = genId('eq');
    const { error } = await supabase.from('equipes').insert({
      id: newId, scenario_id: targetScenarioId, nome: eq.nome, cor: eq.cor, funcoes: eq.funcoes, equipamentos: eq.equipamentos,
      funcao: eq.funcao, quantidade_funcionarios: eq.quantidade_funcionarios,
    });
    if (reportError(`copiar equipe "${eq.nome}"`, error)) continue;
    equipeIdMap.set(eq.id, newId);
    novasEquipes.push({ ...eq, id: newId, scenario_id: targetScenarioId });
  }

  // Pai antes do filho — mesma exigência de addAtividadesBulk (FK de parent_id).
  const atvIdMap = new Map<string, string>();
  for (const a of sourceAtividades) atvIdMap.set(a.id, genId('atv'));
  const byId = new Map(sourceAtividades.map((a) => [a.id, a]));
  const ordered: Atividade[] = [];
  const visited = new Set<string>();
  const visit = (a: Atividade) => {
    if (visited.has(a.id)) return;
    visited.add(a.id);
    if (a.parent_id && byId.has(a.parent_id)) visit(byId.get(a.parent_id)!);
    ordered.push(a);
  };
  sourceAtividades.forEach(visit);

  const novasAtividades: Atividade[] = [];
  for (const a of ordered) {
    const newId = atvIdMap.get(a.id)!;
    const newParentId = a.parent_id ? atvIdMap.get(a.parent_id) ?? null : null;
    const newEquipes = a.equipes_alocadas.map((eqId) => equipeIdMap.get(eqId)).filter((v): v is string => !!v);
    const newPreds: Dependencia[] = (a.predecessoras ?? [])
      .map((p) => ({ id: atvIdMap.get(p.id) ?? '', lag: p.lag }))
      .filter((p) => p.id !== '');
    const { error } = await supabase.from('gantt_atividades').insert({
      id: newId, scenario_id: targetScenarioId, nome: a.nome, data_inicio: a.data_inicio, data_fim: a.data_fim,
      equipes_alocadas: newEquipes, cor: a.cor, ordem: a.ordem, predecessoras: newPreds,
      parent_id: newParentId, percentual_concluido: a.percentual_concluido,
    });
    if (reportError(`copiar atividade "${a.nome}"`, error)) continue;
    novasAtividades.push({
      id: newId, scenario_id: targetScenarioId, nome: a.nome, data_inicio: a.data_inicio, data_fim: a.data_fim,
      equipes_alocadas: newEquipes, cor: a.cor, ordem: a.ordem, predecessoras: newPreds,
      parent_id: newParentId, percentual_concluido: a.percentual_concluido,
    });
  }

  const novasParadas: Parada[] = [];
  for (const p of sourceParadas) {
    const newId = genId('prd');
    const { error } = await supabase.from('paradas').insert({ id: newId, scenario_id: targetScenarioId, data: p.data });
    if (reportError('copiar parada', error)) continue;
    novasParadas.push({ id: newId, scenario_id: targetScenarioId, data: p.data });
  }

  return { equipes: novasEquipes, atividades: novasAtividades, paradas: novasParadas };
}

function deriveLegacy(funcoes: FuncaoRow[]): { funcao: string; quantidade_funcionarios: number } {
  const first = funcoes[0];
  return {
    funcao: first?.tipo || '',
    quantidade_funcionarios: funcoes.reduce((s, f) => s + f.quantidade, 0),
  };
}

// Mostra o erro de verdade em vez de deixar a ação falhar em silêncio — sem isso, uma
// gravação que falha (permissão, rede, etc.) parece ter dado certo na tela (o estado
// local do Zustand era atualizado de qualquer jeito) e some ao recarregar a página.
function reportError(action: string, error: { message: string } | null): boolean {
  if (!error) return false;
  toast.error(`Erro ao ${action}: ${error.message}`);
  return true;
}

export const useGanttStore = create<State>((set, get) => ({
  scenarios: [],
  equipes: [],
  atividades: [],
  paradas: [],
  activeScenarioId: null,
  projetoId: null,
  organizacaoId: null,
  loading: true,
  error: null,
  undoStack: [],

  loadAll: async (projetoId, organizacaoId) => {
    set({ loading: true, error: null, projetoId, organizacaoId });
    try {
      // equipes/gantt_atividades/paradas só têm scenario_id — pra filtrar por
      // obra, primeiro resolve quais cenários são dela, depois filtra as
      // outras três por esse conjunto de ids.
      const scnRes = await supabase.from('scenarios').select('*').eq('projeto_id', projetoId).order('created_at');
      reportError('carregar cenários', scnRes.error);
      const scenarios = (scnRes.data || []) as Scenario[];
      const scenarioIds = scenarios.map((s) => s.id);

      const [eqRes, atvRes, prdRes] = scenarioIds.length > 0
        ? await Promise.all([
          supabase.from('equipes').select('*').in('scenario_id', scenarioIds),
          supabase.from('gantt_atividades').select('*').in('scenario_id', scenarioIds).order('ordem'),
          supabase.from('paradas').select('*').in('scenario_id', scenarioIds),
        ])
        : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }] as const;
      // Erro de permissão numa tabela não deve travar as outras — reporta e segue
      // com o que deu certo, em vez de deixar a página inteira em branco.
      reportError('carregar equipes', eqRes.error);
      reportError('carregar atividades', atvRes.error);
      reportError('carregar paradas', prdRes.error);

      const activeId = scenarios[0]?.id ?? null;
      set({
        scenarios,
        equipes: (eqRes.data || []) as Equipe[],
        atividades: (atvRes.data || []).map((a) => ({
          ...a,
          predecessoras: Array.isArray(a.predecessoras)
            ? a.predecessoras.map((p: Dependencia | string) => typeof p === 'string' ? { id: p, lag: 0 } : p)
            : [],
        })) as Atividade[],
        paradas: (prdRes.data || []) as Parada[],
        activeScenarioId: activeId,
        loading: false,
        // Foto de outra obra não faz sentido pra desfazer aqui.
        undoStack: [],
      });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  setActiveScenario: (id) => set({ activeScenarioId: id }),

  addScenario: async (name) => {
    const { projetoId, organizacaoId } = get();
    if (!projetoId || !organizacaoId) return;
    const id = genId('scn');
    const { error } = await supabase.from('scenarios').insert({ id, name, projeto_id: projetoId, organizacao_id: organizacaoId });
    if (reportError('criar cenário', error)) return;
    set((s) => ({
      scenarios: [...s.scenarios, { id, name, projeto_id: projetoId, organizacao_id: organizacaoId }],
      activeScenarioId: id,
    }));
  },

  duplicateScenario: async (name, sourceScenarioId) => {
    const { projetoId, organizacaoId } = get();
    if (!projetoId || !organizacaoId) return;
    const id = genId('scn');
    const { error: scnError } = await supabase.from('scenarios').insert({ id, name, projeto_id: projetoId, organizacao_id: organizacaoId });
    if (reportError('duplicar cenário', scnError)) return;

    const sourceEquipes = get().equipes.filter((e) => e.scenario_id === sourceScenarioId);
    const sourceAtividades = get().atividades.filter((a) => a.scenario_id === sourceScenarioId);
    const sourceParadas = get().paradas.filter((p) => p.scenario_id === sourceScenarioId);
    const { equipes, atividades, paradas } = await copyScenarioData(id, sourceEquipes, sourceAtividades, sourceParadas);

    set((s) => ({
      scenarios: [...s.scenarios, { id, name, projeto_id: projetoId, organizacao_id: organizacaoId }],
      equipes: [...s.equipes, ...equipes],
      atividades: [...s.atividades, ...atividades],
      paradas: [...s.paradas, ...paradas],
      activeScenarioId: id,
    }));
  },

  importScenario: async (name, data) => {
    const { projetoId, organizacaoId } = get();
    if (!projetoId || !organizacaoId) return;
    const id = genId('scn');
    const { error: scnError } = await supabase.from('scenarios').insert({ id, name, projeto_id: projetoId, organizacao_id: organizacaoId });
    if (reportError('importar cenário', scnError)) return;

    const { equipes, atividades, paradas } = await copyScenarioData(id, data.equipes, data.atividades, data.paradas);

    set((s) => ({
      scenarios: [...s.scenarios, { id, name, projeto_id: projetoId, organizacao_id: organizacaoId }],
      equipes: [...s.equipes, ...equipes],
      atividades: [...s.atividades, ...atividades],
      paradas: [...s.paradas, ...paradas],
      activeScenarioId: id,
    }));
  },

  renameScenario: async (id, name) => {
    const { error } = await supabase.from('scenarios').update({ name }).eq('id', id);
    if (reportError('renomear cenário', error)) return;
    set((s) => ({
      scenarios: s.scenarios.map((sc) => (sc.id === id ? { ...sc, name } : sc)),
    }));
  },

  deleteScenario: async (id) => {
    const { error } = await supabase.from('scenarios').delete().eq('id', id);
    if (reportError('excluir cenário', error)) return;
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
    if (!sid) return null;
    const id = genId('eq');
    const legacy = deriveLegacy(funcoes);
    const { error } = await supabase.from('equipes').insert({
      id,
      scenario_id: sid,
      nome,
      cor,
      funcoes,
      equipamentos,
      funcao: legacy.funcao,
      quantidade_funcionarios: legacy.quantidade_funcionarios,
    });
    if (reportError('criar equipe', error)) return null;
    set((s) => ({
      equipes: [
        ...s.equipes,
        { id, scenario_id: sid, nome, cor, funcoes, equipamentos, ...legacy },
      ],
    }));
    return id;
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
    const { error } = await supabase.from('equipes').update(dbPatch).eq('id', id);
    if (reportError('atualizar equipe', error)) return;
    set((s) => ({
      equipes: s.equipes.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  },

  deleteEquipe: async (id) => {
    const { error } = await supabase.from('equipes').delete().eq('id', id);
    if (reportError('excluir equipe', error)) return;
    set((s) => ({
      equipes: s.equipes.filter((e) => e.id !== id),
      atividades: s.atividades.map((a) => ({
        ...a,
        equipes_alocadas: a.equipes_alocadas.filter((eq) => eq !== id),
      })),
    }));
  },

  addAtividade: async (nome, dataInicio, dataFim, equipesAlocadas, cor, parentId = null, percentualConcluido = 0) => {
    const sid = get().activeScenarioId;
    if (!sid) return;
    const id = genId('atv');
    const ordem = get().atividades.filter((a) => a.scenario_id === sid && (a.parent_id ?? null) === parentId).length;
    const predecessoras: Dependencia[] = [];
    const { error } = await supabase.from('gantt_atividades').insert({
      id,
      scenario_id: sid,
      nome,
      data_inicio: dataInicio,
      data_fim: dataFim,
      equipes_alocadas: equipesAlocadas,
      cor,
      ordem,
      predecessoras,
      parent_id: parentId,
      percentual_concluido: percentualConcluido,
    });
    if (reportError('criar atividade', error)) return;
    set((s) => ({
      atividades: [
        ...s.atividades,
        { id, scenario_id: sid, nome, data_inicio: dataInicio, data_fim: dataFim, equipes_alocadas: equipesAlocadas, cor, ordem, predecessoras, parent_id: parentId, percentual_concluido: percentualConcluido },
      ],
    }));
  },

  addAtividadeAcima: async (referenciaId, nome, dataInicio, dataFim, equipesAlocadas, cor, percentualConcluido = 0) => {
    const sid = get().activeScenarioId;
    if (!sid) return;
    const ref = get().atividades.find((a) => a.id === referenciaId);
    if (!ref) return;
    const parentId = ref.parent_id ?? null;
    // Empurra a referência e todos os irmãos abaixo dela uma posição pra
    // baixo, abrindo espaço pra nova atividade entrar exatamente no lugar dela.
    const irmaosAbaixo = get().atividades.filter(
      (a) => a.scenario_id === sid && (a.parent_id ?? null) === parentId && a.ordem >= ref.ordem,
    );
    const shiftResults = await Promise.all(
      irmaosAbaixo.map((a) => supabase.from('gantt_atividades').update({ ordem: a.ordem + 1 }).eq('id', a.id)),
    );
    const shiftError = shiftResults.find((r) => r.error)?.error ?? null;
    if (reportError('reordenar atividades', shiftError)) return;

    const id = genId('atv');
    const predecessoras: Dependencia[] = [];
    const { error } = await supabase.from('gantt_atividades').insert({
      id,
      scenario_id: sid,
      nome,
      data_inicio: dataInicio,
      data_fim: dataFim,
      equipes_alocadas: equipesAlocadas,
      cor,
      ordem: ref.ordem,
      predecessoras,
      parent_id: parentId,
      percentual_concluido: percentualConcluido,
    });
    if (reportError('criar atividade', error)) return;

    const irmaosAbaixoIds = new Set(irmaosAbaixo.map((a) => a.id));
    set((s) => ({
      atividades: [
        ...s.atividades.map((a) => (irmaosAbaixoIds.has(a.id) ? { ...a, ordem: a.ordem + 1 } : a)),
        {
          id, scenario_id: sid, nome, data_inicio: dataInicio, data_fim: dataFim,
          equipes_alocadas: equipesAlocadas, cor, ordem: ref.ordem, predecessoras, parent_id: parentId,
          percentual_concluido: percentualConcluido,
        },
      ],
    }));
  },

  addAtividadesBulk: async (items) => {
    const sid = get().activeScenarioId;
    if (!sid) return;
    const tempToRealId = new Map<string, string>();
    const inserted: Atividade[] = [];
    // Continua a sequência de ordem a partir de quantos irmãos já existem em
    // cada grupo (por pai real), em vez de sempre começar do zero.
    const siblingCount = new Map<string | null, number>();
    for (const a of get().atividades.filter((a) => a.scenario_id === sid)) {
      const key = a.parent_id ?? null;
      siblingCount.set(key, (siblingCount.get(key) ?? 0) + 1);
    }

    // Sequencial (não Promise.all) — cada item pode depender do pai anterior já
    // ter um id real gravado no banco antes de inserir o próximo.
    for (const item of items) {
      const realParentId = item.parentTempId ? tempToRealId.get(item.parentTempId) ?? null : null;
      const id = genId('atv');
      const ordem = siblingCount.get(realParentId) ?? 0;
      siblingCount.set(realParentId, ordem + 1);
      const predecessoras: Dependencia[] = [];
      const percentualConcluido = item.percentualConcluido ?? 0;
      const { error } = await supabase.from('gantt_atividades').insert({
        id,
        scenario_id: sid,
        nome: item.nome,
        data_inicio: item.dataInicio,
        data_fim: item.dataFim,
        equipes_alocadas: item.equipesAlocadas,
        cor: item.cor,
        ordem,
        predecessoras,
        parent_id: realParentId,
        percentual_concluido: percentualConcluido,
      });
      if (reportError(`criar atividade "${item.nome}"`, error)) continue;
      tempToRealId.set(item.tempId, id);
      inserted.push({
        id, scenario_id: sid, nome: item.nome, data_inicio: item.dataInicio, data_fim: item.dataFim,
        equipes_alocadas: item.equipesAlocadas, cor: item.cor, ordem, predecessoras, parent_id: realParentId,
        percentual_concluido: percentualConcluido,
      });
    }

    if (inserted.length > 0) {
      set((s) => ({ atividades: [...s.atividades, ...inserted] }));
    }
  },

  updateAtividade: async (id, patch) => {
    const { error } = await supabase.from('gantt_atividades').update(patch).eq('id', id);
    if (reportError('atualizar atividade', error)) return;
    set((s) => ({
      atividades: s.atividades.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  },

  moverAtividade: async (id, direcao) => {
    const sid = get().activeScenarioId;
    if (!sid) return;
    const atual = get().atividades.find((a) => a.id === id);
    if (!atual) return;
    const parentId = atual.parent_id ?? null;
    const irmaos = get()
      .atividades.filter((a) => a.scenario_id === sid && (a.parent_id ?? null) === parentId)
      .sort((a, b) => a.ordem - b.ordem);
    const idx = irmaos.findIndex((a) => a.id === id);
    const idxVizinho = direcao === 'cima' ? idx - 1 : idx + 1;
    if (idx === -1 || idxVizinho < 0 || idxVizinho >= irmaos.length) return;
    const vizinho = irmaos[idxVizinho];

    const [r1, r2] = await Promise.all([
      supabase.from('gantt_atividades').update({ ordem: vizinho.ordem }).eq('id', atual.id),
      supabase.from('gantt_atividades').update({ ordem: atual.ordem }).eq('id', vizinho.id),
    ]);
    if (reportError('mover atividade', r1.error ?? r2.error)) return;

    set((s) => ({
      atividades: s.atividades.map((a) => {
        if (a.id === atual.id) return { ...a, ordem: vizinho.ordem };
        if (a.id === vizinho.id) return { ...a, ordem: atual.ordem };
        return a;
      }),
    }));
  },

  deleteAtividade: async (id) => {
    const { error } = await supabase.from('gantt_atividades').delete().eq('id', id);
    if (reportError('excluir atividade', error)) return;
    set((s) => {
      // O FK de parent_id tem ON DELETE CASCADE — o banco já apagou os
      // descendentes junto. Espelha isso no estado local calculando a
      // subárvore inteira a partir do que já estava carregado.
      const toRemove = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const a of s.atividades) {
          if (a.parent_id && toRemove.has(a.parent_id) && !toRemove.has(a.id)) {
            toRemove.add(a.id);
            changed = true;
          }
        }
      }
      return {
        atividades: s.atividades
          .filter((a) => !toRemove.has(a.id))
          .map((a) => ({
            ...a,
            predecessoras: a.predecessoras.filter((p) => !toRemove.has(p.id)),
          })),
      };
    });
  },

  toggleParada: async (data) => {
    const sid = get().activeScenarioId;
    if (!sid) return;
    const existing = get().paradas.find((p) => p.scenario_id === sid && p.data === data);
    if (existing) {
      const { error } = await supabase.from('paradas').delete().eq('id', existing.id);
      if (reportError('remover parada', error)) return;
      set((s) => ({ paradas: s.paradas.filter((p) => p.id !== existing.id) }));
    } else {
      const id = genId('prd');
      const { error } = await supabase.from('paradas').insert({ id, scenario_id: sid, data });
      if (reportError('marcar parada', error)) return;
      set((s) => ({ paradas: [...s.paradas, { id, scenario_id: sid, data }] }));
    }
  },

  snapshotForUndo: () => {
    const { atividades, paradas } = get();
    set((s) => {
      const next = [
        ...s.undoStack,
        {
          atividades: atividades.map((a) => ({ ...a, predecessoras: [...a.predecessoras], equipes_alocadas: [...a.equipes_alocadas] })),
          paradas: paradas.map((p) => ({ ...p })),
        },
      ];
      // Só as últimas 20 fotos — o Gantt Livre não precisa de desfazer "desde
      // sempre", e cada foto guarda a lista inteira de atividades da obra.
      return { undoStack: next.length > 20 ? next.slice(next.length - 20) : next };
    });
  },

  undo: async () => {
    const stack = get().undoStack;
    if (stack.length === 0) {
      toast.info('Nada para desfazer.');
      return;
    }
    const snapshot = stack[stack.length - 1];
    set({ undoStack: stack.slice(0, -1) });

    const atividadesAtuais = get().atividades;
    const paradasAtuais = get().paradas;

    const snapshotAtvIds = new Set(snapshot.atividades.map((a) => a.id));
    const toDeleteAtv = atividadesAtuais.filter((a) => !snapshotAtvIds.has(a.id)).map((a) => a.id);
    if (toDeleteAtv.length > 0) {
      const { error } = await supabase.from('gantt_atividades').delete().in('id', toDeleteAtv);
      if (reportError('desfazer (remover atividades)', error)) return;
    }

    // Pai antes do filho — mesma exigência de addAtividadesBulk/copyScenarioData
    // (FK de parent_id) — reinserir/atualizar um filho antes do pai dele falharia.
    const byId = new Map(snapshot.atividades.map((a) => [a.id, a]));
    const ordered: Atividade[] = [];
    const visited = new Set<string>();
    const visit = (a: Atividade) => {
      if (visited.has(a.id)) return;
      visited.add(a.id);
      if (a.parent_id && byId.has(a.parent_id)) visit(byId.get(a.parent_id)!);
      ordered.push(a);
    };
    snapshot.atividades.forEach(visit);

    for (const a of ordered) {
      const { error } = await supabase.from('gantt_atividades').upsert({
        id: a.id, scenario_id: a.scenario_id, nome: a.nome, data_inicio: a.data_inicio, data_fim: a.data_fim,
        equipes_alocadas: a.equipes_alocadas, cor: a.cor, ordem: a.ordem, predecessoras: a.predecessoras,
        parent_id: a.parent_id, percentual_concluido: a.percentual_concluido,
      });
      if (reportError(`desfazer atividade "${a.nome}"`, error)) return;
    }

    const snapshotParadaIds = new Set(snapshot.paradas.map((p) => p.id));
    const toDeleteParada = paradasAtuais.filter((p) => !snapshotParadaIds.has(p.id)).map((p) => p.id);
    if (toDeleteParada.length > 0) {
      const { error } = await supabase.from('paradas').delete().in('id', toDeleteParada);
      if (reportError('desfazer (remover paradas)', error)) return;
    }
    const paradaAtualIds = new Set(paradasAtuais.map((p) => p.id));
    const toInsertParada = snapshot.paradas.filter((p) => !paradaAtualIds.has(p.id));
    for (const p of toInsertParada) {
      const { error } = await supabase.from('paradas').insert({ id: p.id, scenario_id: p.scenario_id, data: p.data });
      if (reportError('desfazer (recriar parada)', error)) return;
    }

    set({ atividades: snapshot.atividades, paradas: snapshot.paradas });
    toast.success('Última ação desfeita.');
  },
}));
