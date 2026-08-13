import { describe, it, expect } from "vitest";
import { computeStatusFromSubetapas, descreverMergeExcel, statusAoSincronizarSubetapas } from "./programacao-db";
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

describe("statusAoSincronizarSubetapas", () => {
  it("atividade Concluída com sub-etapa pendente volta pra pendente", () => {
    // O caso relatado na tela: card verde "Concluída" mostrando "Sub-etapas
    // (0/1)". Antes, computeStatusFromSubetapas devolvia null e ninguém gravava
    // nada — o status antigo ficava de pé e ainda creditava PPC.
    expect(statusAoSincronizarSubetapas([sub("pendente")], "concluida")).toBe("pendente");
  });

  it("mesma coisa vindo de parcial ou não concluída", () => {
    expect(statusAoSincronizarSubetapas([sub("pendente")], "parcial")).toBe("pendente");
    expect(statusAoSincronizarSubetapas([sub("pendente")], "nao_concluida")).toBe("pendente");
  });

  it("já pendente não gera gravação à toa", () => {
    expect(statusAoSincronizarSubetapas([sub("pendente")], "pendente")).toBeNull();
  });

  it("desmarcar uma sub-etapa concluída derruba o status da atividade", () => {
    // Duas sub-etapas concluídas -> atividade concluída. Desmarcando uma, ela
    // volta a "pendente" (aguardando), não fica presa em "concluida".
    expect(statusAoSincronizarSubetapas([sub("concluida"), sub("pendente")], "concluida")).toBe("pendente");
  });

  it("todas resolvidas continua derivando normalmente", () => {
    expect(statusAoSincronizarSubetapas([sub("concluida"), sub("concluida")], "pendente")).toBe("concluida");
    expect(statusAoSincronizarSubetapas([sub("concluida"), sub("nao_concluida")], "pendente")).toBe("parcial");
    expect(statusAoSincronizarSubetapas([sub("nao_concluida")], "pendente")).toBe("nao_concluida");
  });

  it("status derivado igual ao atual não gera gravação", () => {
    expect(statusAoSincronizarSubetapas([sub("concluida")], "concluida")).toBeNull();
  });

  it("sem sub-etapas o status volta a ser manual e não é tocado", () => {
    // Excluir a última sub-etapa não pode zerar um apontamento feito à mão.
    expect(statusAoSincronizarSubetapas([], "concluida")).toBeNull();
    expect(statusAoSincronizarSubetapas([], "nao_concluida")).toBeNull();
  });
});

describe("descreverMergeExcel", () => {
  it("importação normal é sucesso e diz quantas mudaram", () => {
    const r = descreverMergeExcel({ updated: 12, semUid: 0, naoEncontradas: 0 });
    expect(r.ok).toBe(true);
    expect(r.texto).toContain("12 atividade(s) atualizada(s)");
  });

  it("zero atualizadas com linhas descartadas vira erro, não sucesso silencioso", () => {
    // O caso do round-trip quebrado: a planilha inteira tinha UID, nenhum casou.
    const r = descreverMergeExcel({ updated: 0, semUid: 0, naoEncontradas: 40 });
    expect(r.ok).toBe(false);
    expect(r.texto).toContain("40 linha(s) com UID que não existe nesta semana");
    expect(r.texto).toContain("Exportar Excel");
  });

  it("planilha sem a coluna UID explica o motivo", () => {
    const r = descreverMergeExcel({ updated: 0, semUid: 40, naoEncontradas: 0 });
    expect(r.ok).toBe(false);
    expect(r.texto).toContain("40 linha(s) sem UID");
  });

  it("semana sem nada pra mudar continua sendo sucesso", () => {
    // Nenhuma linha descartada: a planilha casou tudo, só não havia diferença.
    const r = descreverMergeExcel({ updated: 0, semUid: 0, naoEncontradas: 0 });
    expect(r.ok).toBe(true);
  });

  it("importação parcial avisa das descartadas sem virar erro", () => {
    const r = descreverMergeExcel({ updated: 8, semUid: 1, naoEncontradas: 2 });
    expect(r.ok).toBe(true);
    expect(r.texto).toContain("8 atividade(s)");
    expect(r.texto).toContain("2 linha(s)");
    expect(r.texto).toContain("1 linha(s) sem UID");
  });
});
