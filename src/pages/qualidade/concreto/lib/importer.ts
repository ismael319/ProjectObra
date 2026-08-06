// Importação de cargas de concreto — o arquivo importado segue exatamente o
// mesmo formato de colunas do "Exportar tudo" (excel-export.ts), fechando o
// ciclo exportar → editar em Excel → reimportar. Cada LINHA do arquivo é uma
// CARGA inteira (não um destino por linha) — uma carga com vários destinos
// junta PROJETO/ETAPA/OBSERVAÇÕES com "; ", um trecho por destino, na mesma
// ordem (mesma lógica de excel-export.ts's destinosCampo()).
//
// Só transformação pura aqui (parse, normalização) — nada de Supabase. As
// buscas/gravações reais ficam em importer-db.ts, que consome o resultado de
// parseCargasConcreto() daqui.

import { normalizarTexto, encontrarColuna, type LinhaTabela } from "@/lib/administracao/parse-shared";

// ---------- Traços canônicos (seed inicial do cadastro de Traços) ----------
// Valores conferidos linha a linha contra a aba Traço da BDConcreto original;
// usados só pra garantir que toda organização nova já tenha esses 6 traços
// cadastrados (ver seedTracosCanonicos em importer-db.ts) — o traço de cada
// carga importada é resolvido pelo NOME contra o cadastro de Traços da
// organização (canônico ou próprio), nunca inventado a partir do arquivo.
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

// ---------- Data ----------
// O DATA exportado é sempre "DD/MM/AAAA" (texto, 4 dígitos de ano — ver
// formatBR/HEADERS em excel-export.ts). Mas o arquivo pode ter sido reaberto
// no Excel entre exportar e reimportar, e a célula de texto vira uma data de
// verdade sem eu ter como evitar (Excel faz isso sozinho ao só abrir/tocar
// numa coluna que "parece" data). Isso dispara uma pegadinha conhecida do
// SheetJS: ao ler (raw:false) uma célula de data com o formato genérico
// "Data Curta" (numFmtId 14), ele SEMPRE devolve o texto em ordem americana
// M/D/AA — mesmo quando o Excel EXIBE a mesma célula em dd/mm/aaaa (locale
// pt-BR). Não é o usuário digitando errado: é a biblioteca de leitura
// ignorando o locale do arquivo. Exemplo real: célula mostra "29/07/2026" no
// Excel, mas chega aqui como texto "7/29/26".
//
// Por isso a ordem dia/mês só é assumida quando os dois valores permitem
// (≤12 e ≤31 nas posições certas); quando só uma ordem é matematicamente
// possível (ex.: "7/29/26", 29 não pode ser mês), usa essa — cobre a
// pegadinha do SheetJS sem quebrar o caso comum. Também aceita ano de 2 ou 4
// dígitos e cai pro serial do Excel como último recurso.
//
// MAS quando os dois valores são ≤12 (ex.: célula real é 5 de março, o
// SheetJS entrega "3/5/26") não tem como saber qual é qual só pelo texto —
// nesses casos o resultado pode sair errado em silêncio. Por isso
// parseCargasConcreto() prefere o valor CRU (serial do Excel, sem ambiguidade
// nenhuma) quando ele está disponível — ver resolverData() logo abaixo; este
// parser de texto só entra como último recurso (célula que já era texto
// puro, nunca virou data de verdade no Excel).
function parseDataImportada(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  if (v === "") return null;

  if (/^\d{4,6}$/.test(v)) {
    const serial = parseInt(v, 10);
    if (serial > 20000 && serial < 80000) return serialExcelParaISO(serial);
  }

  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const [, aS, bS, anoS] = m as unknown as [string, string, string, string];
  const a = Number(aS);
  const b = Number(bS);
  const ano = anoS.length === 2 ? 2000 + Number(anoS) : Number(anoS);

  if (a >= 1 && a <= 31 && b >= 1 && b <= 12) {
    return `${ano}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`; // a=dia, b=mês
  }
  if (b >= 1 && b <= 31 && a >= 1 && a <= 12) {
    return `${ano}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`; // a=mês, b=dia
  }
  return null;
}

