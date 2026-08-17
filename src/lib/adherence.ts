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
  /** "Não entra no plano desta semana": veio do cronograma por data (uma tarefa
   * em andamento que atravessa a semana), mas o engenheiro já sabe que estará
   * parada. Decidido ANTES de comprometer a semana, então não entra no baseline
   * nem em nenhum denominador — é o que evita ter que abusar de `inativa`, que
   * existe pro imprevisto no MEIO da semana e é justamente o que o alerta de
   * reprogramação incoerente sinaliza como maquiagem. */
  foraDoPlano?: boolean;
  motivoFora?: string | null;
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
  /** Aderência Ajustada do grupo — mesma base de computeIndicators (is_extra atual). */
  pct: number;
  /** Aderência do Cronograma do grupo — mesma base de computeIndicatorsCronograma
   * (isExtraOriginal, plano original antes de qualquer Extra/Inativa feito depois). */
  pctCronograma: number;
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
  // contra o PPC/aderência enquanto isso não for resolvido. Os marcados "fora
  // desta semana" também: nunca fizeram parte do plano.
  const ativas = activities.filter((a) => !a.inativa && !a.foraDoPlano);
  const planned = ativas.filter((a) => !a.is_extra);
  const total = ativas.length;
  const extras = total - planned.length;
  const denom = planned.length || 0;
  // As contagens usam o MESMO conjunto do denominador (planned), não `ativas`.
  // Contando sobre `ativas`, um extra concluído entrava no numerador do PPC sem
  // entrar no denominador — 2 planejadas concluídas + 1 extra concluída davam
  // PPC de 150%. E os cards "Concluídas/Parciais/Não Concluídas" mostravam um
  // conjunto enquanto o rótulo "Base: N atividade(s)" descrevia outro.
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
  // "Fora desta semana" sai daqui também: a decisão é tomada antes de a semana
  // começar, então a atividade não faz parte nem do plano original. Marcar Extra
  // ou Inativa DEPOIS continua sendo cobrado — é esse o ponto da função.
  const consideradas = activities.filter((a) => !a.foraDoPlano);
  const planned = consideradas.filter((a) => !(a.isExtraOriginal ?? a.is_extra));
  const total = consideradas.length;
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

function segmentKey(a: ActivityLike, field: "company" | "discipline" | "area" | "stage" | "foreman"): string {
  // Em atividades importadas (is_extra=false), `area` fica sempre null de propósito
  // (ver getWeek em programacao-db.ts) — o texto de verdade vem do nível 2 da EDT,
  // guardado em `areaPath`. Sem isso, "Aderência por Área" ficava sempre "(sem
  // valor)" pra tudo que veio do cronograma.
  const raw = field === "area" && !a.is_extra && a.areaPath ? getAreaNivel2(a.areaPath) : a[field];
  let texto = (raw ?? "(sem valor)").toString().trim() || "(sem valor)";
  // "Área" nunca deveria carregar o nível 3 (etapa) junto — só o nível 2, mesmo
  // corte de getAreaNivel2 (split em " / "). Cobre dois casos que escapavam da
  // linha acima: o texto livre de uma Extra, quando alguém cola o path inteiro
  // no campo em vez de só o nome da área; e o legado do campo `area` de
  // atividades antigas, de antes de existir `areaPath`, que guardavam
  // "Nível2 / Nível3" direto ali.
  if (field === "area" && texto.includes(" / ")) texto = texto.split(" / ")[0].trim() || "(sem valor)";
  return texto;
}

// O campo Área de uma atividade Extra é texto livre com autocomplete (não
// obrigatório escolher a sugestão) — "ARMAZÉM GRANDE" (vindo da EDT do
// cronograma, via segmentKey) e "Armazém Grande" (digitado à mão) viravam
// dois grupos diferentes em "Aderência por Área", cada um mostrando só
// parte da obra. Chave de agrupamento ignora maiúscula/minúscula, acento e
// espaço duplicado — mesmo texto "de verdade" cai no mesmo grupo.
function normalizeChave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function groupByNorm(
  activities: ActivityLike[],
  field: "company" | "discipline" | "area" | "stage" | "foreman",
): Map<string, ActivityLike[]> {
  const groups = new Map<string, ActivityLike[]>();
  for (const a of activities) {
    const norm = normalizeChave(segmentKey(a, field));
    const arr = groups.get(norm) ?? [];
    arr.push(a);
    groups.set(norm, arr);
  }
  return groups;
}

// Nome de exibição por chave normalizada: a grafia mais usada entre as
// atividades do grupo, não a primeira encontrada — um typo raro não deveria
// virar o rótulo do grupo inteiro.
function nomesDeExibicao(
  activities: ActivityLike[],
  field: "company" | "discipline" | "area" | "stage" | "foreman",
): Map<string, string> {
  const porChave = new Map<string, Map<string, number>>();
  for (const a of activities) {
    const raw = segmentKey(a, field);
    const norm = normalizeChave(raw);
    const variantes = porChave.get(norm) ?? new Map<string, number>();
    variantes.set(raw, (variantes.get(raw) ?? 0) + 1);
    porChave.set(norm, variantes);
  }
  const nomes = new Map<string, string>();
  for (const [norm, variantes] of porChave) {
    let melhor = "";
    let melhorContagem = -1;
    for (const [raw, contagem] of variantes) {
      if (contagem > melhorContagem) {
        melhor = raw;
        melhorContagem = contagem;
      }
    }
    nomes.set(norm, melhor);
  }
  return nomes;
}

