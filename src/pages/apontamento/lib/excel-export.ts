import * as XLSX from "xlsx";
import { formatBR } from "./date-utils";

export type Apontamento = {
  id: string;
  data: string;
  ano_mes: string;
  ano_semana: string;
  empresa_nome: string;
  lideranca_nome: string;
  lideranca_tipo: string;
  setor_nome: string;
  area_nome: string | null;
  subarea_nome: string | null;
  atividade_nome: string;
  pedreiro: number;
  servente: number;
  carpinteiro: number;
  qntdd_funcao: number;
  total: number;
  obs_planejamento: string | null;
};

const HEADERS = [
  "DATA","ANO-MÊS","ANO-SEMANA","EMPRESA","LIDERANÇA","TIPO",
  "SETOR","ÁREA","SUBÁREA","ATIVIDADE",
  "PEDREIRO","SERVENTE","CARPINTEIRO","QNT FUNÇÃO","TOTAL","OBS",
];

function rowFromApontamento(a: Apontamento): (string | number)[] {
  return [
    formatBR(a.data),
    a.ano_mes,
    a.ano_semana,
    a.empresa_nome,
    a.lideranca_nome,
    a.lideranca_tipo,
    a.setor_nome,
    a.area_nome ?? "",
    a.subarea_nome ?? "",
    a.atividade_nome,
    a.pedreiro,
    a.servente,
    a.carpinteiro,
    a.qntdd_funcao,
    a.total,
    a.obs_planejamento ?? "",
  ];
}

function autoSizeFromRows(rows: (string | number)[][]) {
  if (rows.length === 0) return [];
  return rows[0].map((_, idx) => {
    let max = 8;
    for (const r of rows) {
      const v = r[idx];
      const s = v == null ? "" : String(v);
      if (s.length > max) max = s.length;
    }
    return { wch: Math.min(max + 2, 40) };
  });
}

function sumKey<T>(arr: T[], key: keyof T): number {
  return arr.reduce((s, r) => s + ((r[key] as unknown as number) || 0), 0);
}

type Aggregate = {
  key: string;
  pedreiro: number; servente: number; carpinteiro: number; qntdd_funcao: number; total: number;
  dias: number;
};
type AggregateExt = Aggregate & { extra: string[] };

function groupSum(arr: Apontamento[], keyFn: (a: Apontamento) => string): Aggregate[] {
  const map = new Map<string, Aggregate & { _dates: Set<string> }>();
  for (const a of arr) {
    const k = keyFn(a);
    if (!map.has(k)) map.set(k, { key: k, pedreiro:0, servente:0, carpinteiro:0, qntdd_funcao:0, total:0, dias:0, _dates: new Set() });
    const g = map.get(k)!;
    g.pedreiro += a.pedreiro; g.servente += a.servente; g.carpinteiro += a.carpinteiro;
    g.qntdd_funcao += a.qntdd_funcao; g.total += a.total; g._dates.add(a.data);
  }
  return [...map.values()].map((g) => ({ ...g, dias: g._dates.size }));
}

function groupSumExt(arr: Apontamento[], keyFn: (a: Apontamento) => string, extraFn: (a: Apontamento) => string[]): AggregateExt[] {
  const map = new Map<string, AggregateExt & { _dates: Set<string> }>();
  for (const a of arr) {
    const k = keyFn(a);
    if (!map.has(k)) map.set(k, { key: k, extra: extraFn(a), pedreiro:0, servente:0, carpinteiro:0, qntdd_funcao:0, total:0, dias:0, _dates: new Set() });
    const g = map.get(k)!;
    g.pedreiro += a.pedreiro; g.servente += a.servente; g.carpinteiro += a.carpinteiro;
    g.qntdd_funcao += a.qntdd_funcao; g.total += a.total; g._dates.add(a.data);
  }
  return [...map.values()].map((g) => ({ ...g, dias: g._dates.size }));
}

