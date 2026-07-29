import * as XLSX from "xlsx";

export type LinhaTabela = string[];

export type Problema = {
  linha: number;
  campo?: string;
  descricao: string;
};

function limparCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\r?\n/g, " ").trim();
}

function abaParaLinhas(workbook: XLSX.WorkBook, nomeAba: string): LinhaTabela[] {
  const planilha = workbook.Sheets[nomeAba]!;
  const linhasBrutas = XLSX.utils.sheet_to_json<unknown[]>(planilha, { header: 1, raw: false, defval: "" });
  return linhasBrutas.map((linha) => linha.map(limparCelula));
}

function planilhaParaLinhas(workbook: XLSX.WorkBook): LinhaTabela[] {
  const nomeAba = workbook.SheetNames[0];
  if (!nomeAba) return [];
  return abaParaLinhas(workbook, nomeAba);
}

// CSVs exportados de sistemas legados (ex.: relatório do Secullum) às vezes
// não vêm em UTF-8 puro. Decodifica como UTF-8 primeiro; se aparecer
// caractere de substituição (sinal de byte inválido nesse encoding), tenta
// de novo como Windows-1252, o encoding mais comum nesses exports antigos.
async function lerTextoComFallbackDeEncoding(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(buf);
}

// raw:true no XLSX.read (não só no sheet_to_json) é essencial: sem isso, o
// parser de CSV do SheetJS "ajuda" detectando texto tipo "07/12/2021" como
// data, reinterpreta como MM/DD (inglês) e ainda erra o dia por causa de
// arredondamento de fuso — "07/12/2021" virava "7/11/21". Com raw:true a
// célula fica exatamente como está escrita no arquivo; parseDataCelula (em
// cima do texto original) já sabe interpretar DD/MM/AAAA e serial do Excel.
async function lerWorkbook(file: File): Promise<XLSX.WorkBook> {
  const nomeLower = file.name.toLowerCase();
  if (nomeLower.endsWith(".csv")) {
    const texto = await lerTextoComFallbackDeEncoding(file);
    return XLSX.read(texto, { type: "string", raw: true });
  }
  const buf = await file.arrayBuffer();
  return XLSX.read(buf, { type: "array", raw: true });
}

export async function lerArquivoComoLinhas(file: File): Promise<LinhaTabela[]> {
  return planilhaParaLinhas(await lerWorkbook(file));
}

// Lê TODAS as abas do arquivo (não só a primeira) — a planilha de Controle de
// Efetivo costuma ter mais de uma aba (ex.: "Ativos" + "Demissões"), e a
// ordem das abas no arquivo não é garantida. O chamador tenta cada uma até
// achar a que tem o cabeçalho esperado (ver parseEfetivo).
export async function lerAbasComoLinhas(file: File): Promise<{ nome: string; linhas: LinhaTabela[] }[]> {
  const workbook = await lerWorkbook(file);
  return workbook.SheetNames.map((nome) => ({ nome, linhas: abaParaLinhas(workbook, nome) }));
}

// Faixa Unicode das marcas diacríticas combinantes (U+0300-U+036F) que
// sobram depois de normalize("NFD") separar uma letra acentuada em
// "letra base + acento". Escrita via \u explícito (não caractere literal)
// pra não depender de o arquivo ser salvo/lido em UTF-8 corretamente.
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/** Remove acentos, maiúsculas, colapsa espaço — chave de comparação/match. */
export function normalizarTexto(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(COMBINING_DIACRITICS, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Acha o índice da coluna cujo rótulo bate com algum dos candidatos.
 * 1ª passada: célula igual (exata) a algum candidato — evita colisão de
 * substring entre candidatos curtos (ex.: "MAT") e outro rótulo qualquer.
 * 2ª passada: candidato contido no rótulo — cobre variações tipo "Admissão"
 * vs "Data de Admissão", "F.S (Encarregado)" vs "Encarregado".
 */
export function encontrarColuna(header: LinhaTabela, candidatos: string[], ignorar: Set<number> = new Set()): number {
  const candidatosNorm = candidatos.map(normalizarTexto);
  const exata = header.findIndex(
    (celula, i) => !ignorar.has(i) && candidatosNorm.includes(normalizarTexto(celula))
  );
  if (exata !== -1) return exata;
  return header.findIndex((celula, i) => {
    if (ignorar.has(i)) return false;
    const norm = normalizarTexto(celula);
    return norm !== "" && candidatosNorm.some((c) => norm.includes(c));
  });
}

function excelSerialParaISO(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400 * 1000;
  const d = new Date(ms);
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** "DD/MM/AAAA" ou serial do Excel -> "AAAA-MM-DD" (formato aceito pelo Postgres). Null se não reconhecer. */
export function parseDataCelula(valor: string): string | null {
  const v = valor.trim();
  if (!v) return null;
  if (/^\d{4,6}$/.test(v)) {
    const serial = parseInt(v, 10);
    if (serial > 20000 && serial < 80000) return excelSerialParaISO(serial);
  }
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dia, mes, ano] = m;
    return `${ano}-${mes!.padStart(2, "0")}-${dia!.padStart(2, "0")}`;
  }
  return null;
}
