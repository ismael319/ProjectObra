import { describe, it, expect } from "vitest";
import { distribuirCorposProva, parseIdadesEnsaio } from "./rastreabilidade";

describe("distribuirCorposProva", () => {
  it("distribui 6 CPs em pares entre 3 idades (7/28/63)", () => {
    const cps = distribuirCorposProva([7, 28, 63], 6, "2026-08-01");
    expect(cps).toHaveLength(6);
    expect(cps.map((c) => c.idade_prevista_dias)).toEqual([7, 28, 63, 7, 28, 63]);
    expect(cps[0]!.data_ruptura_prevista).toBe("2026-08-08");
    expect(cps[1]!.data_ruptura_prevista).toBe("2026-08-29");
    expect(cps[2]!.data_ruptura_prevista).toBe("2026-10-03");
  });

  it("sobra de CPs não múltipla das idades cai nas primeiras idades", () => {
    const cps = distribuirCorposProva([7, 28], 3, "2026-01-01");
    expect(cps.map((c) => c.idade_prevista_dias)).toEqual([7, 28, 7]);
  });

  it("retorna vazio sem idades, sem quantidade ou sem data de moldagem", () => {
    expect(distribuirCorposProva([], 6, "2026-01-01")).toHaveLength(0);
    expect(distribuirCorposProva([7], 0, "2026-01-01")).toHaveLength(0);
    expect(distribuirCorposProva([7], 6, "")).toHaveLength(0);
  });
});

describe("parseIdadesEnsaio", () => {
  it("converte texto separado por vírgula em números", () => {
    expect(parseIdadesEnsaio("7, 28, 63")).toEqual([7, 28, 63]);
  });

  it("ignora valores vazios ou inválidos", () => {
    expect(parseIdadesEnsaio("7,, abc, 28, -3, 0")).toEqual([7, 28]);
  });
});
