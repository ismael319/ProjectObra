import { describe, it, expect } from "vitest";
import { buildRelatorioVisual, buildMatrizSemanal } from "./relatorio-visual";
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

  it("calcula aderência igual a computeIndicators.aderencia: planejadas (sem extras) no denominador, parcial vale meio crédito", () => {
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
    // denom = 5 planejadas (extra fora); peso = 1+1+0+0.5+0 = 2.5 -> 2.5/5 = 50%
    expect(r.aderenciaPct).toBe(50);
  });

  it("pendente conta no denominador (0% quando tudo está pendente, não null) — mesmo critério do painel de indicadores", () => {
    const r = buildRelatorioVisual([act({ status: "pendente" }), act({ status: "pendente" })]);
    expect(r.aderenciaPct).toBe(0);
  });

  it("retorna aderência null só quando não há nenhuma atividade planejada (ex.: só extras)", () => {
    const r = buildRelatorioVisual([act({ status: "concluida", isExtra: true })]);
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

describe("buildMatrizSemanal", () => {
  const weekDays = ["2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"];

  it("agrupa por engenheiro e junta os dias da mesma tarefa (taskUid) numa linha só", () => {
    const r = buildMatrizSemanal(
      [
        act({ foreman: "Alaor", taskUid: "1", name: "Montagem", planned_date: "2026-07-11", status: "concluida" }),
        act({ foreman: "Alaor", taskUid: "1", name: "Montagem", planned_date: "2026-07-12", status: "concluida" }),
        act({ foreman: "Alaor", taskUid: "2", name: "Piso", planned_date: "2026-07-13", status: "parcial" }),
      ],
      weekDays,
    );
    expect(r.engenheiros).toHaveLength(1);
    expect(r.engenheiros[0].nome).toBe("Alaor");
    expect(r.engenheiros[0].linhas).toHaveLength(2);
    const montagem = r.engenheiros[0].linhas.find((l) => l.nome === "Montagem")!;
    expect(montagem.porDia["2026-07-11"]).toBe("concluida");
    expect(montagem.porDia["2026-07-12"]).toBe("concluida");
    expect(montagem.porDia["2026-07-13"]).toBeUndefined();
  });

  it("sem engenheiro cai em 'Sem engenheiro' e fica por último", () => {
    const r = buildMatrizSemanal(
      [act({ foreman: "Alaor", taskUid: "1" }), act({ foreman: null, taskUid: "2" })],
      weekDays,
    );
    expect(r.engenheiros.at(-1)!.nome).toBe("Sem engenheiro");
  });

  it("extras sem taskUid não se fundem entre si (cada linha usa o próprio id)", () => {
    const r = buildMatrizSemanal(
      [act({ foreman: "Alaor", taskUid: null, isExtra: true, name: "Extra A" }), act({ foreman: "Alaor", taskUid: null, isExtra: true, name: "Extra B" })],
      weekDays,
    );
    expect(r.engenheiros[0].linhas).toHaveLength(2);
  });

  it("extrai área (nível 2) e subárea (nível 3) do areaPath, e agrupa por área/subárea antes do nome", () => {
    const r = buildMatrizSemanal(
      [
        act({ foreman: "Alaor", taskUid: "1", name: "Zebra", areaPath: "GALPÃO / COBERTURA" }),
        act({ foreman: "Alaor", taskUid: "2", name: "Abacate", areaPath: "GALPÃO / FUNDAÇÃO" }),
        act({ foreman: "Alaor", taskUid: "3", name: "Mesa", areaPath: "CASA DE MÁQUINAS" }),
      ],
      weekDays,
    );
    const linhas = r.engenheiros[0].linhas;
    expect(linhas.find((l) => l.nome === "Zebra")).toMatchObject({ area: "GALPÃO", subarea: "COBERTURA" });
    expect(linhas.find((l) => l.nome === "Abacate")).toMatchObject({ area: "GALPÃO", subarea: "FUNDAÇÃO" });
    // Sem nível 3 no areaPath -> subárea vazia, não undefined.
    expect(linhas.find((l) => l.nome === "Mesa")).toMatchObject({ area: "CASA DE MÁQUINAS", subarea: "" });
    // Ordena por área primeiro ("CASA DE MÁQUINAS" antes de "GALPÃO"), e dentro da
    // mesma área por subárea ("COBERTURA" antes de "FUNDAÇÃO") — não por nome da
    // tarefa, que sozinho daria Abacate/Mesa/Zebra.
    expect(linhas.map((l) => l.nome)).toEqual(["Mesa", "Zebra", "Abacate"]);
  });
});

describe('"fora desta semana" sai dos relatórios', () => {
  // computeIndicators/computeSegment já excluíam foraDoPlano, mas os relatórios
  // montam o próprio filtro e só olhavam `inativa` — uma atividade tirada do
  // plano continuava aparecendo na imagem mandada pro WhatsApp e ainda entrava
  // no denominador da aderência ali, divergindo da tela pros mesmos dados.
  const weekDays = ["2026-07-10", "2026-07-11", "2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15", "2026-07-16"];

  it("não aparece nos cards nem conta na aderência do relatório visual", () => {
    const r = buildRelatorioVisual([
      act({ name: "Feita", status: "concluida" }),
      act({ name: "Parada", status: "nao_concluida", foraDoPlano: true }),
    ]);
    const nomes = r.areas.flatMap((a) => a.itens.map((i) => i.nome));
    expect(nomes).toEqual(["Feita"]);
    expect(r.aderenciaPct).toBe(100);
    expect(r.totalPlanejadas).toBe(1);
  });

  it("some da matriz semanal e do seu denominador", () => {
    const r = buildMatrizSemanal(
      [
        act({ foreman: "Alaor", taskUid: "1", name: "Feita", status: "concluida", planned_date: weekDays[0] }),
        act({ foreman: "Alaor", taskUid: "2", name: "Parada", status: "nao_concluida", foraDoPlano: true, planned_date: weekDays[0] }),
      ],
      weekDays,
    );
    expect(r.engenheiros[0].linhas.map((l) => l.nome)).toEqual(["Feita"]);
    expect(r.aderenciaPct).toBe(100);
  });

  it("sai junto com as inativas, sem uma anular a outra", () => {
    const r = buildRelatorioVisual([
      act({ name: "Feita", status: "concluida" }),
      act({ name: "Parada", status: "nao_concluida", foraDoPlano: true }),
      act({ name: "Em análise", status: "nao_concluida", inativa: true }),
    ]);
    expect(r.areas.flatMap((a) => a.itens.map((i) => i.nome))).toEqual(["Feita"]);
  });
});
