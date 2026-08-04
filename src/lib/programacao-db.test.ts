import { describe, it, expect } from "vitest";
import { computeStatusFromSubetapas } from "./programacao-db";
import type { SubEtapa, SubEtapaStatus } from "./adherence";

function sub(status: SubEtapaStatus): SubEtapa {
  return { id: Math.random().toString(), activity_id: "a", nome: "x", status };
}

describe("computeStatusFromSubetapas", () => {
  it("sem sub-etapas -> null (status continua manual)", () => {
    expect(computeStatusFromSubetapas([])).toBeNull();
  });

  it("alguma sub-etapa pendente -> null (aguarda ser resolvida, não conta como não concluída)", () => {
    expect(computeStatusFromSubetapas([sub("pendente")])).toBeNull();
    expect(computeStatusFromSubetapas([sub("concluida"), sub("pendente")])).toBeNull();
  });

  it("todas concluídas -> concluida", () => {
    expect(computeStatusFromSubetapas([sub("concluida"), sub("concluida"), sub("concluida")])).toBe("concluida");
  });

  it("nenhuma concluída (todas resolvidas como não) -> nao_concluida", () => {
    expect(computeStatusFromSubetapas([sub("nao_concluida"), sub("nao_concluida")])).toBe("nao_concluida");
  });

  it("exatamente metade concluída -> parcial", () => {
    expect(computeStatusFromSubetapas([sub("concluida"), sub("nao_concluida")])).toBe("parcial");
  });

  it("mais da metade concluída (mas não todas) -> parcial", () => {
    expect(computeStatusFromSubetapas([sub("concluida"), sub("concluida"), sub("concluida"), sub("nao_concluida")])).toBe("parcial");
  });

  it("menos da metade concluída -> nao_concluida", () => {
    expect(computeStatusFromSubetapas([sub("concluida"), sub("nao_concluida"), sub("nao_concluida"), sub("nao_concluida")])).toBe("nao_concluida");
  });

  it("uma única sub-etapa concluída -> concluida", () => {
    expect(computeStatusFromSubetapas([sub("concluida")])).toBe("concluida");
  });

  it("uma única sub-etapa não concluída -> nao_concluida", () => {
    expect(computeStatusFromSubetapas([sub("nao_concluida")])).toBe("nao_concluida");
  });
});
