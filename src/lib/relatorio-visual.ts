// Agrupamento por Área + indicadores pro relatório visual (imagem PNG) que
// substitui o texto corrido mandado hoje pro WhatsApp — ver
// src/components/relatorio/CardRelatorioVisual.tsx e src/pages/ProgramacaoVisual.tsx.

import type { ActivityLike, ActivityStatus } from "./adherence";
import { getAreaNivel2 } from "./week-activities";

export type SubEtapaRelatorio = {
  nome: string;
  concluida: boolean;
};

export type ItemRelatorio = {
  id: string;
  nome: string;
  status: ActivityLike["status"];
  isExtra: boolean;
  subetapas: SubEtapaRelatorio[];
};

export type AreaRelatorio = {
  nome: string;
  itens: ItemRelatorio[];
};

export type RelatorioVisual = {
  areas: AreaRelatorio[];
  concluidas: number;
  naoConcluidas: number;
  /** null quando não há nenhuma concluída/não concluída ainda (ex.: programação do
   * dia seguinte, tudo pendente) — evita mostrar "0%" enganoso. */
  aderenciaPct: number | null;
  totalAtividades: number;
};

const SEM_AREA = "Sem área";

/** Mesma regra usada em ModalDetalheDia.tsx (groupByArea) — nível 2 da EDT pras
 * importadas, "Sem área" pras extras (ou importadas sem areaPath). */
function areaDe(a: ActivityLike): string {
  return a.areaPath ? getAreaNivel2(a.areaPath) || SEM_AREA : SEM_AREA;
}

export function buildRelatorioVisual(activities: ActivityLike[]): RelatorioVisual {
  // Itens inativados (em análise) não entram no relatório compartilhado — nem nos
  // cards nem nas estatísticas, mesmo critério de computeIndicators.
  const ativas = activities.filter((a) => !a.inativa);
  const map = new Map<string, ItemRelatorio[]>();
  for (const a of ativas) {
    const key = areaDe(a);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({
      id: a.id,
      nome: a.name,
      status: a.status,
      isExtra: a.is_extra,
      subetapas: (a.subetapas ?? []).map((s) => ({ nome: s.nome, concluida: s.concluida })),
    });
  }
  for (const itens of map.values()) {
    itens.sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));
  }
  const areas = Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === SEM_AREA) return 1;
      if (b === SEM_AREA) return -1;
      return a.localeCompare(b, "pt-BR");
    })
    .map(([nome, itens]) => ({ nome, itens }));

  // Extras não entram no denominador de aderência — mesmo critério já usado em
  // computeIndicators/computeSegment (lib/adherence.ts).
  const planejadas = ativas.filter((a) => !a.is_extra);
  const concluidas = planejadas.filter((a) => a.status === "concluida").length;
  const naoConcluidas = planejadas.filter((a) => a.status === "nao_concluida").length;
  const base = concluidas + naoConcluidas;

  return {
    areas,
    concluidas,
    naoConcluidas,
    aderenciaPct: base > 0 ? Math.round((concluidas / base) * 100) : null,
    totalAtividades: ativas.length,
  };
}

// ---------- Matriz semanal por Engenheiro (SEX→QUI) ----------

export type LinhaMatriz = {
  taskKey: string;
  nome: string;
  edt: string | null;
  area: string;
  /** dateISO -> status daquele dia; ausente = sem atividade programada nesse dia. */
  porDia: Record<string, ActivityStatus>;
};

export type EngenheiroMatriz = {
  nome: string;
  linhas: LinhaMatriz[];
};

export type MatrizSemanal = {
  weekDays: string[];
  engenheiros: EngenheiroMatriz[];
  concluidas: number;
  naoConcluidas: number;
  /** null quando não há nenhuma concluída/não concluída ainda — mesmo critério de
   * RelatorioVisual.aderenciaPct. */
  aderenciaPct: number | null;
};

const SEM_ENGENHEIRO = "Sem engenheiro";

/**
 * Uma "tarefa" na matriz é identificada por taskUid (estável entre os vários
 * dias que a mesma atividade importada do cronograma ocupa na semana — ver
 * getOverlappingDays em ModalImportarAtividades.tsx); extras (sem taskUid)
 * usam o próprio id da linha e por isso não se repetem em mais de um dia.
 */
// Corta pra "YYYY-MM-DD" — defensivo contra qualquer variação de serialização da data
// vinda do banco (ex.: componente de hora sobrando), pra não perder o match contra os
// dias da semana calculados no cliente e deixar as células todas em branco.
function normalizarData(iso: string): string {
  return iso.slice(0, 10);
}

export function buildMatrizSemanal(activities: ActivityLike[], weekDays: string[]): MatrizSemanal {
  // Mesmo critério de buildRelatorioVisual: itens inativados (em análise) somem da
  // matriz e das estatísticas.
  const ativas = activities.filter((a) => !a.inativa);
  const porEngenheiro = new Map<string, Map<string, LinhaMatriz>>();
  for (const a of ativas) {
    const engenheiro = a.foreman?.trim() || SEM_ENGENHEIRO;
    const taskKey = a.taskUid ?? a.id;
    if (!porEngenheiro.has(engenheiro)) porEngenheiro.set(engenheiro, new Map());
    const linhas = porEngenheiro.get(engenheiro)!;
    if (!linhas.has(taskKey)) linhas.set(taskKey, { taskKey, nome: a.name, edt: a.stage, area: areaDe(a), porDia: {} });
    linhas.get(taskKey)!.porDia[normalizarData(a.planned_date)] = a.status;
  }

  const engenheiros = Array.from(porEngenheiro.entries())
    .sort(([a], [b]) => {
      if (a === SEM_ENGENHEIRO) return 1;
      if (b === SEM_ENGENHEIRO) return -1;
      return a.localeCompare(b, "pt-BR");
    })
    .map(([nome, linhasMap]) => ({
      nome,
      // Agrupa por área primeiro (mesmo critério de "Sem área" por último usado no
      // card por área) e só depois por nome da tarefa — deixa os itens da mesma
      // área próximos em vez de intercalados em ordem alfabética pura por tarefa.
      linhas: Array.from(linhasMap.values()).sort((x, y) => {
        if (x.area !== y.area) {
          if (x.area === SEM_AREA) return 1;
          if (y.area === SEM_AREA) return -1;
          return x.area.localeCompare(y.area, "pt-BR");
        }
        return x.nome.localeCompare(y.nome, "pt-BR");
      }),
    }));

  // Mesmo critério de aderência do card por Área (buildRelatorioVisual): extras não
  // entram no denominador.
  const planejadas = ativas.filter((a) => !a.is_extra);
  const concluidas = planejadas.filter((a) => a.status === "concluida").length;
  const naoConcluidas = planejadas.filter((a) => a.status === "nao_concluida").length;
  const base = concluidas + naoConcluidas;

  return {
    weekDays,
    engenheiros,
    concluidas,
    naoConcluidas,
    aderenciaPct: base > 0 ? Math.round((concluidas / base) * 100) : null,
  };
}
