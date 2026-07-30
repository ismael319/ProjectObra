// Importação histórica da planilha "BDConcreto" (Excel/CSV legado da usina).
//
// Só transformação pura aqui (parse, normalização, agrupamento) — nada de
// Supabase. As buscas/gravações reais ficam em importer-db.ts, que consome
// o resultado de parseBDConcreto()/agruparEmCargas() daqui.

import { normalizarTexto, encontrarColuna, type LinhaTabela } from "@/lib/administracao/parse-shared";
import { computeCarga, type TracoConsumo } from "./concreto-utils";

// ---------- Traços canônicos (aba "Traço" da planilha, os 6 fck usados) ----------
// Valores conferidos linha a linha contra a aba Traço; usados pra (re)criar o
// cadastro de tracos_concreto na organização caso ainda não exista, e pra
// casar cada carga da BDConcreto com o traço certo via MPA. Não derivamos
// esses consumos das colunas de Cimento/Brita/etc. da própria BDConcreto
// porque elas têm outliers de digitação (conferido: FCK25 própria chega a
// variar de 275 a 5772 kg/m³ de cimento em algumas linhas).
export type TracoCanonico = {
  nome: string;
  fckMpa: number;
  consumo_cimento_kg_m3: number;
  consumo_brita00_kg_m3: number;
  consumo_brita01_kg_m3: number;
  consumo_po_brita_kg_m3: number;
  consumo_areia_kg_m3: number;
  consumo_agua_l_m3: number;
  consumo_aditivo1_l_m3: number;
  consumo_aditivo2_l_m3: number;
  preco_unitario_m3: number;
};

export const TRACOS_CANONICOS: TracoCanonico[] = [
  { nome: "CONCRETO FCK 10", fckMpa: 10, consumo_cimento_kg_m3: 131.25, consumo_brita00_kg_m3: 260, consumo_brita01_kg_m3: 810, consumo_po_brita_kg_m3: 0, consumo_areia_kg_m3: 881.5, consumo_agua_l_m3: 130.25, consumo_aditivo1_l_m3: 0, consumo_aditivo2_l_m3: 0, preco_unitario_m3: 274.6 },
  { nome: "CONCRETO FCK 15", fckMpa: 15, consumo_cimento_kg_m3: 225, consumo_brita00_kg_m3: 200, consumo_brita01_kg_m3: 800, consumo_po_brita_kg_m3: 0, consumo_areia_kg_m3: 865, consumo_agua_l_m3: 198, consumo_aditivo1_l_m3: 2.38, consumo_aditivo2_l_m3: 0, preco_unitario_m3: 378.9 },
  { nome: "CONCRETO FCK 20", fckMpa: 20, consumo_cimento_kg_m3: 262.5, consumo_brita00_kg_m3: 260, consumo_brita01_kg_m3: 810, consumo_po_brita_kg_m3: 0, consumo_areia_kg_m3: 820, consumo_agua_l_m3: 198, consumo_aditivo1_l_m3: 2.76, consumo_aditivo2_l_m3: 0, preco_unitario_m3: 416.2 },
  { nome: "CONCRETO FCK 25", fckMpa: 25, consumo_cimento_kg_m3: 275, consumo_brita00_kg_m3: 265, consumo_brita01_kg_m3: 810, consumo_po_brita_kg_m3: 0, consumo_areia_kg_m3: 810, consumo_agua_l_m3: 196, consumo_aditivo1_l_m3: 2.75, consumo_aditivo2_l_m3: 0, preco_unitario_m3: 426.76 },
  { nome: "CONCRETO FCK 30", fckMpa: 30, consumo_cimento_kg_m3: 293.75, consumo_brita00_kg_m3: 265, consumo_brita01_kg_m3: 805, consumo_po_brita_kg_m3: 0, consumo_areia_kg_m3: 795, consumo_agua_l_m3: 196, consumo_aditivo1_l_m3: 3, consumo_aditivo2_l_m3: 0, preco_unitario_m3: 444.59 },
  { nome: "CONCRETO FCK 40 PRÉ-MOLDADO", fckMpa: 40, consumo_cimento_kg_m3: 368.75, consumo_brita00_kg_m3: 255, consumo_brita01_kg_m3: 790, consumo_po_brita_kg_m3: 0, consumo_areia_kg_m3: 810, consumo_agua_l_m3: 175, consumo_aditivo1_l_m3: 0.37, consumo_aditivo2_l_m3: 2.95, preco_unitario_m3: 503.63 },
];

// ---------- Fornecedores canônicos ----------
export const FORNECEDOR_PROPRIA_NOME = "728 / 729 - FS CNP";
export const FORNECEDOR_EXTERNA_NOME = "RIO DO SANGUE";