export function buildWorkbook(apontamentos: Apontamento[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const dataRows: (string | number)[][] = [HEADERS];
  for (const a of apontamentos) dataRows.push(rowFromApontamento(a));
  dataRows.push([
    "TOTAL GERAL","","","","","","","","","",
    sumKey(apontamentos, "pedreiro"),
    sumKey(apontamentos, "servente"),
    sumKey(apontamentos, "carpinteiro"),
    sumKey(apontamentos, "qntdd_funcao"),
    sumKey(apontamentos, "total"),
    "",
  ]);
  const ws1 = XLSX.utils.aoa_to_sheet(dataRows);
  ws1["!cols"] = autoSizeFromRows(dataRows);
  XLSX.utils.book_append_sheet(wb, ws1, "Dados Completos");

  const byEmpresa = groupSum(apontamentos, (a) => a.empresa_nome);
  const empRows: (string | number)[][] = [
    ["EMPRESA","PEDREIRO","SERVENTE","CARPINTEIRO","QNT FUNÇÃO","TOTAL"],
    ...byEmpresa.map((g) => [g.key, g.pedreiro, g.servente, g.carpinteiro, g.qntdd_funcao, g.total]),
    ["TOTAL", sumKey(byEmpresa,"pedreiro"), sumKey(byEmpresa,"servente"), sumKey(byEmpresa,"carpinteiro"), sumKey(byEmpresa,"qntdd_funcao"), sumKey(byEmpresa,"total")],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(empRows);
  ws2["!cols"] = autoSizeFromRows(empRows);
  XLSX.utils.book_append_sheet(wb, ws2, "Resumo por Empresa");

  const byArea = groupSumExt(
    apontamentos,
    (a) => `${a.setor_nome}||${a.area_nome ?? ""}||${a.subarea_nome ?? ""}`,
    (a) => [a.setor_nome, a.area_nome ?? "", a.subarea_nome ?? ""],
  );
  const areaRows: (string | number)[][] = [
    ["SETOR","ÁREA","SUBÁREA","PEDREIRO","SERVENTE","CARPINTEIRO","QNT FUNÇÃO","TOTAL","DIAS COM REGISTRO","MÉDIA DIÁRIA"],
    ...byArea.map((g) => [
      g.extra[0], g.extra[1], g.extra[2],
      g.pedreiro, g.servente, g.carpinteiro, g.qntdd_funcao, g.total,
      g.dias, +(g.total / Math.max(g.dias,1)).toFixed(2),
    ]),
  ];
  const ws3 = XLSX.utils.aoa_to_sheet(areaRows);
  ws3["!cols"] = autoSizeFromRows(areaRows);
  XLSX.utils.book_append_sheet(wb, ws3, "Resumo por Área");

  const byAtv = groupSum(apontamentos, (a) => a.atividade_nome);
  const atvRows: (string | number)[][] = [
    ["ATIVIDADE","PEDREIRO","SERVENTE","CARPINTEIRO","QNT FUNÇÃO","TOTAL","DIAS COM REGISTRO","MÉDIA DIÁRIA"],
    ...byAtv.map((g) => [
      g.key, g.pedreiro, g.servente, g.carpinteiro, g.qntdd_funcao, g.total,
      g.dias, +(g.total / Math.max(g.dias,1)).toFixed(2),
    ]),
  ];
  const ws4 = XLSX.utils.aoa_to_sheet(atvRows);
  ws4["!cols"] = autoSizeFromRows(atvRows);
  XLSX.utils.book_append_sheet(wb, ws4, "Resumo por Atividade");

  const bySem = groupSum(apontamentos, (a) => a.ano_semana);
  bySem.sort((a, b) => a.key.localeCompare(b.key));
  const semRows: (string | number)[][] = [
    ["ANO-SEMANA","PEDREIRO","SERVENTE","CARPINTEIRO","QNT FUNÇÃO","TOTAL"],
    ...bySem.map((g) => [g.key, g.pedreiro, g.servente, g.carpinteiro, g.qntdd_funcao, g.total]),
  ];
  const ws5 = XLSX.utils.aoa_to_sheet(semRows);
  ws5["!cols"] = autoSizeFromRows(semRows);
  XLSX.utils.book_append_sheet(wb, ws5, "Resumo por Semana");

  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

export function exportFilename(dataInicio: string, dataFim: string): string {
  const fmt = (d: string) => d.split("-").reverse().join("");
  return `Apontamento_${fmt(dataInicio)}_a_${fmt(dataFim)}.xlsx`;
}
