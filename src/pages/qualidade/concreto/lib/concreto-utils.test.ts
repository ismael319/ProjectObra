import { describe, expect, it } from "vitest";
import { computeCarga, type TracoConsumo } from "./concreto-utils";

const TRACO_PADRAO: TracoConsumo = {
  consumo_cimento_kg_m3: 300,
  consumo_brita00_kg_m3: 400,
  consumo_brita01_kg_m3: 350,
  consumo_po_brita_kg_m3: 150,
  consumo_areia_kg_m3: 650,
}; // soma = 1850 kg/m3

describe("computeCarga — tipo_origem 'propria'", () => {
  it("calcula peso teórico e perda a partir do traço x quantidade e da balança", () => {
    const r = computeCarga({
      data: "2026-03-05",
      tipo_origem: "propria",
      traco: TRACO_PADRAO,
      quantidade_m3: 8,
      peso_balanca_kg: 14500,
    });

    expect(r.peso_bruto_teorico_kg).toBe(14800); // 1850 * 8
    expect(r.peso_balanca_kg).toBe(14500);
    expect(r.perda_kg).toBe(300); // 14800 - 14500
    expect(r.perda_pct).toBeCloseTo(2.027, 3); // 300 / 14800 * 100
    expect(r.ano_mes).toBe("2026-03");
    expect(r.ano_semana).toBe("2026-10");
  });

  it("não calcula perda quando a balança ainda não foi informada", () => {
    const r = computeCarga({
      data: "2026-03-05",
      tipo_origem: "propria",
      traco: TRACO_PADRAO,
      quantidade_m3: 8,
    });

    expect(r.peso_bruto_teorico_kg).toBe(14800);
    expect(r.peso_balanca_kg).toBeNull();
    expect(r.perda_kg).toBeNull();
    expect(r.perda_pct).toBeNull();
  });

  it("trata consumos nulos no traço como zero em vez de quebrar a soma", () => {
    const tracoIncompleto: TracoConsumo = {
      consumo_cimento_kg_m3: 300,
      consumo_brita00_kg_m3: null,
      consumo_brita01_kg_m3: null,
      consumo_po_brita_kg_m3: null,
      consumo_areia_kg_m3: 650,
    };

    const r = computeCarga({
      data: "2026-03-05",
      tipo_origem: "propria",
      traco: tracoIncompleto,
      quantidade_m3: 10,
    });

    expect(r.peso_bruto_teorico_kg).toBe(9500); // (300 + 650) * 10
  });

  it("não calcula percentual de perda quando o peso teórico dá zero (evita divisão por zero)", () => {
    const tracoVazio: TracoConsumo = {
      consumo_cimento_kg_m3: null,
      consumo_brita00_kg_m3: null,
      consumo_brita01_kg_m3: null,
      consumo_po_brita_kg_m3: null,
      consumo_areia_kg_m3: null,
    };

    const r = computeCarga({
      data: "2026-03-05",
      tipo_origem: "propria",
      traco: tracoVazio,
      quantidade_m3: 8,
      peso_balanca_kg: 100,
    });

    expect(r.peso_bruto_teorico_kg).toBe(0);
    expect(r.perda_kg).toBe(-100); // 0 - 100
    expect(r.perda_pct).toBeNull();
  });

  it("preço fica de fora do cálculo pra usina própria (não pedido no escopo)", () => {
    const r = computeCarga({
      data: "2026-03-05",
      tipo_origem: "propria",
      traco: TRACO_PADRAO,
      quantidade_m3: 8,
      peso_balanca_kg: 14500,
    });

    expect(r.preco_unitario).toBeNull();
    expect(r.preco_total).toBeNull();
  });
});

describe("computeCarga — tipo_origem 'externa'", () => {
  it("pula o cálculo de perda e calcula só o preço total", () => {
    const r = computeCarga({
      data: "2026-03-05",
      tipo_origem: "externa",
      traco: TRACO_PADRAO, // ignorado nesse ramo
      quantidade_m3: 8,
      preco_unitario: 450,
    });

    expect(r.peso_bruto_teorico_kg).toBeNull();
    expect(r.perda_kg).toBeNull();
    expect(r.perda_pct).toBeNull();
    expect(r.preco_unitario).toBe(450);
    expect(r.preco_total).toBe(3600); // 8 * 450
    expect(r.ano_mes).toBe("2026-03");
    expect(r.ano_semana).toBe("2026-10");
  });

  it("preco_total fica nulo se o preço unitário ainda não foi informado", () => {
    const r = computeCarga({
      data: "2026-03-05",
      tipo_origem: "externa",
      traco: TRACO_PADRAO,
      quantidade_m3: 8,
    });

    expect(r.preco_unitario).toBeNull();
    expect(r.preco_total).toBeNull();
  });

  it("mantém peso_balanca_kg se informado, mesmo sem entrar no cálculo de perda", () => {
    const r = computeCarga({
      data: "2026-03-05",
      tipo_origem: "externa",
      traco: TRACO_PADRAO,
      quantidade_m3: 8,
      preco_unitario: 450,
      peso_balanca_kg: 14200,
    });

    expect(r.peso_balanca_kg).toBe(14200);
    expect(r.perda_kg).toBeNull();
    expect(r.perda_pct).toBeNull();
  });
});
