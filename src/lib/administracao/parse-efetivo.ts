import { encontrarColuna, normalizarTexto, parseDataCelula, type LinhaTabela, type Problema } from "./parse-shared";

export type FuncionarioParseado = {
  linha: number;
  matricula: string;
  matriculaOriginal: string;
  nome: string;
  cargoNome: string | null;
  setorNome: string | null;
  admissao: string | null;
  categoria: "D" | "I" | null;
  cpf: string | null;
  encarregadoNome: string | null;
  indicacao: string | null;
  local: "obra" | "alojamento" | "em_viagem" | "turno_noite" | null;
  statusBdr: "liberado_fs" | "integracao" | "aguardando_documentacao" | null;
  statusFs: "liberado" | "bloqueado" | null;
  grupoNome: string | null;
  // Só documentos com data de vencimento reconhecida — "X a vencer" sem
  // data vira Problema, não entra aqui (ver decisão #5 do plano).
  documentos: { tipoKey: string; dataVencimento: string }[];
};

export type ResultadoParseEfetivo = {
  linhas: FuncionarioParseado[];
  problemas: Problema[];
};

const CANDIDATOS = {
  mat: ["MAT"],
  nome: ["NOME"],
  cargo: ["CARGO"],
  setor: ["SETOR"],
  admissao: ["ADMISSAO", "DATA DE ADMISSAO"],
  categoria: ["CATEGORIA"],
  cpf: ["CPF"],
  encarregado: ["ENCARREGADO", "F.S"],
  indicacao: ["INDICACAO"],
  local: ["LOCAL"],
  statusBdr: ["STATUS BDR"],
  statusFs: ["STATUS FS"],
  grupo: ["GRUPO"],
  qtd: ["QTD"],
};

const LOCAL_MAP: Record<string, FuncionarioParseado["local"]> = {
  OBRA: "obra",
  ALOJAMENTO: "alojamento",
  "EM VIAGEM": "em_viagem",
  "TURNO A NOITE": "turno_noite",
};

const STATUS_BDR_MAP: Record<string, FuncionarioParseado["statusBdr"]> = {
  "LIBERADO FS": "liberado_fs",
  INTEGRACAO: "integracao",
};

const STATUS_FS_MAP: Record<string, FuncionarioParseado["statusFs"]> = {
  LIBERADO: "liberado",
  BLOQUEADO: "bloqueado",
};

// Tipos de documento conhecidos (mesmos 9 keys de tipos_documento) e os
// rótulos de coluna que costumam identificá-los. Usado tanto pra achar a
// coluna pelo cabeçalho quanto (fallback) pra inferir o tipo a partir do
// texto "X a vencer" que aparece na própria célula quando falta a data.
const CANDIDATOS_DOC: Record<string, string[]> = {
  aso: ["ASO"],
  nr01: ["NR 01", "NR01"],
  nr06: ["NR 06", "NR06"],
  nr12: ["NR 12", "NR12"],
  nr18: ["NR 18", "NR18"],
  nr20: ["NR 20", "NR20"],
  nr35: ["NR 35", "NR35"],
  malaria: ["MALARIA"],
  integracao_fs: ["INTEGRACAO"],
};

function inferirTipoDocDoTexto(texto: string): string | null {
  const norm = normalizarTexto(texto);
  if (norm.includes("ASO")) return "aso";
  if (norm.includes("INTEGRACAO")) return "integracao_fs";
  if (norm.includes("MALARIA")) return "malaria";
  const nr = norm.match(/NR\s*0?(\d{1,2})/);
  if (nr) {
    const num = nr[1]!.padStart(2, "0");
    if (CANDIDATOS_DOC[`nr${num}`]) return `nr${num}`;
  }
  return null;
}

const REGEX_A_VENCER = /^(.+?)\s+a\s+vencer$/i;

function acharLinhaCabecalho(linhas: LinhaTabela[]): number {
  // Só exige achar MAT (não Nome também) — numa exportação real vista, a
  // coluna de Nome não tem rótulo nenhum (célula de cabeçalho em branco),
  // então exigir os dois nunca encontrava a linha de cabeçalho. Janela
  // generosa: a planilha real costuma ter logo/título/data antes da linha
  // de cabeçalho de verdade (5 linhas não bastavam num caso real).
  for (let i = 0; i < Math.min(linhas.length, 30); i++) {
    if (encontrarColuna(linhas[i]!, CANDIDATOS.mat) !== -1) {
      return i;
    }
  }
  return -1;
}

function normalizarValor<T>(valor: string, mapa: Record<string, T>): T | null {
  const norm = normalizarTexto(valor);
  return norm in mapa ? mapa[norm]! : null;
}