function serialExcelParaISO(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// Resolve a data cruzando o grid CRU (raw:true — vem de
// lerArquivoComoLinhasEBruto) com o texto formatado: se a célula é um
// SERIAL de verdade (número), usa ele direto, sem qualquer ambiguidade de
// dia/mês. Só cai pro texto quando não há valor cru disponível (arquivo lido
// só com lerArquivoComoLinhas) ou a célula nunca foi um número (texto puro
// digitado, CSV, etc.).
function resolverData(rawTexto: string | undefined, rawBruto: unknown): string | null {
  if (typeof rawBruto === "number" && rawBruto > 20000 && rawBruto < 80000) {
    return serialExcelParaISO(rawBruto);
  }
  return parseDataImportada(rawTexto);
}

// ---------- Header/linhas reais ----------
// Mesmos rótulos usados por HEADERS em excel-export.ts — encontrarColuna já
// ignora acento/maiúscula/minúscula na comparação.
const COLUNAS = {
  data: ["DATA"],
  fornecedor: ["FORNECEDOR"],
  origem: ["ORIGEM"],
  numeroCarga: ["Nº CARGA", "N CARGA", "NUMERO DA CARGA", "N° CARGA"],
  traco: ["TRAÇO", "TRACO"],
  quantidade: ["QTD (m³)", "QTD (M3)", "QUANTIDADE"],
  pesoBalanca: ["PESO BALANÇA (kg)", "PESO BALANCA (KG)"],
  precoTotal: ["PREÇO TOTAL", "PRECO TOTAL"],
  destino: ["DESTINO(S)", "DESTINO"],
  projeto: ["PROJETO"],
  etapa: ["ETAPA"],
  observacoes: ["OBSERVAÇÕES", "OBSERVACOES"],
  validado: ["VALIDADO"],
  lancadoPor: ["LANÇADO POR", "LANCADO POR"],
} as const;

// Colunas sem as quais não dá pra resolver a carga — as demais (Nº carga,
// peso balança, preço total, observações, validado, lançado por) são
// opcionais e ficam null/default quando ausentes.
const COLUNAS_OBRIGATORIAS = ["data", "fornecedor", "origem", "traco", "quantidade", "projeto", "etapa"] as const;

export type Problema = { linha: number; descricao: string };

export type DestinoImportado = {
  projetoRaw: string; // -> vira area_id na resolução (importer-db.ts)
  etapaNorm: string | null; // -> vira etapa_concreto_id
  quantidadeM3Aplicada: number;
  observacao: string;
};

export type CargaImportada = {
  linha: number; // 1-based, posição no arquivo original (pra mensagens de erro)
  data: string; // ISO
  fornecedorNome: string;
  tipoOrigem: "propria" | "externa";
  numeroCarga: string | null;
  tracoNome: string;
  quantidadeM3: number;
  pesoBalancaKg: number | null;
  precoTotal: number | null;
  validado: boolean;
  lancadoPorNome: string | null;
  destinos: DestinoImportado[];
};

export type ResultadoParseCargas = {
  cargas: CargaImportada[];
  problemas: Problema[];
  totalLinhasArquivo: number;
};

function splitCampo(raw: string | undefined): string[] {
  const s = (raw ?? "").trim();
  if (s === "") return [];
  return s.split(";").map((v) => v.trim());
}

function classificarOrigem(raw: string | undefined): "propria" | "externa" | null {
  const n = normalizarTexto(raw ?? "");
  if (n === "PROPRIA") return "propria";
  if (n === "EXTERNA") return "externa";
  return null;
}

// DESTINO(S) traz "Área — volume m³" por trecho (mesmo formato de
// destinosTexto() em excel-export.ts) — cruza cada trecho com o Projeto na
// mesma posição pra recuperar o volume real de cada destino, em vez de
// sempre dividir a quantidade da carga em partes iguais. Só usa esse volume
// quando o número de trechos bate exatamente com o número de Projetos e
// todo trecho tem um volume reconhecível; qualquer divergência (coluna
// ausente, editada à mão de forma incompatível) cai de volta pra divisão
// igual, sem travar a importação.
function parseVolumesDestino(raw: string | undefined, esperado: number): number[] | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  const partes = s.split(";").map((v) => v.trim());
  if (partes.length !== esperado) return null;

  const volumes: number[] = [];
  for (const parte of partes) {
    const m = parte.match(/—\s*([\d.,]+)\s*m³\s*$/);
    if (!m) return null;
    const vol = parseNumeroPtBr(m[1]);
    if (vol == null) return null;
    volumes.push(vol);
  }
  return volumes;
}

