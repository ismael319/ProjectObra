import { describe, it, expect } from "vitest";
import { parseEnsaiosConcreto } from "./importer-ensaios";
import type { LinhaTabela } from "@/lib/administracao/parse-shared";

const HEADER: LinhaTabela = [
  "Nº CARGA", "DATA MOLDAGEM", "LABORATÓRIO", "Nº CP", "PEÇA CONCRETADA",
  "IDADE (DIAS)", "DATA RUPTURA", "FCJ (MPa)", "TIPO DE RUPTURA",
];

function linha(over: Partial<Record<
  "identificacao" | "dataMoldagem" | "laboratorio" | "numeroLab" | "peca" | "idade" | "dataRuptura" | "fcj" | "tipoRuptura",
  string
>>): LinhaTabela {
  return [
    over.identificacao ?? "1234",
    over.dataMoldagem ?? "01/08/2026",
    over.laboratorio ?? "Estrutec",
    over.numeroLab ?? "436014",
    over.peca ?? "RAMPA DO AZ02",
    over.idade ?? "28",
    over.dataRuptura ?? "29/08/2026",
    over.fcj ?? "32,5",
    over.tipoRuptura ?? "A - CONICA",
  ];
}

function montarArquivo(linhas: LinhaTabela[]): LinhaTabela[] {
  return [HEADER, ...linhas];
}

describe("parseEnsaiosConcreto", () => {
  it("acha o cabeçalho e converte cada linha num resultado", () => {
    const r = parseEnsaiosConcreto(montarArquivo([linha({})]));
    expect(r.problemas).toHaveLength(0);
    expect(r.itens).toHaveLength(1);
    const item = r.itens[0]!;
    expect(item.identificacaoCarga).toBe("1234");
    expect(item.dataMoldagem).toBe("2026-08-01");
    expect(item.laboratorioNome).toBe("Estrutec");
    expect(item.numeroLab).toBe("436014");
    expect(item.pecaConcretada).toBe("RAMPA DO AZ02");
    expect(item.idadePrevistaDias).toBe(28);
    expect(item.dataRupturaReal).toBe("2026-08-29");
    expect(item.resultadoMpa).toBe(32.5);
    expect(item.tipoRuptura).toBe("A");
  });

  it("reporta Fcj ausente ou inválido", () => {
    const r = parseEnsaiosConcreto(montarArquivo([linha({ fcj: "" })]));
    expect(r.itens).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Fcj");
  });

  it("reporta idade inválida", () => {
    const r = parseEnsaiosConcreto(montarArquivo([linha({ idade: "abc" })]));
    expect(r.itens).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Idade");
  });

  it("reporta data de moldagem/ruptura inválida", () => {
    const r1 = parseEnsaiosConcreto(montarArquivo([linha({ dataMoldagem: "32/13/2026" })]));
    expect(r1.problemas[0]?.descricao).toContain("moldagem");
    const r2 = parseEnsaiosConcreto(montarArquivo([linha({ dataRuptura: "32/13/2026" })]));
    expect(r2.problemas[0]?.descricao).toContain("ruptura");
  });

  it("ignora linhas em branco e cabeçalho repetido", () => {
    const r = parseEnsaiosConcreto(montarArquivo([linha({}), ["", "", "", "", "", "", "", "", ""], HEADER]));
    expect(r.itens).toHaveLength(1);
  });

  it("reporta colunas obrigatórias faltando", () => {
    const headerIncompleto: LinhaTabela = ["Nº CARGA", "ALGO"];
    const r = parseEnsaiosConcreto([headerIncompleto, ["1234", "x"]]);
    expect(r.itens).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Colunas não encontradas");
  });
});
