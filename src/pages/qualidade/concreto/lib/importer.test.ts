import { describe, it, expect } from "vitest";
import { parseNumeroPtBr, parseCargasConcreto } from "./importer";
import type { LinhaTabela } from "@/lib/administracao/parse-shared";

describe("parseNumeroPtBr", () => {
  it("converte número pt-BR com milhar e decimal", () => {
    expect(parseNumeroPtBr("1.125,00")).toBe(1125);
    expect(parseNumeroPtBr("18.323,04")).toBeCloseTo(18323.04);
  });
  it("converte preço com prefixo R$ e espaços", () => {
    expect(parseNumeroPtBr(" R$ 378,90 ")).toBeCloseTo(378.9);
  });
  it("trata traço e vazio como null", () => {
    expect(parseNumeroPtBr("-")).toBeNull();
    expect(parseNumeroPtBr("")).toBeNull();
    expect(parseNumeroPtBr(null)).toBeNull();
  });
});

// ---------- fixture no formato exportado por excel-export.ts ----------
const HEADER: LinhaTabela = [
  "DATA", "FORNECEDOR", "ORIGEM", "Nº CARGA", "TRAÇO", "FCK (MPa)",
  "QTD (m³)", "PESO BALANÇA (kg)", "PREÇO TOTAL", "DESTINO(S)", "PROJETO", "ETAPA", "OBSERVAÇÕES",
  "VALIDADO", "LANÇADO POR",
];

function linha(over: Partial<Record<
  "data" | "fornecedor" | "origem" | "numeroCarga" | "traco" | "quantidade" | "pesoBalanca" | "precoTotal" | "destino" | "projeto" | "etapa" | "obs" | "validado" | "lancadoPor",
  string
>>): LinhaTabela {
  return [
    over.data ?? "12/08/2025",
    over.fornecedor ?? "RIO DO SANGUE",
    over.origem ?? "Externa",
    over.numeroCarga ?? "1",
    over.traco ?? "CONCRETO FCK 15",
    "15",
    over.quantidade ?? "8,00",
    over.pesoBalanca ?? "",
    over.precoTotal ?? "3031,20",
    over.destino ?? "MOBILIZAÇÃO — 8m³",
    over.projeto ?? "MOBILIZAÇÃO",
    over.etapa ?? "RADIER CANTEIRO",
    over.obs ?? "",
    over.validado ?? "Sim",
    over.lancadoPor ?? "Importação",
  ];
}

function montarArquivo(linhas: LinhaTabela[]): LinhaTabela[] {
  return [HEADER, ...linhas];
}