export function computeSegment(
  activities: ActivityLike[],
  field: "company" | "discipline" | "area" | "stage" | "foreman",
  partialWeight = 0.5,
): SegmentRow[] {
  // "Cronograma" é o conjunto mais amplo (só exclui foraDoPlano) — ver
  // computeIndicatorsCronograma. "Ajustada" é sempre um subconjunto dele
  // (exclui também inativa), então o nome de exibição escolhido aqui já
  // cobre os dois grupos.
  const consideradas = activities.filter((x) => !x.foraDoPlano);
  const nomes = nomesDeExibicao(consideradas, field);

  // Dois conjuntos diferentes, um por métrica — mesma distinção de
  // computeIndicators x computeIndicatorsCronograma. Ajustada exclui
  // "inativa" (em análise, fora do número enquanto isso). Cronograma NÃO
  // exclui: é o ponto de existir — se o time "limpa" a Ajustada marcando
  // item como inativa, o Cronograma continua cobrando o compromisso
  // original. Se as duas usassem o mesmo conjunto filtrado, os inativos que
  // derrubam o Cronograma agregado (computeIndicatorsCronograma, que também
  // não os exclui) ficariam invisíveis aqui, inflando o Cronograma por grupo.
  const groupsAjustada = groupByNorm(consideradas.filter((x) => !x.inativa), field);
  const groupsCronograma = groupByNorm(consideradas, field);

  const chaves = new Set([...groupsAjustada.keys(), ...groupsCronograma.keys()]);
  const rows: SegmentRow[] = [];
  for (const chave of chaves) {
    const listAjustada = groupsAjustada.get(chave) ?? [];
    const planned = listAjustada.filter((a) => !a.is_extra);
    const denom = planned.length;
    const w = planned.reduce((s, a) => s + statusWeight(a.status, partialWeight), 0);

    const listCronograma = groupsCronograma.get(chave) ?? [];
    const plannedCronograma = listCronograma.filter((a) => !(a.isExtraOriginal ?? a.is_extra));
    const denomCronograma = plannedCronograma.length;
    const wCronograma = plannedCronograma.reduce((s, a) => s + statusWeight(a.status, partialWeight), 0);

    rows.push({
      name: nomes.get(chave) ?? chave,
      count: listAjustada.length,
      pct: denom ? w / denom : 0,
      pctCronograma: denomCronograma ? wCronograma / denomCronograma : 0,
    });
  }
  // Tabelas/gráficos de aderência sempre do maior pro menor — não por volume,
  // pra quem está pior aparecer/comparar tão fácil quanto quem está melhor.
  rows.sort((a, b) => b.pct - a.pct);
  return rows;
}

// ============ Baseline / Análise Semanal ============

