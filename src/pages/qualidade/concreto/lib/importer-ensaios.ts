// Importação em lote de resultados de ensaio de compressão axial — cada
// LINHA do arquivo é UM corpo de prova rompido (formato de tabela de
// relatório de laboratório: uma carga costuma gerar várias linhas, uma por
// CP). Só transformação pura aqui (parse, validação de formato); a
// resolução contra o banco (achar a carga, achar/criar o corpo de prova,
// gravar o ensaio) fica em importer-ensaios-db.ts — mesma separação de
// importer.ts/importer-db.ts.

import { normalizarTexto, encontrarColuna, parseDataCelula, type LinhaTabela } from "@/lib/administracao/parse-shared";
import { parseNumeroPtBr } from "./importer";

// parseDataCelula aceita "DD/MM/AAAA" sem checar se dia/mês estão numa faixa
// real (ex.: "32/13/2026" vira o texto "2026-13-32" sem erro) — suficiente
// pro uso original (RH), mas aqui precisamos rejeitar isso como inválido.
// Confere reconstruindo a data e comparando os componentes de volta.
function parseDataValida(raw: string): string | null {
  const iso = parseDataCelula(raw);
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m! - 1 || dt.getUTCDate() !== d) return null;
  return iso;
}

const COLUNAS = {
  identificacao: ["Nº CARGA", "N CARGA", "NOTA FISCAL", "Nº FISCAL", "N FISCAL", "COD. LABORATÓRIO", "COD LABORATORIO"],
  dataMoldagem: ["DATA MOLDAGEM", "DATA DE MOLDAGEM"],
  laboratorio: ["LABORATÓRIO", "LABORATORIO"],
  numeroLab: ["Nº CP", "N CP", "NUMERO CP", "Nº LAB", "N LAB"],
  pecaConcretada: ["PEÇA CONCRETADA", "PECA CONCRETADA", "ESTRUTURA"],
  idade: ["IDADE (DIAS)", "IDADE"],
  dataRuptura: ["DATA RUPTURA", "DATA DE RUPTURA"],
  fcj: ["FCJ (MPA)", "FCJ", "RESULTADO (MPA)", "RESULTADO"],
  tipoRuptura: ["TIPO DE RUPTURA", "TIPO RUPTURA"],
  temperatura: ["TEMPERATURA", "TEMPERATURA DO CONCRETO"],
  slump: ["SLUMP"],
  observacoes: ["OBSERVAÇÕES", "OBSERVACOES"],
} as const;

const COLUNAS_OBRIGATORIAS = ["identificacao", "dataMoldagem", "idade", "dataRuptura", "fcj"] as const;

export type Problema = { linha: number; descricao: string };

export type EnsaioImportado = {
  linha: number; // 1-based, posição no arquivo original
  identificacaoCarga: string; // casa contra nota_fiscal OU numero_carga
  dataMoldagem: string; // ISO
  laboratorioNome: string | null;
  numeroLab: string | null;
  pecaConcretada: string | null;
  idadePrevistaDias: number;
  dataRupturaReal: string; // ISO
  resultadoMpa: number;
  tipoRuptura: string | null;
  temperaturaConcreto: number | null;
  slumpAplicacao: number | null;
  observacoes: string | null;
};

export type ResultadoParseEnsaios = {
  itens: EnsaioImportado[];
  problemas: Problema[];
};

const TIPOS_RUPTURA_VALIDOS = new Set(["A", "B", "C", "D", "E", "F"]);

function parseTipoRuptura(raw: string | undefined): string | null {
  const v = normalizarTexto(raw ?? "");
  if (v === "") return null;
  // aceita tanto "A" quanto "A - CONICA" (primeiro caractere já resolve).
  const letra = v[0];
  return letra && TIPOS_RUPTURA_VALIDOS.has(letra) ? letra : null;
}

