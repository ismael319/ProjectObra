// Agrupamento por Área + indicadores pro relatório visual (imagem PNG) que
// substitui o texto corrido mandado hoje pro WhatsApp — ver
// src/components/relatorio/CardRelatorioVisual.tsx e src/pages/ProgramacaoVisual.tsx.

import { statusWeight, type ActivityLike, type ActivityStatus, type SubEtapaStatus } from "./adherence";
import { getAreaNivel2, getAreaNivel3 } from "./week-activities";

export type SubEtapaRelatorio = {
  nome: string;
  status: SubEtapaStatus;
};

export type ItemRelatorio = {
  id: string;
  nome: string;
  status: ActivityLike["status"];
  isExtra: boolean;
  subetapas: SubEtapaRelatorio[];
  /** Nível 3 da EDT ("" quando a tarefa não tem esse nível) — a área (nível 2) já
   * aparece como cabeçalho do grupo (AreaRelatorio.nome); isso aqui é o nível
   * abaixo dela, usado no PDF do dia e no texto de WhatsApp (ver
   * relatorio-dia-pdf.ts e relatorio-texto.ts). */
  subarea: string;
};

export type AreaRelatorio = {
  nome: string;
  itens: ItemRelatorio[];
};

export type RelatorioVisual = {
  areas: AreaRelatorio[];
  concluidas: number;
  naoConcluidas: number;
  /** Mesma fórmula de computeIndicators.aderencia (adherence.ts): planejadas (sem
   * extras) no denominador — inclusive pendentes — e parcial vale meio crédito. null
   * só quando não há nenhuma atividade planejada (ex.: dia só com extras). */
  aderenciaPct: number | null;
  totalAtividades: number;
};

const SEM_AREA = "Sem área";

/** Mesma regra usada em ModalDetalheDia.tsx (groupByArea) — nível 2 da EDT pras
 * importadas, "Sem área" pras extras (ou importadas sem areaPath). */
function areaDe(a: ActivityLike): string {
  return a.areaPath ? getAreaNivel2(a.areaPath) || SEM_AREA : SEM_AREA;
}

/** Nível 3 da EDT ("subárea", ex.: "COBERTURA" dentro de "GALPÃO") — só usada na
 * matriz semanal por Engenheiro, que mostra Área - Subárea - Atividade por linha. */
function subareaDe(a: ActivityLike): string {
  return a.areaPath ? getAreaNivel3(a.areaPath) : "";
}

export function buildRelatorioVisual(activities: ActivityLike[], partialWeight = 0.5): RelatorioVisual {
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
      subetapas: (a.subetapas ?? []).map((s) => ({ nome: s.nome, status: s.status })),
      subarea: subareaDe(a),
    });
  }
  // Primeiro por subárea (nível 3 da EDT), depois por nome da atividade — sem
  // isso, atividades de mesmo nome em subáreas diferentes (ex.: "Alvenaria
  // estrutural" na Portaria/Faturamento e na Portaria Secundária) ficavam
  // misturadas em ordem alfabética pura, sem nenhuma pista visual de que eram
  // lugares diferentes.
  for (const itens of map.values()) {
    itens.sort((x, y) => {
      const porSubarea = x.subarea.localeCompare(y.subarea, "pt-BR");
      if (porSubarea !== 0) return porSubarea;
      return x.nome.localeCompare(y.nome, "pt-BR");
    });
  }
  const areas = Array.from(map.entries())
    .sort(([a], [b]) => {
      if (a === SEM_AREA) return 1;
      if (b === SEM_AREA) return -1;
      return a.localeCompare(b, "pt-BR");
    })
    .map(([nome, itens]) => ({ nome, itens }));

  // Mesma fórmula de computeIndicators.aderencia (lib/adherence.ts) — extras não
  // entram no denominador, parciais valem meio crédito (partialWeight), e pendentes
  // CONTAM no denominador (diferente de "concluídas" e "não concluídas", que só
  // contam quem já foi marcado). Sem isso, o card mostrava uma "Aderência" que não
  // batia com o painel de indicadores do resto do app pro mesmo dia — ex.: 100% com
  // itens pendentes ainda na lista, porque pendente/parcial ficavam de fora da conta
  // dos dois lados.
  const planejadas = ativas.filter((a) => !a.is_extra);
  const concluidas = planejadas.filter((a) => a.status === "concluida").length;
  const naoConcluidas = planejadas.filter((a) => a.status === "nao_concluida").length;
  const denom = planejadas.length;
  const weighted = planejadas.reduce((s, a) => s + statusWeight(a.status, partialWeight), 0);

  return {
    areas,
    concluidas,
    naoConcluidas,
    aderenciaPct: denom > 0 ? Math.round((weighted / denom) * 100) : null,
    totalAtividades: ativas.length,
  };
}

