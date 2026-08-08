// Extrai a tabela de corpos de prova de um relatório de ensaio em PDF no
// layout do laboratório Estrutec e converte pro mesmo formato de linhas
// (cabeçalho + linhas) que parseEnsaiosConcreto (importer-ensaios.ts) já
// sabe validar/importar — reaproveita o pipeline inteiro do importador de
// planilha, só troca a etapa de leitura do arquivo.

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { LinhaTabela } from "@/lib/administracao/parse-shared";
import { normalizar, agruparLinhas, colunaMaisProxima, type ItemPosicionado, type ColunaDetectada } from "./pdf-tabela-utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const NOME_LABORATORIO_PADRAO = "ESTRUTEC";

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

// Detecta colunas usando a 1ª linha de dados como âncora: acha as datas
// DD/MM/AAAA e usa as posições X delas pra mapear as colunas da tabela.
// Funciona mesmo quando o cabeçalho tem múltiplas linhas ou colunas muy
// próximas.
function detectarColunasComAncora(linhaDados: ItemPosicionado[]): ColunaDetectada[] {
  // Coleta as datas (DD/MM/AAAA) e seus centros X
  const datas = linhaDados
    .filter((it) => /^\d{2}\/\d{2}\/\d{4}$/.test(it.texto))
    .map((it) => ({ texto: it.texto, xCentro: (it.x + it.xFim) / 2 }))
    .sort((a, b) => a.xCentro - b.xCentro);

  // Coleta todos os itens numéricos/texto da linha de dados
  const todosItens = linhaDados
    .filter((it) => it.texto.trim() !== "")
    .map((it) => ({ texto: it.texto, x: it.x, xFim: it.xFim, xCentro: (it.x + it.xFim) / 2 }))
    .sort((a, b) => a.x - b.x);

  if (datas.length < 1) return [];

  // Mapeamento fixo baseado no layout padrão do Estrutec:
  // Colunas à esquerda das datas: Lab, Obra, Nota Fiscal, Volume, Peça, Horários
  // Colunas de datas: Data Moldagem (1ª data), Data Ruptura (2ª data)
  // Colunas à direita das datas: Idade, Slump, Slump NF, Água, Temp, Ruptura Ton, Fcj, Tipo

  const colunas: ColunaDetectada[] = [];

  // Acha itens de cabeçalho no header (procura por keywords)
  const itensHeader = linhaDados; // por agora, usa a linha de dados também

  // NOTA FISCAL: procuro o número "3165" (que é a nota fiscal) — ele aparece
  // como um número de 4+ dígitos antes da primeira data
  const notaFiscalItem = todosItens.find((it) => /^\d{4,}$/.test(it.texto) && it.xCentro < datas[0]!.xCentro);
  if (notaFiscalItem) {
    colunas.push({ chave: "NOTA FISCAL", xCentro: notaFiscalItem.xCentro });
  }

  // DATA MOLDAGEM e DATA RUPTURA: as duas primeiras datas
  if (datas.length >= 1) {
    colunas.push({ chave: "DATA MOLDAGEM", xCentro: datas[0]!.xCentro });
  }
  if (datas.length >= 2) {
    colunas.push({ chave: "DATA RUPTURA", xCentro: datas[1]!.xCentro });
  }

  // IDADE: primeiro número inteiro após a 2ª data
  const xAposDatas = datas.length >= 2 ? datas[1]!.xCentro : datas[0]!.xCentro;
  const idadeItem = todosItens.find((it) => /^\d{1,3}$/.test(it.texto) && it.xCentro > xAposDatas);
  if (idadeItem) {
    colunas.push({ chave: "IDADE", xCentro: idadeItem.xCentro });

    // FCJ: está depois de Idade e Slump — procuro por número com 2 casas (ex: 21,40 ou 20,65)
    const fcjItem = todosItens.find((it) => /^\d+[,.]\d{1,2}$/.test(it.texto) && it.xCentro > idadeItem.xCentro);
    if (fcjItem) {
      colunas.push({ chave: "FCJ", xCentro: fcjItem.xCentro });
    }

    // TIPO DE RUPTURA: letra (A-F) após Fcj
    const tipoItem = todosItens.find((it) => /^[A-F]$/.test(it.texto) && it.xCentro > (fcjItem?.xCentro ?? idadeItem.xCentro));
    if (tipoItem) {
      colunas.push({ chave: "TIPO DE RUPTURA", xCentro: tipoItem.xCentro });
    }

    // PEÇA CONCRETADA: texto longo à esquerda das datas
    const pecaItem = todosItens.find((it) => it.texto.length > 10 && it.xCentro < datas[0]!.xCentro && !/^\d+$/.test(it.texto));
    if (pecaItem) {
      colunas.push({ chave: "PEÇA CONCRETADA", xCentro: pecaItem.xCentro });
    }

    // SLUMP: número de 2 dígitos entre Idade e Fcj (tipicamente 14-20 cm)
    const slumpItem = todosItens.find((it) => /^\d{2}$/.test(it.texto) && it.xCentro > idadeItem.xCentro && it.xCentro < (fcjItem?.xCentro ?? Infinity));
    if (slumpItem) {
      colunas.push({ chave: "SLUMP", xCentro: slumpItem.xCentro });
    }

    // TEMPERatura: número entre Slump e Fcj
    const tempItem = todosItens.find((it) => /^\d{1,2}$/.test(it.texto) && it.xCentro > (slumpItem?.xCentro ?? idadeItem.xCentro) && it.xCentro < (fcjItem?.xCentro ?? Infinity) && it !== slumpItem);
    if (tempItem) {
      colunas.push({ chave: "TEMPERATURA", xCentro: tempItem.xCentro });
    }
  }

  return colunas;
}

export async function extrairTabelaPdfEstrutec(file: File): Promise<ResultadoExtracaoPdf> {
  const paginas = await extrairItensPorPagina(file);

  // Procura a 1ª linha de dados (contém uma data DD/MM/AAAA) em qualquer página
  let colunas: ColunaDetectada[] = [];
  let linhasDados: ItemPosicionado[][] = [];

  for (const itensPagina of paginas) {
    const linhas = agruparLinhas(itensPagina);
    const idx = linhas.findIndex((l) => l.some((it) => /^\d{2}\/\d{2}\/\d{4}$/.test(it.texto)));
    if (idx > 0) {
      // Usa a 1ª linha de dados como âncora
      colunas = detectarColunasComAncora(linhas[idx]!);
      if (colunas.length >= 3) {
        // Coleta todas as linhas de dados (a partir da 1ª com data)
        linhasDados = linhas.slice(idx);
        break;
      }
    }
  }

  if (colunas.length === 0 || linhasDados.length === 0) {
    throw new Error(
      'Não consegui reconhecer a tabela de corpos de prova neste PDF. Envie a planilha em "Importar resultados" em vez disso.',
    );
  }

  const linhasSaida: LinhaTabela[] = [HEADER_SINTETICO];

  for (const linha of linhasDados) {
    const porColuna = new Map<string, string[]>();
    for (const item of linha) {
      const xCentroItem = (item.x + item.xFim) / 2;
      const melhor = colunaMaisProxima(colunas, xCentroItem);
      if (!melhor?.chave) continue;
      const lista = porColuna.get(melhor.chave) ?? [];
      lista.push(item.texto);
      porColuna.set(melhor.chave, lista);
    }

    const notaFiscal = (porColuna.get("NOTA FISCAL") ?? []).join(" ").trim();
    if (!notaFiscal) continue;

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

  return { linhas: linhasSaida, linhasDeDados: linhasSaida.length - 1, paginasProcessadas: paginas.length };
}
