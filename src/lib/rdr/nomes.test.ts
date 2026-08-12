import { describe, it, expect } from "vitest";
import { nomeAmigavel } from "./nomes";

describe("nomeAmigavel", () => {
  it("converte email simples em nome capitalizado", () => {
    expect(nomeAmigavel("ale.wanderley@hotmail.com")).toBe("Ale Wanderley");
  });

  it("converte email com underscore e hífen", () => {
    expect(nomeAmigavel("joao_silva-xavier@empresa.com")).toBe("Joao Silva Xavier");
  });

  it("converte email de parte única", () => {
    expect(nomeAmigavel("maria@empresa.com")).toBe("Maria");
  });

  it("mantém texto que não parece email sem alteração", () => {
    expect(nomeAmigavel("João da Silva")).toBe("João da Silva");
    expect(nomeAmigavel("")).toBe("");
  });
});