export function parseEnsaiosConcreto(todasLinhas: LinhaTabela[]): ResultadoParseEnsaios {
  const headerIdx = todasLinhas.findIndex((l) => l.some((c) => COLUNAS.identificacao.some((cand) => normalizarTexto(c) === normalizarTexto(cand))));
  if (headerIdx === -1) {
    return { itens: [], problemas: [{ linha: 0, descricao: 'Não encontrei a linha de cabeçalho (coluna "Nº CARGA" ou "NOTA FISCAL").' }] };
  }
  const header = todasLinhas[headerIdx]!;

  const idx = {
    identificacao: encontrarColuna(header, [...COLUNAS.identificacao]),
    dataMoldagem: encontrarColuna(header, [...COLUNAS.dataMoldagem]),
    laboratorio: encontrarColuna(header, [...COLUNAS.laboratorio]),
    numeroLab: encontrarColuna(header, [...COLUNAS.numeroLab]),
    pecaConcretada: encontrarColuna(header, [...COLUNAS.pecaConcretada]),
    idade: encontrarColuna(header, [...COLUNAS.idade]),
    dataRuptura: encontrarColuna(header, [...COLUNAS.dataRuptura]),
    fcj: encontrarColuna(header, [...COLUNAS.fcj]),
    tipoRuptura: encontrarColuna(header, [...COLUNAS.tipoRuptura]),
    temperatura: encontrarColuna(header, [...COLUNAS.temperatura]),
    slump: encontrarColuna(header, [...COLUNAS.slump]),
    observacoes: encontrarColuna(header, [...COLUNAS.observacoes]),
  };

  const faltando = COLUNAS_OBRIGATORIAS.filter((k) => idx[k] === -1);
  if (faltando.length > 0) {
    return { itens: [], problemas: [{ linha: headerIdx + 1, descricao: `Colunas não encontradas: ${faltando.join(", ")}.` }] };
  }

  const itens: EnsaioImportado[] = [];
  const problemas: Problema[] = [];

  for (let i = headerIdx + 1; i < todasLinhas.length; i++) {
    const row = todasLinhas[i]!;
    const identificacao = (row[idx.identificacao] ?? "").trim();
    if (identificacao === "" || COLUNAS.identificacao.some((c) => normalizarTexto(identificacao) === normalizarTexto(c))) continue; // linha em branco ou cabeçalho repetido

    const numeroLinha = i + 1;

    const dataMoldagem = parseDataValida(row[idx.dataMoldagem] ?? "");
    if (!dataMoldagem) {
      problemas.push({ linha: numeroLinha, descricao: `Data de moldagem inválida: "${row[idx.dataMoldagem]}".` });
      continue;
    }

    const idade = parseInt((row[idx.idade] ?? "").trim(), 10);
    if (!Number.isFinite(idade) || idade <= 0) {
      problemas.push({ linha: numeroLinha, descricao: `Idade (dias) inválida: "${row[idx.idade]}".` });
      continue;
    }

    const dataRuptura = parseDataValida(row[idx.dataRuptura] ?? "");
    if (!dataRuptura) {
      problemas.push({ linha: numeroLinha, descricao: `Data de ruptura inválida: "${row[idx.dataRuptura]}".` });
      continue;
    }

    const fcj = parseNumeroPtBr(row[idx.fcj]);
    if (fcj == null || fcj <= 0) {
      problemas.push({ linha: numeroLinha, descricao: `Resultado Fcj (MPa) ausente ou inválido: "${row[idx.fcj]}".` });
      continue;
    }

    itens.push({
      linha: numeroLinha,
      identificacaoCarga: identificacao,
      dataMoldagem,
      laboratorioNome: idx.laboratorio !== -1 ? (row[idx.laboratorio] ?? "").trim() || null : null,
      numeroLab: idx.numeroLab !== -1 ? (row[idx.numeroLab] ?? "").trim() || null : null,
      pecaConcretada: idx.pecaConcretada !== -1 ? (row[idx.pecaConcretada] ?? "").trim() || null : null,
      idadePrevistaDias: idade,
      dataRupturaReal: dataRuptura,
      resultadoMpa: fcj,
      tipoRuptura: idx.tipoRuptura !== -1 ? parseTipoRuptura(row[idx.tipoRuptura]) : null,
      temperaturaConcreto: idx.temperatura !== -1 ? parseNumeroPtBr(row[idx.temperatura]) : null,
      slumpAplicacao: idx.slump !== -1 ? parseNumeroPtBr(row[idx.slump]) : null,
      observacoes: idx.observacoes !== -1 ? (row[idx.observacoes] ?? "").trim() || null : null,
    });
  }

  return { itens, problemas };
}