export function classificarUsina(usinaRaw: string | null): "propria" | "externa" | null {
  const s = normalizarTexto(usinaRaw ?? "");
  if (s.includes("FS CNP")) return "propria";
  if (s.includes("RIO DO SANGUE")) return "externa";
  return null;
}

// ---------- Normalização mecânica de Etapa (texto livre da coluna U) ----------
// Só corrige grafia (espaço/acento/hífen/plural simples) — nunca funde
// conceitos diferentes (ex.: "PISO" continua separado de "PISO INCLINADO").
const ACCENT_FIX: [RegExp, string][] = [
  [/\bFUNDA[CÇ]AO\b/g, "FUNDAÇÃO"],
  [/\bCONTEN[CÇ]AO\b/g, "CONTENÇÃO"],
  [/\bEMERG[EÊ]NCIA\b/g, "EMERGÊNCIA"],
  [/\bINCL[NIJ]?NADO\b/g, "INCLINADO"],
  [/\bINCLJNADO\b/g, "INCLINADO"],
  [/\bINCLIADO\b/g, "INCLINADO"],
  [/\bA?ER[AÇ]{1,2}[OÕ]ES\b/g, "AERAÇÕES"],
  [/\bA?ERA[CÇ][AÃ]O\b/g, "AERAÇÃO"],
  [/\bEXTRA[CÇ][AÃ]O\b/g, "EXTRAÇÃO"],
  [/\bCLASSIFICA[CÇ][AÃ]O\b/g, "CLASSIFICAÇÃO"],
];

export function normalizarEtapa(raw: string | null): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  s = s.replace(/\s+/g, " ").toUpperCase();
  for (const [re, rep] of ACCENT_FIX) s = s.replace(re, rep);
  s = s.replace(/\bPR[EÉ]\s*-?\s*MOLDADOS?\b/g, "PRÉ-MOLDADO");
  s = s.replace(/\s*-\s*/g, (m, offset: number, str: string) => (str.slice(0, offset).endsWith("PRÉ") ? "-" : " "));
  s = s.replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Funde plural simples (S final) com o singular já visto, quando ambos existem. */
export function foldarPlurais(valores: string[]): Map<string, string> {
  const set = new Set(valores);
  const foldFor = new Map<string, string>();
  for (const v of set) {
    if (v.endsWith("S") && !v.endsWith("ÕES")) {
      const singular = v.slice(0, -1);
      if (set.has(singular)) foldFor.set(v, singular);
    }
  }
  return foldFor;
}

// ---------- Parsing numérico pt-BR ----------
export function parseNumeroPtBr(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "" || s === "-") return null;
  s = s.replace(/^R\$\s*/i, "").trim();
  s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ---------- Data DD/MM/AA -> ISO ----------
export function parseDataDDMMAA(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const m = String(raw).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, ddS, mmS, aaS] = m as unknown as [string, string, string, string];
  const dia = Number(ddS);
  const mes = Number(mmS);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const ano = aaS.length === 2 ? 2000 + Number(aaS) : Number(aaS);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// ---------- Header/linhas reais ----------
const COLUNAS = {
  data: ["Data"],
  usina: ["USINA"],
  numeroCarga: ["Número da Carga", "Numero da Carga"],
  pesoBalanca: ["Peso Da Balança", "Peso Balança"],
  quantidade: ["Quantidade"],
  mpa: ["MPA"],
  projeto: ["PROJETO"],
  etapa: ["APLICAÇÃO NA ETAPA DA OBRA", "APLICACAO NA ETAPA DA OBRA"],
  precoUnt: ["PREÇO UNT", "PRECO UNT"],
  observacoes: ["OBSERVAÇÕES", "OBSERVACOES"],
};

export type Problema = { linha: number; descricao: string };

export type LinhaBDConcreto = {
  linha: number; // 1-based, posição no arquivo original (pra mensagens de erro)
  data: string; // ISO
  usinaRaw: string;
  tipoOrigem: "propria" | "externa";
  numeroCarga: string | null;
  quantidadeM3: number;
  pesoBalancaKg: number | null;
  mpaRaw: string;
  tracoNome: string;
  projetoRaw: string;
  etapaNorm: string | null;
  precoUnitario: number | null;
  observacoes: string;
};

export type ResultadoParseBDConcreto = {
  linhas: LinhaBDConcreto[];
  problemas: Problema[];
  totalLinhasArquivo: number;
};

/**
 * Acha a linha de cabeçalho de verdade (a planilha tem uma linha "banner"
 * antes) e o fim dos dados reais (a exportação CSV do Excel arrasta até a
 * última linha da planilha, ~1 milhão de linhas em branco).
 */
