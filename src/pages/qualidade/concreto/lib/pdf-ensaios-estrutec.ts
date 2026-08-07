// Extrai a tabela de corpos de prova de um relatório de ensaio em PDF no
// layout do laboratório Estrutec e converte pro mesmo formato de linhas
// (cabeçalho + linhas) que parseEnsaiosConcreto (importer-ensaios.ts) já
// sabe validar/importar — reaproveita o pipeline inteiro do importador de
// planilha, só troca a etapa de leitura do arquivo.
//
// Como funciona: pdfjs-dist devolve cada pedaço de texto do PDF com sua
// posição (x,y) na página — não existe estrutura de "tabela" no PDF em si.
// A reconstrução da tabela (linhas por Y, colunas por X — ver
// pdf-tabela-utils.ts) é pura e sem dependência de pdfjs-dist de propósito,
// pra dar pra testar; aqui só fica a leitura do arquivo em si.
//
// Isso é heurístico e específico do layout do Estrutec (decisão com o
// Gustavo em 2026-08-07: só esse laboratório por enquanto) — um PDF de outro
// laboratório, ou uma mudança no modelo do relatório, pode não ser
// reconhecido. Cada linha extraída ainda passa pela validação normal de
// parseEnsaiosConcreto antes de importar (data/idade/Fcj inválidos viram
// "problema", não corrompem o banco), mas colunas vizinhas mal separadas
// podem gerar um valor tecnicamente válido só que errado (ex.: Slump trocado
// com Temperatura) — a tela de importação mostra uma prévia das linhas
// extraídas antes de confirmar, exatamente por causa desse risco residual.
//
// NUNCA TESTADO CONTRA UM PDF REAL DA ESTRUTEC — só contra a descrição do
// layout (print compartilhado). Calibrar contra um arquivo de verdade antes
// de confiar cegamente no resultado.

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { LinhaTabela } from "@/lib/administracao/parse-shared";
import { normalizar, agruparLinhas, detectarColunas, colunaMaisProxima, type ItemPosicionado, type ColunaDetectada } from "./pdf-tabela-utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const NOME_LABORATORIO_PADRAO = "ESTRUTEC";

// Cabeçalho sintético que a gente monta (não o do PDF) — usa exatamente os
// rótulos que parseEnsaiosConcreto já reconhece (ver COLUNAS em
// importer-ensaios.ts), pra reaproveitar o parser/validador sem duplicar
// nada.
const HEADER_SINTETICO: LinhaTabela = [
  "NOTA FISCAL",
  "LABORATÓRIO",
  "Nº CP",
  "PEÇA CONCRETADA",
  "DATA MOLDAGEM",
  "DATA RUPTURA",
  "IDADE (DIAS)",
  "SLUMP",
  "TEMPERATURA",
  "FCJ (MPa)",
  "TIPO DE RUPTURA",
];

async function extrairItensPorPagina(file: File): Promise<ItemPosicionado[][]> {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const paginas: ItemPosicionado[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const itens: ItemPosicionado[] = [];
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number };
      const texto = (item.str ?? "").trim();
      if (!texto || !item.transform) continue;
      const x = item.transform[4]!;
      const y = item.transform[5]!;
      itens.push({ texto, x, xFim: x + (item.width ?? 0), y });
    }
    paginas.push(itens);
  }
  return paginas;
}

export type ResultadoExtracaoPdf = {
  linhas: LinhaTabela[];
  linhasDeDados: number;
  paginasProcessadas: number;
};

export async function extrairTabelaPdfEstrutec(file: File): Promise<ResultadoExtracaoPdf> {
  const paginas = await extrairItensPorPagina(file);
  const todosItens = paginas.flat();

  if (!todosItens.some((i) => normalizar(i.texto).includes("ESTRUTEC"))) {
    throw new Error(
      'Não reconheci este PDF como um relatório da Estrutec (único layout suportado hoje). Envie a planilha em "Importar resultados" em vez disso.',
    );
  }

  // Colunas detectadas na 1ª página com tabela — reaproveitadas nas páginas
  // seguintes (o cabeçalho normalmente não se repete quando a tabela
  // continua numa 2ª página).
  let colunas: ColunaDetectada[] = [];
  for (const itensPagina of paginas) {
    const linhas = agruparLinhas(itensPagina);
    const idxPrimeiraLinhaDados = linhas.findIndex((l) => l.some((it) => /^\d{2}\/\d{2}\/\d{4}$/.test(it.texto)));
    if (idxPrimeiraLinhaDados <= 0) continue;
    colunas = detectarColunas(linhas, 0, idxPrimeiraLinhaDados);
    if (colunas.some((c) => c.chave)) break;
  }

  if (!colunas.some((c) => c.chave === "NOTA FISCAL")) {
    throw new Error("Não consegui reconhecer as colunas da tabela de corpos de prova neste PDF.");
  }

  const linhasSaida: LinhaTabela[] = [HEADER_SINTETICO];

  for (const itensPagina of paginas) {
    const linhas = agruparLinhas(itensPagina);
    const idxPrimeiraLinhaDados = linhas.findIndex((l) => l.some((it) => /^\d{2}\/\d{2}\/\d{4}$/.test(it.texto)));
    if (idxPrimeiraLinhaDados === -1) continue;

    for (let i = idxPrimeiraLinhaDados; i < linhas.length; i++) {
      const porColuna = new Map<string, string[]>();
      for (const item of linhas[i]!) {
        const xCentroItem = (item.x + item.xFim) / 2;
        const melhor = colunaMaisProxima(colunas, xCentroItem);
        if (!melhor?.chave) continue; // mais perto de uma coluna irrelevante (ou nenhuma) — descarta
        const lista = porColuna.get(melhor.chave) ?? [];
        lista.push(item.texto);
        porColuna.set(melhor.chave, lista);
      }

      const notaFiscal = (porColuna.get("NOTA FISCAL") ?? []).join(" ").trim();
      if (!notaFiscal) continue; // linha sem nota fiscal reconhecida — não é uma linha de CP (rodapé, assinatura...)

      linhasSaida.push([
        notaFiscal,
        NOME_LABORATORIO_PADRAO,
        (porColuna.get("Nº CP") ?? []).join(" ").trim(),
        (porColuna.get("PEÇA CONCRETADA") ?? []).join(" ").trim(),
        (porColuna.get("DATA MOLDAGEM") ?? []).join(" ").trim(),
        (porColuna.get("DATA RUPTURA") ?? []).join(" ").trim(),
        (porColuna.get("IDADE") ?? []).join(" ").trim(),
        (porColuna.get("SLUMP") ?? []).join(" ").trim(),
        (porColuna.get("TEMPERATURA") ?? []).join(" ").trim(),
        (porColuna.get("FCJ") ?? []).join(" ").trim(),
        (porColuna.get("TIPO DE RUPTURA") ?? []).join(" ").trim(),
      ]);
    }
  }

  return { linhas: linhasSaida, linhasDeDados: linhasSaida.length - 1, paginasProcessadas: paginas.length };
}
