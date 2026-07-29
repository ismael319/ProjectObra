import { encontrarColuna, parseDataCelula, type LinhaTabela, type Problema } from "./parse-shared";

export type PontoParseado = {
  linha: number;
  matricula: string;
  matriculaNormalizada: string;
  data: string;
  presente: boolean;
  horarioEntrada: string | null;
  horarioSaida: string | null;
};

export type ResultadoParsePonto = {
  linhas: PontoParseado[];
  problemas: Problema[];
};

const REGEX_DATA = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const REGEX_HORA = /^\d{1,2}:\d{2}$/;

const CANDIDATOS_ENT_SAI = [
  ["ENT. 1", "ENT.1", "ENT 1"],
  ["SAI. 1", "SAI.1", "SAI 1", "SAÍ. 1"],
  ["ENT. 2", "ENT.2", "ENT 2"],
  ["SAI. 2", "SAI.2", "SAI 2", "SAÍ. 2"],
  ["ENT. 3", "ENT.3", "ENT 3"],
  ["SAI. 3", "SAI.3", "SAI 3", "SAÍ. 3"],
  ["ENT. 4", "ENT.4", "ENT 4"],
  ["SAI. 4", "SAI.4", "SAI 4", "SAÍ. 4"],
];

/** Trim + remove zeros à esquerda inconsistentes (mesmo dado pode vir "0651" ou "651"). */
export function normalizarMatricula(valor: string): string {
  const v = valor.trim();
  if (/^\d+$/.test(v)) return String(parseInt(v, 10));
  return v.toUpperCase();
}

function acharLinhaCabecalho(linhas: LinhaTabela[]): number {
  for (let i = 0; i < Math.min(linhas.length, 10); i++) {
    if (encontrarColuna(linhas[i]!, ["DATA"]) !== -1 && encontrarColuna(linhas[i]!, ["NOME"]) !== -1) {
      return i;
    }
  }
  return -1;
}

export function parsePonto(linhas: LinhaTabela[]): ResultadoParsePonto {
  const idxCabecalho = acharLinhaCabecalho(linhas);
  if (idxCabecalho === -1) {
    return { linhas: [], problemas: [{ linha: 0, descricao: "Não encontrei uma linha de cabeçalho com colunas DATA e NOME nas primeiras linhas do arquivo." }] };
  }

  const header = linhas[idxCabecalho]!;
  const colData = encontrarColuna(header, ["DATA"]);
  const colMatricula = encontrarColuna(header, ["MATRICULA", "MAT"]);

  if (colMatricula === -1) {
    return {
      linhas: [],
      problemas: [{
        linha: idxCabecalho + 1,
        descricao: "Não encontrei a coluna Matrícula no cabeçalho. Gere o relatório de novo no Secullum com essa coluna habilitada — o match contra o cadastro é feito por matrícula, não por nome.",
      }],
    };
  }

  const colunasEntSai = CANDIDATOS_ENT_SAI.map((candidatos) => encontrarColuna(header, candidatos)).filter((i) => i !== -1);

  const problemas: Problema[] = [];
  const resultado: PontoParseado[] = [];

  // Linha válida = DATA bate DD/MM/AAAA — isso já descarta sozinho título,
  // período, cabeçalho repetido a cada página, rodapé ("Emitido em...",
  // "www.secullum...") e a linha TOTAL FINAL no fim do relatório.
  linhas.slice(idxCabecalho + 1).forEach((linha, offset) => {
    const numeroLinha = idxCabecalho + 2 + offset;
    const dataRaw = (linha[colData] ?? "").trim();
    if (!REGEX_DATA.test(dataRaw)) return;

    const matriculaRaw = (linha[colMatricula] ?? "").trim();
    if (!matriculaRaw) {
      problemas.push({ linha: numeroLinha, campo: "matricula", descricao: "Linha com data válida mas sem matrícula — ignorada." });
      return;
    }

    const data = parseDataCelula(dataRaw)!;
    const valoresEntSai = colunasEntSai.map((c) => (linha[c] ?? "").trim());
    const presente = valoresEntSai.some((v) => REGEX_HORA.test(v));
    const horarioEntrada = colunasEntSai[0] !== undefined ? (linha[colunasEntSai[0]] ?? "").trim() : "";
    const horarioSaida = colunasEntSai[1] !== undefined ? (linha[colunasEntSai[1]] ?? "").trim() : "";

    resultado.push({
      linha: numeroLinha,
      matricula: matriculaRaw,
      matriculaNormalizada: normalizarMatricula(matriculaRaw),
      data,
      presente,
      horarioEntrada: REGEX_HORA.test(horarioEntrada) ? horarioEntrada : null,
      horarioSaida: REGEX_HORA.test(horarioSaida) ? horarioSaida : null,
    });
  });

  return { linhas: resultado, problemas };
}