export function parseBDConcreto(todasLinhas: LinhaTabela[]): ResultadoParseBDConcreto {
  const headerIdx = todasLinhas.findIndex((l) => l.some((c) => normalizarTexto(c) === "DATA"));
  if (headerIdx === -1) {
    return { linhas: [], problemas: [{ linha: 0, descricao: "Não encontrei a linha de cabeçalho (coluna 'Data')." }], totalLinhasArquivo: todasLinhas.length };
  }
  const header = todasLinhas[headerIdx]!;

  const idx = {
    data: encontrarColuna(header, COLUNAS.data),
    usina: encontrarColuna(header, COLUNAS.usina),
    numeroCarga: encontrarColuna(header, COLUNAS.numeroCarga),
    pesoBalanca: encontrarColuna(header, COLUNAS.pesoBalanca),
    quantidade: encontrarColuna(header, COLUNAS.quantidade),
    mpa: encontrarColuna(header, COLUNAS.mpa),
    projeto: encontrarColuna(header, COLUNAS.projeto),
    etapa: encontrarColuna(header, COLUNAS.etapa),
    precoUnt: encontrarColuna(header, COLUNAS.precoUnt),
    observacoes: encontrarColuna(header, COLUNAS.observacoes),
  };

  const faltando = Object.entries(idx).filter(([, i]) => i === -1).map(([k]) => k);
  if (faltando.length > 0) {
    return { linhas: [], problemas: [{ linha: headerIdx + 1, descricao: `Colunas não encontradas: ${faltando.join(", ")}.` }], totalLinhasArquivo: todasLinhas.length };
  }

  const linhas: LinhaBDConcreto[] = [];
  const problemas: Problema[] = [];

  for (let i = headerIdx + 1; i < todasLinhas.length; i++) {
    const row = todasLinhas[i]!;
    const dataRaw = (row[idx.data] ?? "").trim();
    if (dataRaw === "" || normalizarTexto(dataRaw) === "DATA") continue; // linha em branco ou cabeçalho repetido

    const numeroLinha = i + 1;
    const dataISO = parseDataDDMMAA(dataRaw);
    if (!dataISO) {
      problemas.push({ linha: numeroLinha, descricao: `Data inválida: "${dataRaw}".` });
      continue;
    }

    const usinaRaw = (row[idx.usina] ?? "").trim();
    const tipoOrigem = classificarUsina(usinaRaw);
    if (!tipoOrigem) {
      problemas.push({ linha: numeroLinha, descricao: `Usina não reconhecida: "${usinaRaw || "(vazio)"}".` });
      continue;
    }

    const quantidadeM3 = parseNumeroPtBr(row[idx.quantidade]);
    if (quantidadeM3 == null || quantidadeM3 <= 0) {
      problemas.push({ linha: numeroLinha, descricao: `Quantidade (m³) inválida: "${row[idx.quantidade]}".` });
      continue;
    }

    const mpaRaw = (row[idx.mpa] ?? "").trim();
    const tracoNome = mpaRaw.toUpperCase();
    const tracoConhecido = TRACOS_CANONICOS.some((t) => t.nome === tracoNome);
    if (!tracoConhecido) {
      problemas.push({ linha: numeroLinha, descricao: `Traço (MPA) não reconhecido: "${mpaRaw || "(vazio)"}".` });
      continue;
    }

    const numeroCarga = (row[idx.numeroCarga] ?? "").trim() || null;
    const projetoRaw = (row[idx.projeto] ?? "").trim();
    const etapaNorm = normalizarEtapa(row[idx.etapa] ?? "");
    const precoUnitario = parseNumeroPtBr(row[idx.precoUnt]);
    const pesoBalancaKg = parseNumeroPtBr(row[idx.pesoBalanca]);
    const observacoes = (row[idx.observacoes] ?? "").trim();

    linhas.push({
      linha: numeroLinha,
      data: dataISO,
      usinaRaw,
      tipoOrigem,
      numeroCarga,
      quantidadeM3,
      pesoBalancaKg,
      mpaRaw,
      tracoNome,
      projetoRaw,
      etapaNorm,
      precoUnitario,
      observacoes,
    });
  }

  // Fold de plural simples (BLOCO/BLOCOS etc.) — só dá pra decidir depois de
  // ver o conjunto inteiro de valores já normalizados.
  const fold = foldarPlurais(linhas.map((l) => l.etapaNorm).filter((v): v is string => v != null));
  if (fold.size > 0) {
    for (const l of linhas) {
      if (l.etapaNorm != null && fold.has(l.etapaNorm)) l.etapaNorm = fold.get(l.etapaNorm)!;
    }
  }

  return { linhas, problemas, totalLinhasArquivo: todasLinhas.length };
}

// ---------- Agrupamento em cargas + destinos ----------

