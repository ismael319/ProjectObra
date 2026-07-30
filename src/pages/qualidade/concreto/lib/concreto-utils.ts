// Cálculos derivados de uma carga de concreto.
//
// - Usina própria: dá pra comparar o peso teórico (a partir do traço) contra
//   o peso pesado na balança, então calculamos peso_bruto_teorico_kg e a
//   perda (kg e %) entre teórico e real.
// - Fornecedor externo: não temos o traço/consumo real usado pelo
//   fornecedor, então perda não se aplica — só o custo da carga
//   (preco_total = quantidade_m3 * preco_unitario).
//
// ano_mes/ano_semana seguem o mesmo formato e algoritmo (semana ISO 8601) já
// usados em apontamento/lib/date-utils.ts.

export type TipoOrigemConcreto = "propria" | "externa";

export type TracoConsumo = {
  consumo_cimento_kg_m3: number | null;
  consumo_brita00_kg_m3: number | null;
  consumo_brita01_kg_m3: number | null;
  consumo_po_brita_kg_m3: number | null;
  consumo_areia_kg_m3: number | null;
};

export type ComputeCargaInput = {
  data: string; // "YYYY-MM-DD"
  tipo_origem: TipoOrigemConcreto;
  traco: TracoConsumo;
  quantidade_m3: number;
  peso_balanca_kg?: number | null; // usado só quando tipo_origem === "propria"
  preco_unitario?: number | null; // usado só quando tipo_origem === "externa"
};

export type ComputeCargaResult = {
  peso_bruto_teorico_kg: number | null;
  peso_balanca_kg: number | null;
  perda_kg: number | null;
  perda_pct: number | null;
  preco_unitario: number | null;
  preco_total: number | null;
  ano_mes: string;
  ano_semana: string;
};

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toAnoMes(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function toAnoSemana(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const { year, week } = isoWeek(new Date(y, m - 1, d));
  return `${year}-${String(week).padStart(2, "0")}`;
}

function pesoTeoricoDoTraco(traco: TracoConsumo, quantidadeM3: number): number {
  const porM3 =
    (traco.consumo_cimento_kg_m3 ?? 0) +
    (traco.consumo_brita00_kg_m3 ?? 0) +
    (traco.consumo_brita01_kg_m3 ?? 0) +
    (traco.consumo_po_brita_kg_m3 ?? 0) +
    (traco.consumo_areia_kg_m3 ?? 0);
  return porM3 * quantidadeM3;
}

export function computeCarga(input: ComputeCargaInput): ComputeCargaResult {
  const base = {
    ano_mes: toAnoMes(input.data),
    ano_semana: toAnoSemana(input.data),
  };

  if (input.tipo_origem === "propria") {
    const peso_bruto_teorico_kg = pesoTeoricoDoTraco(input.traco, input.quantidade_m3);
    const peso_balanca_kg = input.peso_balanca_kg ?? null;

    let perda_kg: number | null = null;
    let perda_pct: number | null = null;
    if (peso_balanca_kg != null) {
      perda_kg = peso_bruto_teorico_kg - peso_balanca_kg;
      perda_pct = peso_bruto_teorico_kg !== 0 ? (perda_kg / peso_bruto_teorico_kg) * 100 : null;
    }

    return {
      ...base,
      peso_bruto_teorico_kg,
      peso_balanca_kg,
      perda_kg,
      perda_pct,
      preco_unitario: null,
      preco_total: null,
    };
  }

  // externa
  const preco_unitario = input.preco_unitario ?? null;
  const preco_total = preco_unitario != null ? input.quantidade_m3 * preco_unitario : null;

  return {
    ...base,
    peso_bruto_teorico_kg: null,
    peso_balanca_kg: input.peso_balanca_kg ?? null,
    perda_kg: null,
    perda_pct: null,
    preco_unitario,
    preco_total,
  };
}
