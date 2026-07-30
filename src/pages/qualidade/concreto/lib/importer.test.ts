import { describe, it, expect } from "vitest";
import {
  parseNumeroPtBr,
  parseDataDDMMAA,
  classificarUsina,
  normalizarEtapa,
  foldarPlurais,
  parseBDConcreto,
  agruparEmCargas,
} from "./importer";
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

describe("parseDataDDMMAA", () => {
  it("converte DD/MM/AA pra ISO assumindo 20XX", () => {
    expect(parseDataDDMMAA("07/08/25")).toBe("2025-08-07");
    expect(parseDataDDMMAA("28/07/26")).toBe("2026-07-28");
  });
  it("rejeita data inválida", () => {
    expect(parseDataDDMMAA("32/13/25")).toBeNull();
    expect(parseDataDDMMAA("abc")).toBeNull();
  });
});

describe("classificarUsina", () => {
  it("reconhece a usina própria mesmo com variação de espaço", () => {
    expect(classificarUsina("728 / 729 - FS CNP")).toBe("propria");
  });
  it("reconhece o fornecedor externo mesmo com espaço duplo", () => {
    expect(classificarUsina("RIO DO SANGUE")).toBe("externa");
    expect(classificarUsina("RIO  DO SANGUE")).toBe("externa");
  });
  it("retorna null pra usina desconhecida ou vazia", () => {
    expect(classificarUsina("")).toBeNull();
    expect(classificarUsina(null)).toBeNull();
    expect(classificarUsina("OUTRA USINA")).toBeNull();
  });
});

describe("normalizarEtapa", () => {
  it("corrige acento faltando sem mudar o conceito", () => {
    expect(normalizarEtapa("ESTACA FUNDAÇAO")).toBe("ESTACA FUNDAÇÃO");
    expect(normalizarEtapa("PISO INCLNADO")).toBe("PISO INCLINADO");
  });
  it("unifica hífen/espaço em PRÉ-MOLDADO sem tocar em outras palavras", () => {
    expect(normalizarEtapa("PRÉ MOLDADO")).toBe("PRÉ-MOLDADO");
    expect(normalizarEtapa("PRÉ - MOLDADO")).toBe("PRÉ-MOLDADO");
    expect(normalizarEtapa("PRÉ MOLDADOS")).toBe("PRÉ-MOLDADO");
  });
  it("não funde conceitos diferentes", () => {
    expect(normalizarEtapa("PISO")).not.toBe(normalizarEtapa("PISO INCLINADO"));
    expect(normalizarEtapa("ESTACA")).not.toBe(normalizarEtapa("ESTACA FUNDAÇÃO"));
  });
  it("retorna null pra vazio", () => {
    expect(normalizarEtapa("")).toBeNull();
    expect(normalizarEtapa(null)).toBeNull();
  });
});

describe("foldarPlurais", () => {
  it("funde plural simples só quando o singular também existe no conjunto", () => {
    const fold = foldarPlurais(["BLOCO", "BLOCOS", "VIGA", "PAREDE"]);
    expect(fold.get("BLOCOS")).toBe("BLOCO");
    expect(fold.has("VIGA")).toBe(false);
  });
  it("não funde plural terminado em ÕES", () => {
    const fold = foldarPlurais(["FUNDAÇÃO", "FUNDAÇÕES"]);
    expect(fold.has("FUNDAÇÕES")).toBe(false);
  });
});

// ---------- fixture no formato de LinhaTabela (mesmo shape de lerArquivoComoLinhas) ----------
const HEADER: LinhaTabela = [
  "Data", "Ano", "Mês", "Semana Ano", "Cimento (KG)", "BRITA 00 mm ( KG)", "BRITA 01 mm (KG)",
  "PO DE BRITA (KG)", "AREIA (KG)", "AGUA (L)", "ADITIVO EUCON (L)", "ADITIVO PLASTOL  (L)", "Coluna1",
  "Peso Bruto (KG)", "USINA", "Número da Carga", "Peso Da Balança (KG)", "Quantidade (M³)", "MPA ",
  "PROJETO", "APLICAÇÃO NA ETAPA DA OBRA", " PREÇO UNT ", " PREÇO TOTAL ", "OBSERVAÇÕES",
];

function linha(over: Partial<Record<
  "data" | "usina" | "numeroCarga" | "pesoBalanca" | "quantidade" | "mpa" | "projeto" | "etapa" | "precoUnt" | "obs",
  string
>>): LinhaTabela {
  const l: LinhaTabela = new Array(24).fill("");
  l[0] = over.data ?? "12/08/25";
  l[14] = over.usina ?? "RIO DO SANGUE";
  l[15] = over.numeroCarga ?? "1";
  l[16] = over.pesoBalanca ?? "14.939,04";
  l[17] = over.quantidade ?? "8,00";
  l[18] = over.mpa ?? "CONCRETO FCK 15";
  l[19] = over.projeto ?? "MOBILIZAÇÃO";
  l[20] = over.etapa ?? "RADIER CANTEIRO";
  l[21] = over.precoUnt ?? " R$ 378,90 ";
  l[23] = over.obs ?? "";
  return l;
}

