import { describe, it, expect } from "vitest";
import { computeStatusFromSubetapas } from "./programacao-db";
import type { SubEtapa } from "./adherence";

function sub(concluida: boolean): SubEtapa {
  return { id: Math.random().toString(), activity_id: "a", nome: "x", concluida };
}

describe("computeStatusFromSubetapas", () => {
  it("sem sub-etapas -> null (status continua manual)", () => {
    expect(computeStatusFromSubetapas([])).toBeNull();
  });

  it("todas concluídas -> concluida", () => {
    expect(computeStatusFromSubetapas([sub(true), sub(true), sub(true)])).toBe("concluida");
  });

  it("nenhuma concluída -> nao_concluida", () => {
    expect(computeStatusFromSubetapas([sub(false), sub(false)])).toBe("nao_concluida");
  });

  it("exatamente metade concluída -> parcial", () => {
    expect(computeStatusFromSubetapas([sub(true), sub(false)])).toBe("parcial");
  });

  it("mais da metade concluída (mas não todas) -> parcial", () => {
    expect(computeStatusFromSubetapas([sub(true), sub(true), sub(true), sub(false)])).toBe("parcial");
  });

  it("menos da metade concluída -> nao_concluida", () => {
    expect(computeStatusFromSubetapas([sub(true), sub(false), sub(false), sub(false)])).toBe("nao_concluida");
  });

  it("uma única sub-etapa concluída -> concluida", () => {
    expect(computeStatusFromSubetapas([sub(true)])).toBe("concluida");
  });

  it("uma única sub-etapa não concluída -> nao_concluida", () => {
    expect(computeStatusFromSubetapas([sub(false)])).toBe("nao_concluida");
  });
});
