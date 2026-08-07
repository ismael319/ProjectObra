// Cálculos de aderência para o módulo de Programação Semanal.
// Adaptado do Weekly Craft Pro.

import type { WBSActivity } from "./xml-parser";
import { getAreaNivel2 } from "./week-activities";

export type ActivityStatus = "pendente" | "concluida" | "parcial" | "nao_concluida";

/** Sem "parcial" — uma sub-etapa é atômica (aconteceu, não aconteceu, ou ainda não
 * foi resolvida), diferente da atividade em si, que pode ser parcialmente feita. */
export type SubEtapaStatus = "pendente" | "concluida" | "nao_concluida";

export interface SubEtapa {
  id: string;
  activity_id: string;
  nome: string;
  status: SubEtapaStatus;
}

export interface ActivityLike {
  id: string;
  name: string;
  company: string | null;
  discipline: string | null;
  area: string | null;
  stage: string | null;
  foreman: string | null;
  planned_date: string;
  planned_pct: number;
  status: ActivityStatus;
  is_extra: boolean;
  observation: string | null;
  /** Origem da atividade: undefined=programação, nome do cronograma=importada do cronograma */
  source?: string;
  /** Nível 2/3 da EDT do cronograma de origem (ex.: "GALPÃO / COBERTURA") — só em atividades importadas */
  areaPath?: string | null;
  /** UID da tarefa no cronograma de origem (WBSActivity.uid, como string) — só em atividades importadas via cronograma; null em extras manuais e em importações antigas feitas antes desse campo existir. */
  taskUid?: string | null;
  /** Sub-etapas do dia (ex.: Armação/Concretagem/Bases de uma mesma atividade "Bypass") —
   * quando existe pelo menos uma, o status da atividade é calculado a partir delas
   * (ver computeStatusFromSubetapas em programacao-db.ts) em vez dos 3 botões manuais. */
  subetapas?: SubEtapa[];
  /** Marcada quando o item precisa ficar de lado pra análise (ex.: não fica claro por
   * que não foi executado) — sai do cálculo de PPC/aderência (computeIndicators,
   * computeSegment) e dos relatórios visuais enquanto estiver assim, mas continua
   * visível na tela do dia pra ser revisada. */
  inativa?: boolean;
  motivoInativacao?: string | null;
  /** Retrato de `is_extra` no instante em que a atividade entrou na semana (import do
   * cronograma ou avulsa) — nunca muda depois, mesmo que alguém marque/desmarque
   * "Extra" ou inative o item mais tarde. Alimenta computeIndicatorsCronograma, que
   * mede a aderência do plano ORIGINAL (sem gente reorganizando a semana pra
   * melhorar o número). undefined (dados antigos sem a coluna) cai de volta em
   * is_extra — assume que o valor atual é o original. */
  isExtraOriginal?: boolean;
}

export interface WeekIndicators {
  total: number;
  extras: number;
  concluidas: number;
  parciais: number;
  naoConcluidas: number;
  pendentes: number;
  ppc: number;
  aderencia: number;
}

export interface SegmentRow {
  name: string;
  count: number;
  pct: number;
}

export function statusWeight(s: ActivityStatus, partialWeight: number): number {
  if (s === "concluida") return 1;
  if (s === "parcial") return partialWeight;
  return 0;
}

export function computeIndicators(
  activities: ActivityLike[],
  partialWeight = 0.5,
): WeekIndicators {
  // Itens inativados (em análise) saem do cálculo inteiro — nem contam a favor nem
  // contra o PPC/aderência enquanto isso não for resolvido.
  const ativas = activities.filter((a) => !a.inativa);
  const planned = ativas.filter((a) => !a.is_extra);
  const total = ativas.length;
  const extras = total - planned.length;
  const denom = planned.length || 0;
  const concluidas = ativas.filter((a) => a.status === "concluida").length;
  const parciais = ativas.filter((a) => a.status === "parcial").length;
  const naoConcluidas = ativas.filter((a) => a.status === "nao_concluida").length;
  const pendentes = ativas.filter((a) => a.status === "pendente").length;
  const weighted = planned.reduce((s, a) => s + statusWeight(a.status, partialWeight), 0);
  return {
    total,
    extras,
    concluidas,
    parciais,
    naoConcluidas,
    pendentes,
    ppc: denom ? concluidas / denom : 0,
    aderencia: denom ? weighted / denom : 0,
  };
}

// "Aderência do Cronograma" — a mesma fórmula de computeIndicators, mas sobre o
// plano ORIGINAL da semana (isExtraOriginal), ignorando qualquer marcação de
// Extra/Inativa feita depois. Existe pra comparar com computeIndicators (a
// "Aderência Ajustada", que reflete os ajustes ao longo da semana) e flagrar
// reprogramação incoerente: se a Ajustada fica bem acima da do Cronograma, o time
// está "limpando" o número via Extra/Inativa em vez de entregar o que foi
// planejado. Semana bloqueada ou não, essa conta nunca muda pro mesmo item — só o
// status atual dele entra em jogo.
export function computeIndicatorsCronograma(
  activities: ActivityLike[],
  partialWeight = 0.5,
): WeekIndicators {
  const planned = activities.filter((a) => !(a.isExtraOriginal ?? a.is_extra));
  const total = activities.length;
  const extras = total - planned.length;
  const denom = planned.length;
  const concluidas = planned.filter((a) => a.status === "concluida").length;
  const parciais = planned.filter((a) => a.status === "parcial").length;
  const naoConcluidas = planned.filter((a) => a.status === "nao_concluida").length;
  const pendentes = planned.filter((a) => a.status === "pendente").length;
  const weighted = planned.reduce((s, a) => s + statusWeight(a.status, partialWeight), 0);
  return {
    total,
    extras,
    concluidas,
    parciais,
    naoConcluidas,
    pendentes,
    ppc: denom ? concluidas / denom : 0,
    aderencia: denom ? weighted / denom : 0,
  };
}