export interface BaselineActivity {
  activity_id: string
  name: string
  planned_date: string
  /** Status no instante do snapshot. Com o baseline tirado no INÍCIO da semana
   * (comprometerSemana), é sempre "pendente" — o resultado vem do status atual
   * da atividade, não daqui. Só serve pra ler baselines antigos, gravados no
   * fechamento. */
  status: ActivityStatus
  is_extra: boolean
  inativa?: boolean
  is_extra_original?: boolean
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

/**
 * PPC/aderência do PLANO COMPROMETIDO: o baseline define o CONJUNTO, o status
 * vem do estado ATUAL de cada atividade.
 *
 * Com o snapshot tirado no início da semana (comprometerSemana), todo status no
 * baseline é "pendente" — ler o status congelado, como a versão anterior fazia,
 * daria 0% sempre. E quando o snapshot era tirado no fechamento, o baseline era
 * uma fotocópia do resultado e o delta contra a aderência atual dava ~zero: a
 * conta comparava o fechamento com ele mesmo.
 *
 * Regras:
 * - Denominador = itens não-extras do baseline. Fixo: é o compromisso assumido.
 * - Atividade do baseline **apagada depois conta como não concluída**. Se saísse
 *   do denominador, excluir a linha viraria a forma mais fácil de subir o
 *   número (finalizarAtividade já apaga linhas dos dias seguintes).
 * - Inativar depois **também não tira do denominador** — diferente de
 *   computeIndicators. Ficou comprometida; o caminho pra não entrar na conta era
 *   marcar "fora desta semana" ANTES de comprometer.
 */
export function computeIndicatorsComprometido(
  baseline: BaselineActivity[],
  currentActivities: ActivityLike[],
  partialWeight = 0.5,
): WeekIndicators {
  const statusAtual = new Map(currentActivities.map((a) => [a.id, a.status]));
  const planned = baseline.filter((a) => !a.is_extra);
  const total = baseline.length;
  const extras = total - planned.length;
  const denom = planned.length;

  // Item que sumiu da programação: "nao_concluida", nunca "pendente" — pendente
  // e não concluída pesam 0 igual, mas a contagem exibida precisa dizer que o
  // compromisso foi quebrado, não que ainda está em aberto.
  const efetivo = planned.map((b) => statusAtual.get(b.activity_id) ?? "nao_concluida");

  const concluidas = efetivo.filter((s) => s === "concluida").length;
  const parciais = efetivo.filter((s) => s === "parcial").length;
  const naoConcluidas = efetivo.filter((s) => s === "nao_concluida").length;
  const pendentes = efetivo.filter((s) => s === "pendente").length;
  const weighted = efetivo.reduce((s, st) => s + statusWeight(st, partialWeight), 0);

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

/**
 * Taxa de acerto de UM dia: das atividades comprometidas PARA aquele dia,
 * quantas foram entregues.
 *
 * O conjunto sai de `week_baseline.planned_date` — o dia em que cada atividade
 * foi comprometida — e não da programação atual. Essa distinção é o que faz o
 * número significar alguma coisa: "Não realizadas" MOVE a linha de dia
 * (moverAtividadesParaDia troca planned_date), então, olhando só a programação
 * atual, arrastar uma pendência de ontem pra hoje faz o acerto de ontem SUBIR —
 * a não concluída simplesmente some de ontem — e ela ainda passa a parecer
 * programada pra hoje desde o início. Contra o baseline, nenhuma das duas coisas
 * acontece: ontem continua cobrando o que prometeu, e hoje não ganha um item que
 * nunca prometeu.
 *
 * Devolve null quando não há plano comprometido pro dia (semana ainda em
 * montagem, ou dia sem nada no baseline) — sem compromisso não há taxa de
 * acerto, e mostrar 0% seria mentira.
 */
export function computeIndicatorsDia(
  baseline: BaselineActivity[],
  currentActivities: ActivityLike[],
  dia: string,
  partialWeight = 0.5,
): WeekIndicators | null {
  const doDia = baseline.filter((b) => b.planned_date === dia);
  if (doDia.length === 0) return null;
  return computeIndicatorsComprometido(doDia, currentActivities, partialWeight);
}

/**
 * Dia em que cada atividade foi comprometida, por activity_id. Alimenta o selo
 * "veio de <data>" nas linhas que foram arrastadas de outro dia.
 */
export function diaComprometidoPorAtividade(
  baseline: BaselineActivity[],
): Map<string, string> {
  return new Map(baseline.map((b) => [b.activity_id, b.planned_date]));
}

/**
 * Resumo da análise semanal: o que foi comprometido × o que aconteceu.
 *
 * O `delta` agora compara a aderência do PLANO COMPROMETIDO com a aderência
 * ATUAL (que ignora extras e inativas). Positivo grande = o conjunto foi mexido
 * a favor do número: itens comprometidos viraram extra/inativa ou foram
 * apagados, e a conta "atual" deixou de cobrá-los. Antes, com o baseline tirado
 * no fechamento, esse delta era estruturalmente ~zero e não dizia nada.
 */
export function computeWeekAnalysisSummary(
  baseline: BaselineActivity[],
  currentActivities: ActivityLike[],
  partialWeight = 0.5,
): WeekAnalysisSummary {
  const baselineIds = new Set(baseline.map(b => b.activity_id))
  const porId = new Map(currentActivities.map(a => [a.id, a]))

  // Itens que continuam existindo
  const stillExist = baseline.filter(b => porId.has(b.activity_id))

  // Entregue x não entregue: sempre pelo status ATUAL. Lido do status do
  // baseline, "Concluídos" contava o que já estava concluído no snapshot — com o
  // snapshot no início da semana, isso é zero por construção.
  const concluidasNoBaseline = stillExist.filter(
    b => porId.get(b.activity_id)!.status === "concluida",
  ).length

  // Não concluídos: inclui os removidos, que são compromisso quebrado também.
  const naoConcluidas = baseline.filter(b => {
    const atual = porId.get(b.activity_id)
    if (!atual) return true
    return atual.status !== "concluida" && atual.status !== "parcial"
  }).length

  // Reprogramados (mudaram de dia)
  const reprogramadas = stillExist.filter(
    b => porId.get(b.activity_id)!.planned_date !== b.planned_date,
  ).length

  // Extras adicionados depois de comprometer
  const extrasAdicionados = currentActivities.filter(a =>
    !baselineIds.has(a.id) && a.is_extra
  ).length

  // Removidos depois de comprometer
  const removidos = baseline.filter(b => !porId.has(b.activity_id)).length

  const indicComprometido = computeIndicatorsComprometido(baseline, currentActivities, partialWeight)
  const indicAtual = computeIndicators(currentActivities, partialWeight)

  return {
    totalBaseline: baseline.length,
    totalAtual: currentActivities.length,
    concluidasNoBaseline,
    naoConcluidas,
    reprogramadas,
    extrasAdicionados,
    removidos,
    aderenciaBaseline: indicComprometido.aderencia,
    aderenciaAtual: indicAtual.aderencia,
    delta: indicAtual.aderencia - indicComprometido.aderencia,
  }
}
