import { describe, it, expect } from "vitest";
import { buildTextoRelatorioVisual } from "./relatorio-texto";
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

describe("buildTextoRelatorioVisual", () => {
  const cabecalho = { codigo: "PRJ-001", nomeProjeto: "FS CNP", gestor: "Frigotto", tipo: "Programação", dataLabel: "31/07/2026 · Sexta-feira" };

  it("inclui cabeçalho, resumo de aderência e itens agrupados por área com emoji de status", () => {
    const relatorio = buildRelatorioVisual([
      act({ name: "Alvenaria", areaPath: "AZ01 / Fundação", status: "concluida" }),
      act({ name: "Radier", areaPath: "AZ01 / Fundação", status: "nao_concluida" }),
    ]);
    const texto = buildTextoRelatorioVisual({ ...cabecalho, relatorio });

    expect(texto).toContain("*Programação* · 31/07/2026 · Sexta-feira");
    expect(texto).toContain("PRJ-001 · FS CNP · Gestor: FRIGOTTO");
    expect(texto).toContain("✅ 1 concluídas   ❌ 1 não concluídas   📊 Aderência: 50%");
    expect(texto).toContain("*AZ01*");
    expect(texto).toContain("✅ Alvenaria");
    expect(texto).toContain("❌ Radier");
  });

  it("marca extras com ➕ e sub-etapas indentadas", () => {
    const relatorio = buildRelatorioVisual([
      act({ name: "Bypass", areaPath: "AZ01 / X", status: "parcial", subetapas: [{ id: "1", activity_id: "a", nome: "Armação", status: "concluida" }, { id: "2", activity_id: "a", nome: "Concretagem", status: "pendente" }] }),
      act({ name: "Retrabalho", areaPath: "", isExtra: true, status: "concluida" }),
    ]);
    const texto = buildTextoRelatorioVisual({ ...cabecalho, relatorio });

    expect(texto).toContain("🟡 Bypass");
    expect(texto).toContain("✅ Armação");
    expect(texto).toContain("⚪ Concretagem");
    expect(texto).toContain("➕ Retrabalho _(extra)_");
  });

  it("sem atividades, mostra mensagem de período vazio", () => {
    const texto = buildTextoRelatorioVisual({ ...cabecalho, relatorio: buildRelatorioVisual([]) });
    expect(texto).toContain("Nenhuma atividade programada para este período.");
  });
});
