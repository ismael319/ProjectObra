// Agrupamento por Área + indicadores pro relatório visual (imagem PNG) que
// substitui o texto corrido mandado hoje pro WhatsApp — ver
// src/components/relatorio/CardRelatorioVisual.tsx e src/pages/ProgramacaoVisual.tsx.

import type { ActivityLike } from "./adherence";
import { getAreaNivel2 } from "./week-activities";

export type ItemRelatorio = {
  id: string;
  nome: string;
  status: ActivityLike["status"];
  isExtra: boolean;
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
  const map = new Map<string, ItemRelatorio[]>();
  for (const a of activities) {
    const key = areaDe(a);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ id: a.id, nome: a.name, status: a.status, isExtra: a.is_extra });
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
  const planejadas = activities.filter((a) => !a.is_extra);
  const concluidas = planejadas.filter((a) => a.status === "concluida").length;
  const naoConcluidas = planejadas.filter((a) => a.status === "nao_concluida").length;
  const base = concluidas + naoConcluidas;

  return {
    areas,
    concluidas,
    naoConcluidas,
    aderenciaPct: base > 0 ? Math.round((concluidas / base) * 100) : null,
    totalAtividades: activities.length,
  };
}