function montarArquivo(linhas: LinhaTabela[]): LinhaTabela[] {
  return [[";;;;;;;;;;;;;;;;;;;Imagem;;;;;;;;;;;;;;;"], HEADER, ...linhas, new Array(24).fill(""), new Array(24).fill("")];
}

describe("parseBDConcreto", () => {
  it("pula o banner, acha o cabeçalho real e ignora linhas em branco no fim", () => {
    const r = parseBDConcreto(montarArquivo([linha({})]));
    expect(r.problemas).toHaveLength(0);
    expect(r.linhas).toHaveLength(1);
  });

  it("classifica tipo_origem e reporta problema pra usina desconhecida/vazia", () => {
    const r = parseBDConcreto(montarArquivo([linha({ usina: "" }), linha({ usina: "OUTRA COISA" })]));
    expect(r.linhas).toHaveLength(0);
    expect(r.problemas).toHaveLength(2);
  });

  it("reporta problema pra MPA não reconhecido", () => {
    const r = parseBDConcreto(montarArquivo([linha({ mpa: "CONCRETO FCK 999" })]));
    expect(r.linhas).toHaveLength(0);
    expect(r.problemas[0]?.descricao).toContain("Traço");
  });

  it("aplica o fold de etapa (typo de acento) e o fold de plural entre linhas diferentes", () => {
    const r = parseBDConcreto(montarArquivo([
      linha({ etapa: "BLOCO FUNDAÇAO" }),
      linha({ etapa: "BLOCO" }),
      linha({ etapa: "BLOCOS" }),
    ]));
    expect(r.linhas[0]!.etapaNorm).toBe("BLOCO FUNDAÇÃO");
    expect(r.linhas[1]!.etapaNorm).toBe("BLOCO");
    expect(r.linhas[2]!.etapaNorm).toBe("BLOCO"); // BLOCOS dobrado em BLOCO
  });
});

describe("agruparEmCargas", () => {
  it("agrupa linhas com mesma Data+Usina+Número da Carga e divide a quantidade entre os destinos", () => {
    const r = parseBDConcreto(montarArquivo([
      linha({ numeroCarga: "1", projeto: "MOBILIZAÇÃO", etapa: "RADIER CANTEIRO", obs: "Bloco A" }),
      linha({ numeroCarga: "1", projeto: "ARMAZÉM 01", etapa: "ESTACA FUNDAÇÃO", obs: "Bloco B" }),
    ]));
    const { cargas, problemas } = agruparEmCargas(r.linhas);
    expect(problemas).toHaveLength(0);
    expect(cargas).toHaveLength(1);
    const carga = cargas[0]!;
    expect(carga.destinos).toHaveLength(2);
    expect(carga.destinos[0]!.quantidadeM3Aplicada).toBeCloseTo(4);
    expect(carga.destinos[1]!.quantidadeM3Aplicada).toBeCloseTo(4);
    expect(carga.destinos[0]!.observacao).toBe("Bloco A");
    expect(carga.destinos[1]!.projetoRaw).toBe("ARMAZÉM 01");
  });

  it("não agrupa linhas sem Número da Carga — cada uma vira sua própria carga", () => {
    const r = parseBDConcreto(montarArquivo([
      linha({ numeroCarga: "" }),
      linha({ numeroCarga: "" }),
    ]));
    const { cargas } = agruparEmCargas(r.linhas);
    expect(cargas).toHaveLength(2);
    expect(cargas[0]!.destinos).toHaveLength(1);
  });

  it("sinaliza problema quando quantidade diverge entre linhas do mesmo grupo, mas ainda importa", () => {
    const r = parseBDConcreto(montarArquivo([
      linha({ numeroCarga: "5", quantidade: "8,00" }),
      linha({ numeroCarga: "5", quantidade: "7,00" }),
    ]));
    const { cargas, problemas } = agruparEmCargas(r.linhas);
    expect(cargas).toHaveLength(1);
    expect(problemas.length).toBeGreaterThan(0);
  });

  it("calcula computeCarga certo pra própria (perda) e externa (preço total)", () => {
    const r = parseBDConcreto(montarArquivo([
      linha({ usina: "728 / 729 - FS CNP", numeroCarga: "1", mpa: "CONCRETO FCK 30", quantidade: "8,00", pesoBalanca: "14.944,00" }),
      linha({ usina: "RIO DO SANGUE", numeroCarga: "2", mpa: "CONCRETO FCK 15", quantidade: "5,00", precoUnt: " R$ 378,90 " }),
    ]));
    const { cargas } = agruparEmCargas(r.linhas);
    const propria = cargas.find((c) => c.tipoOrigem === "propria")!;
    const externa = cargas.find((c) => c.tipoOrigem === "externa")!;

    expect(propria.computed.peso_bruto_teorico_kg).toBeCloseTo(293.75 * 8 + 265 * 8 + 805 * 8 + 795 * 8, 1);
    expect(propria.computed.perda_kg).not.toBeNull();
    expect(propria.computed.preco_total).toBeNull();

    expect(externa.computed.preco_total).toBeCloseTo(5 * 378.9, 2);
    expect(externa.computed.peso_bruto_teorico_kg).toBeNull();
  });
});
