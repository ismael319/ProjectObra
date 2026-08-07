// Reconstrução de tabela a partir de texto posicionado (x/y) de um PDF — sem
// nenhuma dependência de pdfjs-dist aqui de propósito, pra dar pra testar
// (pdfjs-dist só carrega em navegador de verdade, usa DOMMatrix/Canvas que
// não existem no ambiente do Vitest). Quem lê o PDF em si é
// pdf-ensaios-estrutec.ts, que importa essas funções puras.

export type ItemPosicionado = { texto: string; x: number; xFim: number; y: number };
export type ColunaDetectada = { chave: string | null; xCentro: number };

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Agrupa itens da MESMA linha visual (y parecido) — tolerância de 3pt cobre
// pequenas diferenças de baseline entre textos vizinhos de fontes/tamanhos
// diferentes na mesma linha.
export function agruparLinhas(itens: ItemPosicionado[]): ItemPosicionado[][] {
  const ordenado = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas: ItemPosicionado[][] = [];
  for (const item of ordenado) {
    const ultima = linhas[linhas.length - 1];
    if (ultima && Math.abs(ultima[0]!.y - item.y) <= 3) {
      ultima.push(item);
    } else {
      linhas.push([item]);
    }
  }
  for (const linha of linhas) linha.sort((a, b) => a.x - b.x);
  return linhas;
}

// Decide qual coluna um texto de cabeçalho representa. Combinações de
// palavra (não uma só) evitam colisão entre colunas que compartilham um
// termo — ex. "RUPTURA" aparece em "Data de Ruptura", "Tipo de Ruptura" E
// "Ruptura (Ton)"; "FISCAL" aparece em "Nota Fiscal" E "Slump Nota Fiscal".
export function identificarColuna(textoNormalizado: string): string | null {
  const tem = (...palavras: string[]) => palavras.every((p) => textoNormalizado.includes(p));
  if (tem("FISCAL") && !tem("SLUMP")) return "NOTA FISCAL";
  if (textoNormalizado === "LAB") return "Nº CP";
  if (tem("CONCRETADA")) return "PEÇA CONCRETADA";
  if (tem("MOLDAGEM")) return "DATA MOLDAGEM";
  if (tem("RUPTURA", "TIPO")) return "TIPO DE RUPTURA";
  if (tem("RUPTURA", "DATA")) return "DATA RUPTURA";
  if (tem("IDADE")) return "IDADE";
  if (tem("SLUMP", "APLICACAO")) return "SLUMP";
  if (tem("TEMP")) return "TEMPERATURA";
  if (tem("FCJ")) return "FCJ";
  return null;
}

// Clusteriza os itens da região de cabeçalho por proximidade em X (não por
// linha — um rótulo quebrado em 2-3 linhas fica todo no mesmo X aproximado).
// Colunas SEM rótulo reconhecido (Volume, Obra, Horários, Slump Nota Fiscal,
// Adição de Água, Ruptura em Ton) são mantidas na lista com chave=null: sem
// isso, um valor de uma coluna irrelevante "vazaria" pra coluna reconhecida
// mais próxima durante o casamento das linhas de dado, contaminando o
// resultado.
export function detectarColunas(linhas: ItemPosicionado[][], inicio: number, fim: number): ColunaDetectada[] {
  const itensCabecalho: ItemPosicionado[] = [];
  for (let i = inicio; i < fim; i++) itensCabecalho.push(...(linhas[i] ?? []));
  if (itensCabecalho.length === 0) return [];

  const ordenado = [...itensCabecalho].sort((a, b) => a.x - b.x);
  const grupos: ItemPosicionado[][] = [];
  for (const item of ordenado) {
    const ultimo = grupos[grupos.length - 1];
    const ultimoItem = ultimo?.[ultimo.length - 1];
    if (ultimo && ultimoItem && item.x - ultimoItem.xFim < 12) {
      ultimo.push(item);
    } else {
      grupos.push([item]);
    }
  }

  return grupos.map((grupo) => ({
    chave: identificarColuna(normalizar(grupo.map((i) => i.texto).join(" "))),
    xCentro: grupo.reduce((s, i) => s + (i.x + i.xFim) / 2, 0) / grupo.length,
  }));
}

// Acha, numa linha, a coluna cujo centro X está mais perto do centro X do
// item — usado tanto pra montar cada linha de dado (pdf-ensaios-estrutec.ts)
// quanto testável isoladamente.
export function colunaMaisProxima(colunas: ColunaDetectada[], xCentroItem: number): ColunaDetectada | null {
  let melhor: ColunaDetectada | null = null;
  let melhorDist = Infinity;
  for (const col of colunas) {
    const dist = Math.abs(col.xCentro - xCentroItem);
    if (dist < melhorDist) {
      melhorDist = dist;
      melhor = col;
    }
  }
  return melhor;
}
