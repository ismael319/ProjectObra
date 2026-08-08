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
// Detecção de colunas: a âncora (posição dos próprios valores da 1ª linha de
// dados — datas, idade, tipo de ruptura) é o método PRINCIPAL pros campos
// obrigatórios da importação (Nota Fiscal, Data Moldagem, Data Ruptura,
// Idade, Fcj), porque eles têm formato bem definido (regex) e não dependem
// de separar corretamente os rótulos do cabeçalho. Isso importa porque, no
// PDF real da Estrutec, "Data de Moldagem" e "Data de Ruptura" ficam perto
// demais uma da outra — o agrupamento por texto do cabeçalho (detectarColunas
// em pdf-tabela-utils.ts) gruda as duas num cabeçalho só, e a coluna
// resultante (só "DATA MOLDAGEM") acaba puxando as DUAS datas da linha,
// gerando "13/07/2026 20/07/2026" como se fosse uma data só. O cabeçalho só
// é usado como complemento pra "Peça Concretada" (texto livre, sem padrão
// numérico pra âncora reconhecer sozinha).
// Cada linha extraída ainda passa pela validação normal de
// parseEnsaiosConcreto antes de importar (data/idade/Fcj inválidos viram
// "problema", não corrompem o banco), mas colunas vizinhas mal separadas
// podem gerar um valor tecnicamente válido só que errado — a tela de
// importação mostra uma prévia das linhas extraídas antes de confirmar,
// exatamente por causa desse risco residual.

import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { LinhaTabela } from "@/lib/administracao/parse-shared";
import { agruparLinhas, detectarColunas, colunaMaisProxima, type ItemPosicionado, type ColunaDetectada } from "./pdf-tabela-utils";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const NOME_LABORATORIO_PADRAO = "ESTRUTEC";
const REGEX_DATA = /^\d{2}\/\d{2}\/\d{4}$/;

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

// Detecta colunas usando a 1ª linha de dados como âncora — acha as datas
// DD/MM/AAAA e os marcadores mais previsíveis (idade, tipo de ruptura) e
// mapeia o resto por posição relativa a eles.
function detectarColunasComAncora(linhaDados: ItemPosicionado[]): ColunaDetectada[] {
  const datas = linhaDados
    .filter((it) => REGEX_DATA.test(it.texto))
    .map((it) => ({ texto: it.texto, xCentro: (it.x + it.xFim) / 2 }))
    .sort((a, b) => a.xCentro - b.xCentro);
  if (datas.length < 1) return [];

  const todosItens = linhaDados
    .filter((it) => it.texto.trim() !== "")
    .map((it) => ({ texto: it.texto, x: it.x, xFim: it.xFim, xCentro: (it.x + it.xFim) / 2 }))
    .sort((a, b) => a.x - b.x);

  const colunas: ColunaDetectada[] = [];

  // NOTA FISCAL: no layout padrão, antes da 1ª data vêm 4 números em
  // sequência — Lab, Obra, Nota Fiscal, Volume (nessa ordem) — Nota Fiscal é
  // o penúltimo. "Lab" (o 1º) vira Nº CP — é o número que o laboratório dá
  // pro corpo de prova individual, ÚNICO por linha (2 CPs da mesma carga na
  // mesma idade, comum, têm "Lab" diferente) — sem ele, o casamento com o
  // banco (importer-ensaios-db.ts) não consegue distinguir 2 CPs distintos
  // moldados pra mesma idade. Os do meio (Obra, Volume) não têm coluna
  // própria reconhecida: sem reservar uma coluna (chave=null) pra eles, os
  // números vazam juntos pro bucket da Nota Fiscal (mesmo problema do
  // Ruptura (Ton) x Fcj).
  const numerosAntesDasDatas = todosItens.filter((it) => /^\d+$/.test(it.texto) && it.xCentro < datas[0]!.xCentro);
  const idxNotaFiscal = numerosAntesDasDatas.length >= 2 ? numerosAntesDasDatas.length - 2 : 0;
  numerosAntesDasDatas.forEach((it, idx) => {
    const chave = idx === idxNotaFiscal ? "NOTA FISCAL" : idx === 0 && idxNotaFiscal > 0 ? "Nº CP" : null;
    colunas.push({ chave, xCentro: it.xCentro });
  });

  colunas.push({ chave: "DATA MOLDAGEM", xCentro: datas[0]!.xCentro });
  if (datas.length >= 2) {
    colunas.push({ chave: "DATA RUPTURA", xCentro: datas[1]!.xCentro });
  }

  const xAposDatas = datas.length >= 2 ? datas[1]!.xCentro : datas[0]!.xCentro;
  const idadeItem = todosItens.find((it) => /^\d{1,3}$/.test(it.texto) && it.xCentro > xAposDatas);
  if (idadeItem) {
    colunas.push({ chave: "IDADE", xCentro: idadeItem.xCentro });
  }

  // TIPO DE RUPTURA (letra A-F, sempre a última coluna) é a âncora mais
  // confiável pro lado direito da tabela. Os dois decimais logo à esquerda
  // dela são, nessa ordem, Ruptura (Ton) e Fcj (MPa) — sem reservar uma
  // coluna (chave=null) pra Ruptura (Ton), o valor dela vaza pro bucket do
  // Fcj, já que não sobra nenhuma coluna reconhecida mais perto pra
  // absorver (mesmo raciocínio do Início/Fim perto das datas).
  const tipoItem = [...todosItens].reverse().find((it) => /^[A-F]$/.test(it.texto) && it.xCentro > (idadeItem?.xCentro ?? xAposDatas));
  const decimaisAntesDoTipo = tipoItem
    ? todosItens.filter((it) => /^\d+[,.]\d{1,2}$/.test(it.texto) && it.xCentro < tipoItem.xCentro).sort((a, b) => b.xCentro - a.xCentro)
    : (idadeItem ? todosItens.filter((it) => /^\d+[,.]\d{1,2}$/.test(it.texto) && it.xCentro > idadeItem.xCentro) : []);
  const fcjItem = decimaisAntesDoTipo[0];
  const rupturaTonItem = decimaisAntesDoTipo[1];
  if (fcjItem) {
    colunas.push({ chave: "FCJ", xCentro: fcjItem.xCentro });
  }
  if (rupturaTonItem) {
    colunas.push({ chave: null, xCentro: rupturaTonItem.xCentro });
  }
  if (tipoItem) {
    colunas.push({ chave: "TIPO DE RUPTURA", xCentro: tipoItem.xCentro });
  }

  if (idadeItem) {
    // SLUMP: número de 2 dígitos entre Idade e Fcj (tipicamente 14-20 cm)
    const slumpItem = todosItens.find((it) => /^\d{2}$/.test(it.texto) && it.xCentro > idadeItem.xCentro && it.xCentro < (fcjItem?.xCentro ?? Infinity));
    if (slumpItem) {
      colunas.push({ chave: "SLUMP", xCentro: slumpItem.xCentro });
    }

    // TEMPERATURA: número entre Slump e Fcj
    const tempItem = todosItens.find((it) => /^\d{1,2}$/.test(it.texto) && it.xCentro > (slumpItem?.xCentro ?? idadeItem.xCentro) && it.xCentro < (fcjItem?.xCentro ?? Infinity) && it !== slumpItem);
    if (tempItem) {
      colunas.push({ chave: "TEMPERATURA", xCentro: tempItem.xCentro });
    }
  }

  return colunas;
}