// ---------- Matriz semanal por Engenheiro (SEX→QUI) ----------

export type LinhaMatriz = {
  taskKey: string;
  nome: string;
  edt: string | null;
  area: string;
  /** Nível 3 da EDT ("" quando a tarefa não tem esse nível) — exibida como
   * Área - Subárea - Atividade em cada linha da matriz semanal. */
  subarea: string;
  /** Cronograma de origem + UID da tarefa — permite resolver início/término reais no
   * cronograma (ver getActivityDetail em DailyProgramming.tsx); undefined/null em
   * extras manuais e em importações antigas sem esse vínculo. */
  source: string | undefined;
  taskUid: string | null | undefined;
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
  /** Mesmo critério de RelatorioVisual.aderenciaPct — ver ali. */
  aderenciaPct: number | null;
  totalAtividades: number;
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

export function buildMatrizSemanal(activities: ActivityLike[], weekDays: string[], partialWeight = 0.5): MatrizSemanal {
  // Mesmo critério de buildRelatorioVisual: itens inativados (em análise) somem da
  // matriz e das estatísticas.
  const ativas = activities.filter((a) => !a.inativa);
  const porEngenheiro = new Map<string, Map<string, LinhaMatriz>>();
  for (const a of ativas) {
    const engenheiro = a.foreman?.trim() || SEM_ENGENHEIRO;
    const taskKey = a.taskUid ?? a.id;
    if (!porEngenheiro.has(engenheiro)) porEngenheiro.set(engenheiro, new Map());
    const linhas = porEngenheiro.get(engenheiro)!;
    if (!linhas.has(taskKey))
      linhas.set(taskKey, { taskKey, nome: a.name, edt: a.stage, area: areaDe(a), subarea: subareaDe(a), source: a.source, taskUid: a.taskUid, porDia: {} });
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
      // card por área), depois por subárea, e só então por nome da tarefa — deixa os
      // itens da mesma área/subárea próximos em vez de intercalados em ordem
      // alfabética pura por tarefa.
      linhas: Array.from(linhasMap.values()).sort((x, y) => {
        if (x.area !== y.area) {
          if (x.area === SEM_AREA) return 1;
          if (y.area === SEM_AREA) return -1;
          return x.area.localeCompare(y.area, "pt-BR");
        }
        if (x.subarea !== y.subarea) return x.subarea.localeCompare(y.subarea, "pt-BR");
        return x.nome.localeCompare(y.nome, "pt-BR");
      }),
    }));

  // Mesma fórmula de computeIndicators.aderencia (ver buildRelatorioVisual acima).
  const planejadas = ativas.filter((a) => !a.is_extra);
  const concluidas = planejadas.filter((a) => a.status === "concluida").length;
  const naoConcluidas = planejadas.filter((a) => a.status === "nao_concluida").length;
  const denom = planejadas.length;
  const weighted = planejadas.reduce((s, a) => s + statusWeight(a.status, partialWeight), 0);

  return {
    weekDays,
    engenheiros,
    concluidas,
    naoConcluidas,
    aderenciaPct: denom > 0 ? Math.round((weighted / denom) * 100) : null,
    totalAtividades: ativas.length,
  };
}