describe("parseCargasConcreto", () => {
  it("acha o cabeçalho e converte cada linha numa carga", () => {
    const r = parseCargasConcreto(montarArquivo([linha({})]));
    expect(r.problemas).toHaveLength(0);
    expect(r.cargas).toHaveLength(1);
    const c = r.cargas[0]!;
    expect(c.data).toBe("2025-08-12");
    expect(c.fornecedorNome).toBe("RIO DO SANGUE");
    expect(c.tipoOrigem).toBe("externa");
    expect(c.tracoNome).toBe("CONCRETO FCK 15");
    expect(c.quantidadeM3).toBe(8);
    expect(c.destinos).toHaveLength(1);
  });

  it("aceita ano com 2 dígitos (Excel reformatou a data ao reabrir/editar o arquivo exportado)", () => {
    const r = parseCargasConcreto(montarArquivo([linha({ data: "12/08/25" })]));
    expect(r.problemas).toHaveLength(0);
    expect(r.cargas[0]!.data).toBe("2025-08-12");
  });

  it("rejeita data com dia ou mês fora de faixa em vez de gerar uma data impossível", () => {
    const r = parseCargasConcreto(montarArquivo([linha({ data: "32/13/2025" })]));
    expect(r.cargas).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Data inválida");
  });

  it('recupera a data quando o Excel reformata a célula em ordem americana (pegadinha do SheetJS: célula mostra "29/07/2026" mas chega como texto "7/29/26")', () => {
    const r = parseCargasConcreto(montarArquivo([linha({ data: "7/29/26" })]));
    expect(r.problemas).toHaveLength(0);
    expect(r.cargas[0]!.data).toBe("2026-07-29");
  });

  it("mantém a ordem dia/mês quando os dois valores são ambíguos (≤12)", () => {
    const r = parseCargasConcreto(montarArquivo([linha({ data: "05/08/2026" })]));
    expect(r.cargas[0]!.data).toBe("2026-08-05");
  });

  it("usa o serial do Excel (grid cru) em vez do texto quando os dois estão disponíveis, evitando a ambiguidade dia/mês que o texto sozinho não resolve", () => {
    // Texto "3/5/26" sozinho seria lido como dia=3/mês=5 (03/05/2026, ambíguo,
    // ambos ≤12) — mas o serial 46232 é 29/07/2026 de verdade (célula que virou
    // data real no Excel). O valor cru tem prioridade por não ter ambiguidade.
    const arquivo = montarArquivo([linha({ data: "3/5/26" })]);
    const brutas: unknown[][] = arquivo.map((l) => [...l]);
    brutas[1]![0] = 46232;
    const r = parseCargasConcreto(arquivo, brutas);
    expect(r.problemas).toHaveLength(0);
    expect(r.cargas[0]!.data).toBe("2026-07-29");
  });

  it("cai pro texto quando o grid cru não tem valor numérico na coluna DATA (célula sempre foi texto)", () => {
    const arquivo = montarArquivo([linha({ data: "05/08/2026" })]);
    const brutas: unknown[][] = arquivo.map((l) => [...l]);
    const r = parseCargasConcreto(arquivo, brutas);
    expect(r.cargas[0]!.data).toBe("2026-08-05");
  });

  it("reporta colunas obrigatórias faltando quando o arquivo não segue o formato esperado", () => {
    const headerIncompleto: LinhaTabela = ["DATA", "ALGO"];
    const r = parseCargasConcreto([headerIncompleto, ["12/08/2025", "x"]]);
    expect(r.cargas).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Colunas não encontradas");
  });

  it("reporta problema pra Origem não reconhecida", () => {
    const r = parseCargasConcreto(montarArquivo([linha({ origem: "Sei lá" })]));
    expect(r.cargas).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Origem");
  });

  it("reporta problema pra Quantidade inválida", () => {
    const r = parseCargasConcreto(montarArquivo([linha({ quantidade: "0" })]));
    expect(r.cargas).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Quantidade");
  });

  it("reporta problema pra Traço em branco", () => {
    const r = parseCargasConcreto(montarArquivo([linha({ traco: "" })]));
    expect(r.cargas).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Traço");
  });

  it("reporta problema quando não há Projeto (destino) informado", () => {
    const r = parseCargasConcreto(montarArquivo([linha({ projeto: "" })]));
    expect(r.cargas).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Projeto");
  });

  it("divide a carga em vários destinos quando PROJETO/ETAPA/OBSERVAÇÕES têm vários trechos separados por ;", () => {
    const r = parseCargasConcreto(montarArquivo([
      linha({ quantidade: "10,00", projeto: "MOBILIZAÇÃO; ARMAZÉM 01", etapa: "RADIER; ESTACA FUNDAÇÃO", obs: "Bloco A; Bloco B" }),
    ]));
    expect(r.problemas).toHaveLength(0);
    const c = r.cargas[0]!;
    expect(c.destinos).toHaveLength(2);
    expect(c.destinos[0]!.projetoRaw).toBe("MOBILIZAÇÃO");
    expect(c.destinos[0]!.etapaNorm).toBe("RADIER");
    expect(c.destinos[0]!.observacao).toBe("Bloco A");
    expect(c.destinos[0]!.quantidadeM3Aplicada).toBeCloseTo(5);
    expect(c.destinos[1]!.projetoRaw).toBe("ARMAZÉM 01");
    expect(c.destinos[1]!.etapaNorm).toBe("ESTACA FUNDAÇÃO");
    expect(c.destinos[1]!.observacao).toBe("Bloco B");
    expect(c.destinos[1]!.quantidadeM3Aplicada).toBeCloseTo(5);
  });

  it("usa o volume de cada trecho de DESTINO(S) em vez de dividir a quantidade igualmente, quando o número de trechos bate com PROJETO", () => {
    const r = parseCargasConcreto(montarArquivo([
      linha({
        quantidade: "10,00",
        projeto: "MOBILIZAÇÃO; ARMAZÉM 01",
        etapa: "RADIER; ESTACA FUNDAÇÃO",
        destino: "MOBILIZAÇÃO — 7,5m³; ARMAZÉM 01 — 2,5m³",
      }),
    ]));
    expect(r.problemas).toHaveLength(0);
    const c = r.cargas[0]!;
    expect(c.destinos[0]!.quantidadeM3Aplicada).toBeCloseTo(7.5);
    expect(c.destinos[1]!.quantidadeM3Aplicada).toBeCloseTo(2.5);
  });

  it("cai pra divisão igual quando DESTINO(S) não bate em quantidade de trechos com PROJETO", () => {
    const r = parseCargasConcreto(montarArquivo([
      linha({
        quantidade: "10,00",
        projeto: "MOBILIZAÇÃO; ARMAZÉM 01",
        destino: "MOBILIZAÇÃO — 8m³",
      }),
    ]));
    const c = r.cargas[0]!;
    expect(c.destinos[0]!.quantidadeM3Aplicada).toBeCloseTo(5);
    expect(c.destinos[1]!.quantidadeM3Aplicada).toBeCloseTo(5);
  });

  it('lê VALIDADO "Não" como false e qualquer outro valor (ou coluna ausente) como true', () => {
    const r = parseCargasConcreto(montarArquivo([
      linha({ numeroCarga: "1", validado: "Não" }),
      linha({ numeroCarga: "2", validado: "Sim" }),
    ]));
    expect(r.cargas[0]!.validado).toBe(false);
    expect(r.cargas[1]!.validado).toBe(true);
  });

  it("ignora linhas em branco e cabeçalho repetido", () => {
    const r = parseCargasConcreto(montarArquivo([linha({}), ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""], HEADER]));
    expect(r.cargas).toHaveLength(1);
  });
});