// Dias de atraso (0 se não estiver atrasada): término já passou e ainda não chegou
// a 100% de avanço. Compara só a data (sem hora), pra "vence hoje" não contar atraso.
// Usado tanto no card do dia (CardDia) quanto no detalhe de cada atividade
// (ModalDetalheDia) — só funciona pra atividades com vínculo ao cronograma (ver
// ActivityLike.taskUid / getActivityDetail em DailyProgramming.tsx).
export function computeDelayDays(detail: WBSActivity): number {
  const finish = detail.finish instanceof Date ? detail.finish : new Date(detail.finish);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const finishDay = new Date(finish.getFullYear(), finish.getMonth(), finish.getDate());
  if (finishDay >= today || detail.percentComplete >= 100) return 0;
  return Math.round((today.getTime() - finishDay.getTime()) / 86400000);
}

export function computeSegment(
  activities: ActivityLike[],
  field: "company" | "discipline" | "area" | "stage" | "foreman",
  partialWeight = 0.5,
): SegmentRow[] {
  const groups = new Map<string, ActivityLike[]>();
  for (const a of activities.filter((x) => !x.inativa)) {
    // Em atividades importadas (is_extra=false), `area` fica sempre null de propósito
    // (ver getWeek em programacao-db.ts) — o texto de verdade vem do nível 2 da EDT,
    // guardado em `areaPath`. Sem isso, "Aderência por Área" ficava sempre "(sem
    // valor)" pra tudo que veio do cronograma.
    const raw = field === "area" && !a.is_extra && a.areaPath ? getAreaNivel2(a.areaPath) : a[field];
    const key = (raw ?? "(sem valor)").toString().trim() || "(sem valor)";
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }
  const rows: SegmentRow[] = [];
  for (const [name, list] of groups) {
    const planned = list.filter((a) => !a.is_extra);
    const denom = planned.length;
    const w = planned.reduce((s, a) => s + statusWeight(a.status, partialWeight), 0);
    rows.push({ name, count: list.length, pct: denom ? w / denom : 0 });
  }
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

// ============ Baseline / Análise Semanal ============

export interface BaselineActivity {
  activity_id: string
  name: string
  planned_date: string
  status: ActivityStatus
  is_extra: boolean
}

export interface WeekAnalysisSummary {
  totalBaseline: number
  totalAtual: number
  concluidasNoBaseline: number
  naoConcluidas: number
  reprogramadas: number
  extrasAdicionados: number
  removidos: number
  aderenciaBaseline: number
  aderenciaAtual: number
  delta: number
}

/** Calcula aderência do baseline (snapshot do momento do bloqueio) */
export function computeIndicatorsBaseline(
  baseline: BaselineActivity[],
  partialWeight = 0.5,
): WeekIndicators {
  const planned = baseline.filter((a) => !a.is_extra);
  const total = baseline.length;
  const extras = total - planned.length;
  const denom = planned.length;
  const concluidas = planned.filter((a) => a.status === "concluida").length;
  const parciais = planned.filter((a) => a.status === "parcial").length;
  const naoConcluidas = planned.filter((a) => a.status === "nao_concluida").length;
  const pendentes = planned.filter((a) => a.status === "pendente").length;
  const weighted = planned.reduce((s, a) => s + statusWeight(a.status, partialWeight), 0);
  return {
    total,
    extras,
    concluidas,
    parciais,
    naoConcluidas,
    pendentes,
    ppc: denom ? concluidas / denom : 0,
    aderencia: denom ? weighted / denom : 0,
  };
}

/** Gera resumo da análise semanal comparando baseline vs estado atual */
export function computeWeekAnalysisSummary(
  baseline: BaselineActivity[],
  currentActivities: ActivityLike[],
  partialWeight = 0.5,
): WeekAnalysisSummary {
  const baselineIds = new Set(baseline.map(b => b.activity_id))
  const currentIds = new Set(currentActivities.map(a => a.id))

  // Itens que continuam existindo
  const stillExist = baseline.filter(b => currentIds.has(b.activity_id))

  // Concluídos no baseline
  const concluidasNoBaseline = stillExist.filter(b => b.status === "concluida").length

  // Não concluídos (pendentes ou não concluídos no baseline e ainda não foram)
  const naoConcluidas = stillExist.filter(b =>
    b.status !== "concluida" && b.status !== "parcial"
  ).length

  // Reprogramados (mudaram de dia)
  const reprogramadas = stillExist.filter(b => {
    const current = currentActivities.find(a => a.id === b.activity_id)
    return current && current.planned_date !== b.planned_date
  }).length

  // Extras adicionados depois do bloqueio
  const extrasAdicionados = currentActivities.filter(a =>
    !baselineIds.has(a.id) && a.is_extra
  ).length

  // Removidos depois do bloqueio
  const removidos = baseline.filter(b => !currentIds.has(b.activity_id)).length

  // Aderência do baseline
  const indicBaseline = computeIndicatorsBaseline(baseline, partialWeight)

  // Aderência atual
  const indicAtual = computeIndicators(currentActivities, partialWeight)

  return {
    totalBaseline: baseline.length,
    totalAtual: currentActivities.length,
    concluidasNoBaseline,
    naoConcluidas,
    reprogramadas,
    extrasAdicionados,
    removidos,
    aderenciaBaseline: indicBaseline.aderencia,
    aderenciaAtual: indicAtual.aderencia,
    delta: indicAtual.aderencia - indicBaseline.aderencia,
  }
}
