// Cálculos de aderência para o módulo de Programação Semanal.
// Adaptado do Weekly Craft Pro.

export type ActivityStatus = "pendente" | "concluida" | "parcial" | "nao_concluida";

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
  const planned = activities.filter((a) => !a.is_extra);
  const total = activities.length;
  const extras = total - planned.length;
  const denom = planned.length || 0;
  const concluidas = activities.filter((a) => a.status === "concluida").length;
  const parciais = activities.filter((a) => a.status === "parcial").length;
  const naoConcluidas = activities.filter((a) => a.status === "nao_concluida").length;
  const pendentes = activities.filter((a) => a.status === "pendente").length;
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

export function computeSegment(
  activities: ActivityLike[],
  field: "company" | "discipline" | "area" | "stage" | "foreman",
  partialWeight = 0.5,
): SegmentRow[] {
  const groups = new Map<string, ActivityLike[]>();
  for (const a of activities) {
    const key = (a[field] ?? "(sem valor)").toString().trim() || "(sem valor)";
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