export type DestinoAgrupado = {
  projetoRaw: string; // -> vira setor_id na resolução (importer-db.ts)
  etapaNorm: string | null; // -> vira area_id
  quantidadeM3Aplicada: number;
  observacao: string;
};

export type CargaAgrupada = {
  chave: string;
  linhasOrigem: number[]; // linhas do arquivo original, pra rastreio em problemas
  data: string;
  tipoOrigem: "propria" | "externa";
  numeroCarga: string | null;
  tracoNome: string;
  quantidadeM3: number;
  pesoBalancaKg: number | null;
  precoUnitario: number | null;
  destinos: DestinoAgrupado[];
  computed: ReturnType<typeof computeCarga>;
};

function tracoParaConsumo(nome: string): TracoConsumo {
  const t = TRACOS_CANONICOS.find((x) => x.nome === nome)!;
  return {
    consumo_cimento_kg_m3: t.consumo_cimento_kg_m3,
    consumo_brita00_kg_m3: t.consumo_brita00_kg_m3,
    consumo_brita01_kg_m3: t.consumo_brita01_kg_m3,
    consumo_po_brita_kg_m3: t.consumo_po_brita_kg_m3,
    consumo_areia_kg_m3: t.consumo_areia_kg_m3,
  };
}

/**
 * Linhas que compartilham Data+Usina+Número da Carga são a mesma carga
 * (o caminhão) espalhada em vários destinos — o volume é dividido em partes
 * iguais entre os destinos. Sem Número da Carga não dá pra agrupar com
 * segurança, então cada linha vira sua própria carga (1 destino).
 */
export function agruparEmCargas(linhas: LinhaBDConcreto[]): { cargas: CargaAgrupada[]; problemas: Problema[] } {
  const grupos = new Map<string, LinhaBDConcreto[]>();
  let semNumeroSeq = 0;
  for (const l of linhas) {
    const chave = l.numeroCarga
      ? `${l.data}|${l.tipoOrigem}|${l.numeroCarga}`
      : `SOLO|${l.data}|${l.tipoOrigem}|${l.linha}|${semNumeroSeq++}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(l);
  }

  const cargas: CargaAgrupada[] = [];
  const problemas: Problema[] = [];

  for (const [chave, grupo] of grupos.entries()) {
    const base = grupo[0]!;
    const linhasOrigem = grupo.map((g) => g.linha);

    const quantidades = new Set(grupo.map((g) => g.quantidadeM3));
    const tracos = new Set(grupo.map((g) => g.tracoNome));
    const pesos = new Set(grupo.map((g) => g.pesoBalancaKg));
    const precos = new Set(grupo.map((g) => g.precoUnitario));

    if (quantidades.size > 1 || tracos.size > 1) {
      problemas.push({
        linha: base.linha,
        descricao: `Carga ${chave}: linhas ${linhasOrigem.join(",")} têm quantidade ou traço divergentes entre si — usando os valores da primeira linha, revisar depois.`,
      });
    }
    if (pesos.size > 1 || precos.size > 1) {
      problemas.push({
        linha: base.linha,
        descricao: `Carga ${chave}: linhas ${linhasOrigem.join(",")} têm peso da balança ou preço unitário divergentes entre si — usando os valores da primeira linha, revisar depois.`,
      });
    }

    const n = grupo.length;
    const partePorDestino = base.quantidadeM3 / n;
    const destinos: DestinoAgrupado[] = grupo.map((g) => ({
      projetoRaw: g.projetoRaw,
      etapaNorm: g.etapaNorm,
      quantidadeM3Aplicada: partePorDestino,
      observacao: g.observacoes,
    }));

    const computed = computeCarga({
      data: base.data,
      tipo_origem: base.tipoOrigem,
      traco: tracoParaConsumo(base.tracoNome),
      quantidade_m3: base.quantidadeM3,
      peso_balanca_kg: base.tipoOrigem === "propria" ? base.pesoBalancaKg : base.pesoBalancaKg,
      preco_unitario: base.tipoOrigem === "externa" ? base.precoUnitario : null,
    });

    cargas.push({
      chave,
      linhasOrigem,
      data: base.data,
      tipoOrigem: base.tipoOrigem,
      numeroCarga: base.numeroCarga,
      tracoNome: base.tracoNome,
      quantidadeM3: base.quantidadeM3,
      pesoBalancaKg: base.pesoBalancaKg,
      precoUnitario: base.precoUnitario,
      destinos,
      computed,
    });
  }

  return { cargas, problemas };
}

// re-exported for the review UI (contagem de distintos por setor/área)
export function distintosComContagem(valores: (string | null)[]): { valor: string | null; total: number }[] {
  const m = new Map<string | null, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([valor, total]) => ({ valor, total })).sort((a, b) => b.total - a.total);
}
