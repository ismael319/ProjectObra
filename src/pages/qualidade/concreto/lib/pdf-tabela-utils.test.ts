import { describe, it, expect } from "vitest";
import { normalizar, identificarColuna, agruparLinhas, detectarColunas, colunaMaisProxima, type ItemPosicionado } from "./pdf-tabela-utils";

describe("normalizar", () => {
  it("remove acento, maiúscula e pontuação", () => {
    expect(normalizar("Peça Concretada")).toBe("PECA CONCRETADA");
    expect(normalizar("Fcj (MPa)")).toBe("FCJ MPA");
  });
});

describe("identificarColuna", () => {
  it("distingue Nota Fiscal de Slump Nota Fiscal (as duas contêm FISCAL)", () => {
    expect(identificarColuna(normalizar("Nota Fiscal"))).toBe("NOTA FISCAL");
    expect(identificarColuna(normalizar("Slump Nota Fiscal (cm)"))).not.toBe("NOTA FISCAL");
  });

  it("distingue Data de Ruptura / Tipo de Ruptura / Ruptura (Ton) (as três contêm RUPTURA)", () => {
    expect(identificarColuna(normalizar("Data de Ruptura"))).toBe("DATA RUPTURA");
    expect(identificarColuna(normalizar("Tipo de Ruptura"))).toBe("TIPO DE RUPTURA");
    expect(identificarColuna(normalizar("Ruptura (Ton)"))).toBeNull();
  });

  it("distingue Slump de Aplicação de Slump Nota Fiscal (as duas contêm SLUMP)", () => {
    expect(identificarColuna(normalizar("Slump de Aplicação (cm)"))).toBe("SLUMP");
    expect(identificarColuna(normalizar("Slump Nota Fiscal (cm)"))).toBeNull();
  });

  it("reconhece as demais colunas de interesse", () => {
    expect(identificarColuna(normalizar("Lab"))).toBe("Nº CP");
    expect(identificarColuna(normalizar("Peça Concretada"))).toBe("PEÇA CONCRETADA");
    expect(identificarColuna(normalizar("Data de Moldagem"))).toBe("DATA MOLDAGEM");
    expect(identificarColuna(normalizar("Idade (dias)"))).toBe("IDADE");
    expect(identificarColuna(normalizar("Temp. do Concreto (°C)"))).toBe("TEMPERATURA");
    expect(identificarColuna(normalizar("Fcj (MPa)"))).toBe("FCJ");
  });

  it("ignora colunas fora do que a gente importa", () => {
    expect(identificarColuna(normalizar("Obra"))).toBeNull();
    expect(identificarColuna(normalizar("Volume de Concreto (m³)"))).toBeNull();
    expect(identificarColuna(normalizar("Adição Total de Água (L)"))).toBeNull();
    expect(identificarColuna(normalizar("Saída Usina"))).toBeNull();
  });
});

// Simula a posição (x,y) dos textos de uma linha do PDF de exemplo (relatório
// Estrutec) — coordenadas aproximadas, só precisam manter a ORDEM horizontal
// real das colunas: Lab, Obra, Nota Fiscal, Volume, Peça Concretada, Saída
// Usina/Início/Fim, Data Moldagem, Data Ruptura, Idade, Slump Aplicação,
// Slump Nota Fiscal, Adição Água, Temp., Ruptura(Ton), Fcj, Tipo.
function item(texto: string, x: number, y: number, largura = texto.length * 5): ItemPosicionado {
  return { texto, x, xFim: x + largura, y };
}

describe("agruparLinhas + detectarColunas + colunaMaisProxima (fluxo completo)", () => {
  const header: ItemPosicionado[] = [
    item("Lab", 20, 500),
    item("Obra", 60, 500),
    item("Nota", 100, 500),
    item("Fiscal", 100, 490),
    item("Peça", 160, 500),
    item("Concretada", 160, 490),
    item("Data", 300, 500),
    item("de", 300, 490),
    item("Moldagem", 300, 480),
    item("Data", 360, 500),
    item("de", 360, 490),
    item("Ruptura", 360, 480),
    item("Idade", 420, 500),
    item("Fcj", 600, 500),
    item("Tipo", 650, 500),
    item("de", 650, 490),
    item("Ruptura", 650, 480),
  ];

  const linhaDado1: ItemPosicionado[] = [
    item("436014", 20, 400),
    item("44397", 60, 400),
    item("3054", 100, 400),
    item("RAMPA", 155, 400),
    item("DO", 190, 400),
    item("AZ02", 210, 400),
    item("01/07/2026", 290, 400),
    item("08/07/2026", 355, 400),
    item("7", 425, 400),
    item("29,59", 595, 400),
    item("E", 655, 400),
  ];

  const todasLinhas = agruparLinhas([...header, ...linhaDado1]);

  it("agrupa cada linha visual (mesmo y aproximado) numa única linha", () => {
    // header ocupa 3 linhas de y (500/490/480) + 1 linha de dado (400) = 4
    expect(todasLinhas).toHaveLength(4);
    expect(todasLinhas[3]!.map((i) => i.texto)).toEqual([
      "436014", "44397", "3054", "RAMPA", "DO", "AZ02", "01/07/2026", "08/07/2026", "7", "29,59", "E",
    ]);
  });

  it("detecta as colunas de interesse a partir das 3 linhas de cabeçalho, ignorando Obra/Volume", () => {
    const colunas = detectarColunas(todasLinhas, 0, 3);
    const chaves = colunas.map((c) => c.chave).filter((c): c is string => c !== null);
    expect(chaves).toEqual(
      expect.arrayContaining(["Nº CP", "NOTA FISCAL", "PEÇA CONCRETADA", "DATA MOLDAGEM", "DATA RUPTURA", "IDADE", "FCJ", "TIPO DE RUPTURA"]),
    );
    // "Obra" (x=60) não bate com nenhum rótulo conhecido -> fica sem chave, mas continua na lista (evita vazamento de coluna vizinha)
    expect(colunas.some((c) => c.chave === null)).toBe(true);
  });

  it("casa cada item da linha de dado com a coluna certa pelo centro X mais próximo", () => {
    const colunas = detectarColunas(todasLinhas, 0, 3);
    const notaFiscalCol = colunas.find((c) => c.chave === "NOTA FISCAL")!;
    const itemNotaFiscal = linhaDado1.find((i) => i.texto === "3054")!;
    const maisProxima = colunaMaisProxima(colunas, (itemNotaFiscal.x + itemNotaFiscal.xFim) / 2);
    expect(maisProxima?.chave).toBe("NOTA FISCAL");
    expect(maisProxima).toBe(notaFiscalCol);

    const itemFcj = linhaDado1.find((i) => i.texto === "29,59")!;
    expect(colunaMaisProxima(colunas, (itemFcj.x + itemFcj.xFim) / 2)?.chave).toBe("FCJ");

    const itemTipo = linhaDado1.find((i) => i.texto === "E")!;
    expect(colunaMaisProxima(colunas, (itemTipo.x + itemTipo.xFim) / 2)?.chave).toBe("TIPO DE RUPTURA");
  });
});
