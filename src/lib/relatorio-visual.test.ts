import { describe, it, expect } from "vitest";
import { buildRelatorioVisual } from "./relatorio-visual";
import type { ActivityLike } from "./adherence";

function act(over: Partial<ActivityLike> & { isExtra?: boolean }): ActivityLike {
  const { isExtra, ...rest } = over;
  return {
    id: Math.random().toString(),
    name: "Atividade",
    company: null,
    discipline: null,
    area: null,
    stage: null,
    foreman: null,
    planned_date: "2026-07-31",
    planned_pct: 100,
    status: "pendente",
    is_extra: isExtra ?? false,
    observation: null,
    areaPath: "AZ01",
    ...rest,
  };
}

describe("buildRelatorioVisual", () => {
  it("agrupa por área (nível 2 do areaPath)", () => {
    const r = buildRelatorioVisual([
      act({ name: "A", areaPath: "AZ01 / Fundação", status: "concluida" }),
      act({ name: "B", areaPath: "AZ01 / Cobertura", status: "concluida" }),
      act({ name: "C", areaPath: "AZ02 / Montagem", status: "nao_concluida" }),
    ]);
    expect(r.areas.map((a) => a.nome)).toEqual(["AZ01", "AZ02"]);
    expect(r.areas[0].itens).toHaveLength(2);
  });

  it("calcula aderência como concluídas / (concluídas + não concluídas), ignorando extras/parciais/pendentes", () => {
    const r = buildRelatorioVisual([
      act({ status: "concluida" }),
      act({ status: "concluida" }),
      act({ status: "nao_concluida" }),
      act({ status: "parcial" }),
      act({ status: "pendente" }),
      act({ status: "concluida", isExtra: true }),
    ]);
    expect(r.concluidas).toBe(2);
    expect(r.naoConcluidas).toBe(1);
    expect(r.aderenciaPct).toBe(67); // 2 / 3 = 66.67% -> arredonda pra 67
  });

  it("retorna aderência null quando não há nada concluído/não concluído ainda (ex.: programação futura)", () => {
    const r = buildRelatorioVisual([act({ status: "pendente" }), act({ status: "pendente" })]);
    expect(r.aderenciaPct).toBeNull();
  });

  it("extras sem areaPath caem em Sem área e ficam por último", () => {
    const r = buildRelatorioVisual([
      act({ areaPath: "AZ01 / X", status: "concluida" }),
      act({ areaPath: "", isExtra: true, status: "concluida" }),
    ]);
    expect(r.areas.at(-1)!.nome).toBe("Sem área");
  });
});