export function parseEfetivo(linhas: LinhaTabela[]): ResultadoParseEfetivo {
  const problemas: Problema[] = [];
  const idxCabecalho = acharLinhaCabecalho(linhas);
  if (idxCabecalho === -1) {
    return {
      linhas: [],
      problemas: [{ linha: 0, descricao: "Não encontrei uma linha de cabeçalho com colunas MAT e Nome nas primeiras linhas do arquivo." }],
    };
  }

  const header = linhas[idxCabecalho]!;
  const usadas = new Set<number>();
  const idx = (candidatos: string[]) => {
    const i = encontrarColuna(header, candidatos, usadas);
    if (i !== -1) usadas.add(i);
    return i;
  };

  const colMat = idx(CANDIDATOS.mat);
  let colNome = idx(CANDIDATOS.nome);
  if (colNome === -1 && colMat !== -1 && colMat + 1 < header.length) {
    // Retaguarda: planilha real vista tinha a coluna de Nome sem rótulo
    // nenhum (célula de cabeçalho vazia) — mas é sempre a coluna logo
    // depois de MAT, então assume essa posição quando não acha por rótulo.
    colNome = colMat + 1;
    usadas.add(colNome);
  }
  const colCargo = idx(CANDIDATOS.cargo);
  const colSetor = idx(CANDIDATOS.setor);
  const colAdmissao = idx(CANDIDATOS.admissao);
  const colCategoria = idx(CANDIDATOS.categoria);
  const colCpf = idx(CANDIDATOS.cpf);
  const colEncarregado = idx(CANDIDATOS.encarregado);
  const colIndicacao = idx(CANDIDATOS.indicacao);
  const colLocal = idx(CANDIDATOS.local);
  const colStatusBdr = idx(CANDIDATOS.statusBdr);
  const colStatusFs = idx(CANDIDATOS.statusFs);
  const colGrupo = idx(CANDIDATOS.grupo);
  idx(CANDIDATOS.qtd); // só marca como usada pra não entrar na varredura de documentos

  if (colMat === -1 || colNome === -1) {
    return { linhas: [], problemas: [{ linha: idxCabecalho + 1, descricao: "Cabeçalho encontrado, mas faltam as colunas MAT e/ou Nome." }] };
  }

  const linhasDados = linhas.slice(idxCabecalho + 1);

  // Colunas de documento por rótulo do cabeçalho (entre as ainda não usadas).
  const colunasDoc = new Map<number, string>();
  for (const [tipoKey, candidatos] of Object.entries(CANDIDATOS_DOC)) {
    const i = encontrarColuna(header, candidatos, usadas);
    if (i !== -1) {
      colunasDoc.set(i, tipoKey);
      usadas.add(i);
    }
  }
  // Fallback: coluna sem rótulo reconhecido, mas com texto "X a vencer" em
  // alguma linha — infere o tipo pelo texto (ver função acima).
  for (let c = 0; c < header.length; c++) {
    if (usadas.has(c) || colunasDoc.has(c)) continue;
    for (const linha of linhasDados) {
      const m = (linha[c] ?? "").match(REGEX_A_VENCER);
      if (m) {
        const tipo = inferirTipoDocDoTexto(m[1]!);
        if (tipo) colunasDoc.set(c, tipo);
        break;
      }
    }
  }

  const resultado: FuncionarioParseado[] = [];
  let contadorPj = 0;

  linhasDados.forEach((linha, offset) => {
    const numeroLinha = idxCabecalho + 2 + offset; // 1-indexado, contando o cabeçalho
    const matOriginal = (linha[colMat] ?? "").trim();
    const nome = (linha[colNome] ?? "").trim();
    if (!matOriginal || !nome) return; // linha em branco/rodapé — ignora silenciosamente

    let matricula = matOriginal;
    if (normalizarTexto(matOriginal) === "PJ") {
      contadorPj += 1;
      matricula = `PJ-${String(contadorPj).padStart(4, "0")}`;
    }

    const categoriaRaw = colCategoria !== -1 ? (linha[colCategoria] ?? "").trim() : "";
    let categoria: FuncionarioParseado["categoria"] = null;
    if (categoriaRaw.startsWith("#")) {
      problemas.push({ linha: numeroLinha, campo: "categoria", descricao: `Erro de fórmula na planilha ("${categoriaRaw}") — categoria ficou em branco, revisar depois.` });
    } else if (categoriaRaw) {
      const norm = normalizarTexto(categoriaRaw);
      if (norm === "D" || norm === "I") categoria = norm;
      else problemas.push({ linha: numeroLinha, campo: "categoria", descricao: `Valor de categoria não reconhecido: "${categoriaRaw}".` });
    }

    const admissaoRaw = colAdmissao !== -1 ? (linha[colAdmissao] ?? "").trim() : "";
    const admissao = admissaoRaw ? parseDataCelula(admissaoRaw) : null;
    if (admissaoRaw && !admissao) {
      problemas.push({ linha: numeroLinha, campo: "admissao", descricao: `Data de admissão não reconhecida: "${admissaoRaw}" — linha não pode ser importada sem esse campo.` });
    }
    if (!admissaoRaw) {
      problemas.push({ linha: numeroLinha, campo: "admissao", descricao: "Data de admissão em branco — linha não pode ser importada sem esse campo." });
    }

    const localRaw = colLocal !== -1 ? (linha[colLocal] ?? "").trim() : "";
    const local = localRaw ? normalizarValor(localRaw, LOCAL_MAP) : null;
    if (localRaw && !local) {
      problemas.push({ linha: numeroLinha, campo: "local", descricao: `Valor de Local não reconhecido: "${localRaw}".` });
    }

    // Status BDR/FS não travam mais a linha — só matrícula, nome e admissão
    // são exigidos na importação (decisão do usuário: o resto se completa
    // depois direto na plataforma). Quando a planilha não traz um valor
    // reconhecido, importarEfetivo (db.ts) aplica um padrão seguro
    // (Aguardando documentação / Bloqueado) em vez de travar o funcionário
    // fora do sistema.
    const statusBdrRaw = colStatusBdr !== -1 ? (linha[colStatusBdr] ?? "").trim() : "";
    let statusBdr = statusBdrRaw ? normalizarValor(statusBdrRaw, STATUS_BDR_MAP) : null;
    if (!statusBdr && normalizarTexto(statusBdrRaw).startsWith("AGUARDANDO")) statusBdr = "aguardando_documentacao";
    if (statusBdrRaw && !statusBdr) {
      problemas.push({ linha: numeroLinha, campo: "status_bdr", descricao: `Status BDR não reconhecido: "${statusBdrRaw}" — vai entrar como "Aguardando documentação", ajuste na plataforma se precisar.` });
    }

    const statusFsRaw = colStatusFs !== -1 ? (linha[colStatusFs] ?? "").trim() : "";
    const statusFs = statusFsRaw ? normalizarValor(statusFsRaw, STATUS_FS_MAP) : null;
    if (statusFsRaw && !statusFs) {
      problemas.push({ linha: numeroLinha, campo: "status_fs", descricao: `Status FS não reconhecido: "${statusFsRaw}" — vai entrar como "Bloqueado", ajuste na plataforma se precisar.` });
    }

    // Só matrícula/nome (já garantidos antes) e admissão são exigidos —
    // admissao é NOT NULL no banco, sem data não dá pra gravar a linha.
    if (!admissao) return;

    const documentos: FuncionarioParseado["documentos"] = [];
    for (const [col, tipoKey] of colunasDoc) {
      const valor = (linha[col] ?? "").trim();
      if (!valor) continue;
      const data = parseDataCelula(valor);
      if (data) {
        documentos.push({ tipoKey, dataVencimento: data });
      } else if (REGEX_A_VENCER.test(valor)) {
        problemas.push({ linha: numeroLinha, campo: tipoKey, descricao: `"${valor}" — sem data exata, cadastre a emissão manualmente depois.` });
      } else {
        problemas.push({ linha: numeroLinha, campo: tipoKey, descricao: `Valor de vencimento não reconhecido: "${valor}".` });
      }
    }

    resultado.push({
      linha: numeroLinha,
      matricula,
      matriculaOriginal: matOriginal,
      nome,
      cargoNome: colCargo !== -1 ? (linha[colCargo] || "").trim() || null : null,
      setorNome: colSetor !== -1 ? (linha[colSetor] || "").trim() || null : null,
      admissao,
      categoria,
      cpf: colCpf !== -1 ? (linha[colCpf] || "").trim() || null : null,
      encarregadoNome: colEncarregado !== -1 ? (linha[colEncarregado] || "").trim() || null : null,
      indicacao: colIndicacao !== -1 ? (linha[colIndicacao] || "").trim() || null : null,
      local,
      statusBdr,
      statusFs,
      grupoNome: colGrupo !== -1 ? (linha[colGrupo] || "").trim() || null : null,
      documentos,
    });
  });

  // Matrícula duplicada dentro do mesmo arquivo: mantém a última ocorrência
  // (mesmo critério do upsert por matrícula no banco) e sinaliza as demais.
  const porMatricula = new Map<string, number>();
  resultado.forEach((f, i) => {
    if (porMatricula.has(f.matricula)) {
      problemas.push({ linha: f.linha, campo: "matricula", descricao: `Matrícula "${f.matricula}" repetida no arquivo — só a última ocorrência (linha ${f.linha}) será importada.` });
    }
    porMatricula.set(f.matricula, i);
  });
  const linhasFinais = [...porMatricula.values()].sort((a, b) => a - b).map((i) => resultado[i]!);

  return { linhas: linhasFinais, problemas };
}

// A planilha de Controle de Efetivo pode ter mais de uma aba (ex.: "Ativos"
// + "Demissões"), em qualquer ordem. Tenta cada uma e usa a primeira que tem
// cabeçalho reconhecido; se nenhuma tiver, devolve o erro da última tentativa
// (mensagem genérica o bastante pra qualquer uma servir).
export function parseEfetivoMelhorAba(
  abas: { nome: string; linhas: LinhaTabela[] }[]
): ResultadoParseEfetivo & { abaUsada: string | null } {
  let ultimoResultado: ResultadoParseEfetivo = { linhas: [], problemas: [] };
  for (const aba of abas) {
    const r = parseEfetivo(aba.linhas);
    const cabecalhoNaoEncontrado = r.linhas.length === 0 && r.problemas.length === 1 && r.problemas[0]!.linha === 0;
    if (!cabecalhoNaoEncontrado) return { ...r, abaUsada: aba.nome };
    ultimoResultado = r;
  }
  return { ...ultimoResultado, abaUsada: null };
}