/**
 * Acha a linha de cabeçalho de verdade (procura a coluna "DATA") e lê cada
 * linha seguinte como UMA carga completa. Uma carga com mais de um destino
 * tem PROJETO/ETAPA/OBSERVAÇÕES com vários trechos separados por "; ", na
 * mesma ordem — o volume de cada destino vem da coluna DESTINO(S) (formato
 * "Área — Xm³", cruzado por posição com PROJETO); se essa coluna não existir
 * ou não bater, cai pra dividir a quantidade da carga em partes iguais.
 *
 * `todasLinhasBrutas` (grid raw:true, de lerArquivoComoLinhasEBruto) é
 * opcional mas recomendado — sem ele, a coluna DATA cai pro parser de texto
 * (parseDataImportada), que não consegue resolver toda ambiguidade de
 * dia/mês sozinho.
 */
export function parseCargasConcreto(todasLinhas: LinhaTabela[], todasLinhasBrutas?: unknown[][]): ResultadoParseCargas {
  const headerIdx = todasLinhas.findIndex((l) => l.some((c) => normalizarTexto(c) === "DATA"));
  if (headerIdx === -1) {
    return { cargas: [], problemas: [{ linha: 0, descricao: 'Não encontrei a linha de cabeçalho (coluna "DATA").' }], totalLinhasArquivo: todasLinhas.length };
  }
  const header = todasLinhas[headerIdx]!;

  const idx = {
    data: encontrarColuna(header, [...COLUNAS.data]),
    fornecedor: encontrarColuna(header, [...COLUNAS.fornecedor]),
    origem: encontrarColuna(header, [...COLUNAS.origem]),
    numeroCarga: encontrarColuna(header, [...COLUNAS.numeroCarga]),
    traco: encontrarColuna(header, [...COLUNAS.traco]),
    quantidade: encontrarColuna(header, [...COLUNAS.quantidade]),
    pesoBalanca: encontrarColuna(header, [...COLUNAS.pesoBalanca]),
    precoTotal: encontrarColuna(header, [...COLUNAS.precoTotal]),
    destino: encontrarColuna(header, [...COLUNAS.destino]),
    projeto: encontrarColuna(header, [...COLUNAS.projeto]),
    etapa: encontrarColuna(header, [...COLUNAS.etapa]),
    observacoes: encontrarColuna(header, [...COLUNAS.observacoes]),
    validado: encontrarColuna(header, [...COLUNAS.validado]),
    lancadoPor: encontrarColuna(header, [...COLUNAS.lancadoPor]),
  };

  const faltando = COLUNAS_OBRIGATORIAS.filter((k) => idx[k] === -1);
  if (faltando.length > 0) {
    return { cargas: [], problemas: [{ linha: headerIdx + 1, descricao: `Colunas não encontradas: ${faltando.join(", ")}. O arquivo precisa seguir o mesmo formato do "Exportar tudo".` }], totalLinhasArquivo: todasLinhas.length };
  }

  const cargas: CargaImportada[] = [];
  const problemas: Problema[] = [];

  for (let i = headerIdx + 1; i < todasLinhas.length; i++) {
    const row = todasLinhas[i]!;
    const dataRaw = (row[idx.data] ?? "").trim();
    if (dataRaw === "" || normalizarTexto(dataRaw) === "DATA") continue; // linha em branco ou cabeçalho repetido

    const numeroLinha = i + 1;
    const dataISO = resolverData(dataRaw, todasLinhasBrutas?.[i]?.[idx.data]);
    if (!dataISO) {
      problemas.push({ linha: numeroLinha, descricao: `Data inválida: "${dataRaw}".` });
      continue;
    }

    const fornecedorNome = (row[idx.fornecedor] ?? "").trim();
    if (!fornecedorNome) {
      problemas.push({ linha: numeroLinha, descricao: "Fornecedor em branco." });
      continue;
    }

    const tipoOrigem = classificarOrigem(row[idx.origem]);
    if (!tipoOrigem) {
      problemas.push({ linha: numeroLinha, descricao: `Origem não reconhecida: "${row[idx.origem] || "(vazio)"}" (esperado "Própria" ou "Externa").` });
      continue;
    }

    const quantidadeM3 = parseNumeroPtBr(row[idx.quantidade]);
    if (quantidadeM3 == null || quantidadeM3 <= 0) {
      problemas.push({ linha: numeroLinha, descricao: `Quantidade (m³) inválida: "${row[idx.quantidade]}".` });
      continue;
    }

    const tracoNome = (row[idx.traco] ?? "").trim();
    if (!tracoNome) {
      problemas.push({ linha: numeroLinha, descricao: "Traço em branco." });
      continue;
    }

    const projetos = splitCampo(row[idx.projeto]);
    if (projetos.length === 0) {
      problemas.push({ linha: numeroLinha, descricao: "Nenhum Projeto (destino) informado." });
      continue;
    }
    const etapas = splitCampo(row[idx.etapa]);
    const observacoesTodas = idx.observacoes !== -1 ? splitCampo(row[idx.observacoes]) : [];

    const volumesDestino = idx.destino !== -1 ? parseVolumesDestino(row[idx.destino], projetos.length) : null;
    const partePorDestino = quantidadeM3 / projetos.length;
    const destinos: DestinoImportado[] = projetos.map((projetoRaw, di) => ({
      projetoRaw,
      etapaNorm: etapas[di]?.trim() || null,
      quantidadeM3Aplicada: volumesDestino ? volumesDestino[di]! : partePorDestino,
      observacao: observacoesTodas[di]?.trim() ?? "",
    }));

    const numeroCarga = idx.numeroCarga !== -1 ? (row[idx.numeroCarga] ?? "").trim() || null : null;
    const pesoBalancaKg = idx.pesoBalanca !== -1 ? parseNumeroPtBr(row[idx.pesoBalanca]) : null;
    const precoTotal = idx.precoTotal !== -1 ? parseNumeroPtBr(row[idx.precoTotal]) : null;
    const validado = idx.validado === -1 || normalizarTexto(row[idx.validado] ?? "") !== "NAO";
    const lancadoPorNome = idx.lancadoPor !== -1 ? (row[idx.lancadoPor] ?? "").trim() || null : null;

    cargas.push({
      linha: numeroLinha,
      data: dataISO,
      fornecedorNome,
      tipoOrigem,
      numeroCarga,
      tracoNome,
      quantidadeM3,
      pesoBalancaKg,
      precoTotal,
      validado,
      lancadoPorNome,
      destinos,
    });
  }

  return { cargas, problemas, totalLinhasArquivo: todasLinhas.length };
}

// re-exported for the review UI (contagem de distintos por Projeto/Traço)
export function distintosComContagem(valores: (string | null)[]): { valor: string | null; total: number }[] {
  const m = new Map<string | null, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([valor, total]) => ({ valor, total })).sort((a, b) => b.total - a.total);
}