export async function extrairTabelaPdfEstrutec(file: File): Promise<ResultadoExtracaoPdf> {
  const paginas = await extrairItensPorPagina(file);

  // Sem checagem de "ESTRUTEC" no texto: no PDF real, a logomarca (que tem
  // esse nome) é uma imagem, não texto extraível — quem valida se é o
  // layout certo é o próprio reconhecimento de colunas logo abaixo.
  // Colunas detectadas na 1ª página com tabela — reaproveitadas nas páginas
  // seguintes (o cabeçalho normalmente não se repete quando a tabela
  // continua numa 2ª página).
  let colunas: ColunaDetectada[] = [];
  for (const itensPagina of paginas) {
    const linhas = agruparLinhas(itensPagina);
    const idxPrimeiraLinhaDados = linhas.findIndex((l) => l.some((it) => REGEX_DATA.test(it.texto)));
    if (idxPrimeiraLinhaDados <= 0) continue;

    const porAncora = detectarColunasComAncora(linhas[idxPrimeiraLinhaDados]!);
    if (!porAncora.some((c) => c.chave === "NOTA FISCAL")) continue;

    // Peça Concretada é texto livre (sem padrão numérico pra âncora achar
    // sozinha) — complementa com o que o texto do cabeçalho reconhecer,
    // sem mexer nos campos que a âncora já resolveu.
    const porCabecalho = detectarColunas(linhas, 0, idxPrimeiraLinhaDados);
    const peca = porCabecalho.find((c) => c.chave === "PEÇA CONCRETADA");
    if (peca) porAncora.push(peca);

    colunas = porAncora;
    break;
  }

  if (!colunas.some((c) => c.chave === "NOTA FISCAL")) {
    throw new Error("Não consegui reconhecer as colunas da tabela de corpos de prova neste PDF.");
  }

  const linhasSaida: LinhaTabela[] = [HEADER_SINTETICO];

  for (const itensPagina of paginas) {
    const linhas = agruparLinhas(itensPagina);
    const idxPrimeiraLinhaDados = linhas.findIndex((l) => l.some((it) => REGEX_DATA.test(it.texto)));
    if (idxPrimeiraLinhaDados === -1) continue;

    for (let i = idxPrimeiraLinhaDados; i < linhas.length; i++) {
      const linha = linhas[i]!;
      // Uma linha de CP de verdade sempre tem Data de Moldagem E Data de
      // Ruptura — sem isso, é rodapé/assinatura (ex.: data e "Comprometidos
      // com sua Satisfação." perto da assinatura), não uma linha da tabela.
      if (linha.filter((it) => REGEX_DATA.test(it.texto)).length < 2) continue;

      const porColuna = new Map<string, string[]>();
      for (const item of linha) {
        const xCentroItem = (item.x + item.xFim) / 2;
        const melhor = colunaMaisProxima(colunas, xCentroItem);
        if (!melhor?.chave) continue; // mais perto de uma coluna irrelevante (ou nenhuma) — descarta
        // Início/Fim (horário de concretagem) aparecem como "-" perto das
        // colunas de data — só aceita nas colunas de data um token que
        // realmente pareça uma data, pra não grudar "-" nelas.
        if ((melhor.chave === "DATA MOLDAGEM" || melhor.chave === "DATA RUPTURA") && !REGEX_DATA.test(item.texto)) continue;
        // Mesma lógica pro Fcj: "-" de Adição de Água/Temperatura (quando
        // essas colunas não têm valor) e o "-" nas colunas sem dado não
        // podem contar como resultado.
        if (melhor.chave === "FCJ" && !/^\d+[,.]\d{1,2}$/.test(item.texto)) continue;
        // E pra Nota Fiscal/Nº CP: só número puro (Obra/Volume têm coluna
        // reservada própria, mas texto perdido — ex.: um fragmento de Peça
        // Concretada — não pode grudar aqui).
        if ((melhor.chave === "NOTA FISCAL" || melhor.chave === "Nº CP") && !/^\d+$/.test(item.texto)) continue;
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
