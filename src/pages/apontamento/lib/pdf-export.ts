import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatBR } from "./date-utils";
import type { Apontamento } from "./excel-export";

function sumKey(arr: any[], key: string): number {
  return arr.reduce((s: number, r: Record<string, any>) => s + (Number(r[key]) || 0), 0);
}

type GroupRow = {
  key: string;
  pedreiro: number;
  servente: number;
  carpinteiro: number;
  qntdd_funcao: number;
  total: number;
  dias: number;
  extra?: string[];
};

function groupSum(arr: Apontamento[], keyFn: (a: Apontamento) => string): GroupRow[] {
  const map = new Map<string, GroupRow & { _dates: Set<string> }>();
  for (const a of arr) {
    const k = keyFn(a);
    if (!map.has(k))
      map.set(k, { key: k, pedreiro: 0, servente: 0, carpinteiro: 0, qntdd_funcao: 0, total: 0, dias: 0, _dates: new Set() });
    const g = map.get(k)!;
    g.pedreiro += a.pedreiro; g.servente += a.servente; g.carpinteiro += a.carpinteiro;
    g.qntdd_funcao += a.qntdd_funcao; g.total += a.total; g._dates.add(a.data);
  }
  return [...map.values()].map((g) => ({ key: g.key, pedreiro: g.pedreiro, servente: g.servente, carpinteiro: g.carpinteiro, qntdd_funcao: g.qntdd_funcao, total: g.total, dias: g._dates.size }));
}

function groupSumArea(arr: Apontamento[]): GroupRow[] {
  const map = new Map<string, GroupRow & { _dates: Set<string> }>();
  for (const a of arr) {
    const k = `${a.setor_nome}||${a.area_nome ?? ""}||${a.subarea_nome ?? ""}`;
    if (!map.has(k))
      map.set(k, { key: k, extra: [a.setor_nome, a.area_nome ?? "", a.subarea_nome ?? ""], pedreiro: 0, servente: 0, carpinteiro: 0, qntdd_funcao: 0, total: 0, dias: 0, _dates: new Set() });
    const g = map.get(k)!;
    g.pedreiro += a.pedreiro; g.servente += a.servente; g.carpinteiro += a.carpinteiro;
    g.qntdd_funcao += a.qntdd_funcao; g.total += a.total; g._dates.add(a.data);
  }
  return [...map.values()].map((g) => ({ key: g.key, extra: g.extra, pedreiro: g.pedreiro, servente: g.servente, carpinteiro: g.carpinteiro, qntdd_funcao: g.qntdd_funcao, total: g.total, dias: g._dates.size }));
}

function totalRow(label: string, rows: GroupRow[]): (string | number)[] {
  return [label, "", sumKey(rows, "pedreiro"), sumKey(rows, "servente"), sumKey(rows, "carpinteiro"), sumKey(rows, "qntdd_funcao"), sumKey(rows, "total")];
}

export function buildPdf(apontamentos: Apontamento[]): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  const addTitle = (text: string, y: number) => {
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(text, 14, y);
    return y + 7;
  };

  let y = addTitle("Dados Completos", 15);
  autoTable(doc, {
    startY: y,
    head: [["DATA", "EMPRESA", "LIDERANÇA", "SETOR", "ÁREA", "SUBÁREA", "ATIVIDADE", "PEDREIRO", "SERVENTE", "CARPINTEIRO", "QNTD", "TOTAL", "OBS"]],
    body: apontamentos.map((a) => [formatBR(a.data), a.empresa_nome, a.lideranca_nome, a.setor_nome, a.area_nome ?? "", a.subarea_nome ?? "", a.atividade_nome, a.pedreiro, a.servente, a.carpinteiro, a.qntdd_funcao, a.total, a.obs_planejamento ?? ""]),
    foot: [["TOTAL GERAL", "", "", "", "", "", "", sumKey(apontamentos, "pedreiro"), sumKey(apontamentos, "servente"), sumKey(apontamentos, "carpinteiro"), sumKey(apontamentos, "qntdd_funcao"), sumKey(apontamentos, "total"), ""]],
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [51, 51, 51], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 14, right: 14 },
    didDrawPage: (data) => {
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Apontamento ${formatBR(apontamentos[0]?.data ?? "")} a ${formatBR(apontamentos[apontamentos.length - 1]?.data ?? "")}`, 14, doc.internal.pageSize.getHeight() - 8);
      doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
    },
  });

  doc.addPage();
  y = addTitle("Resumo por Empresa", 15);
  const byEmpresa = groupSum(apontamentos, (a) => a.empresa_nome);
  autoTable(doc, {
    startY: y,
    head: [["EMPRESA", "PEDREIRO", "SERVENTE", "CARPINTEIRO", "QNTD", "TOTAL"]],
    body: byEmpresa.map((g) => [g.key, g.pedreiro, g.servente, g.carpinteiro, g.qntdd_funcao, g.total]),
    foot: [totalRow("TOTAL", byEmpresa)],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [51, 51, 51], textColor: 255 },
    footStyles: { fillColor: [240, 240, 240], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 14, right: 14 },
  });

  doc.addPage();
  y = addTitle("Resumo por Área", 15);
  const byArea = groupSumArea(apontamentos);
  autoTable(doc, {
    startY: y,
    head: [["SETOR", "ÁREA", "SUBÁREA", "PEDREIRO", "SERVENTE", "CARPINTEIRO", "QNTD", "TOTAL", "DIAS", "MÉDIA/DIA"]],
    body: byArea.map((g) => [g.extra?.[0] ?? "", g.extra?.[1] ?? "", g.extra?.[2] ?? "", g.pedreiro, g.servente, g.carpinteiro, g.qntdd_funcao, g.total, g.dias, +(g.total / Math.max(g.dias, 1)).toFixed(1)]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [51, 51, 51], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 14, right: 14 },
  });

  doc.addPage();
  y = addTitle("Resumo por Atividade", 15);
  const byAtv = groupSum(apontamentos, (a) => a.atividade_nome);
  autoTable(doc, {
    startY: y,
    head: [["ATIVIDADE", "PEDREIRO", "SERVENTE", "CARPINTEIRO", "QNTD", "TOTAL", "DIAS", "MÉDIA/DIA"]],
    body: byAtv.map((g) => [g.key, g.pedreiro, g.servente, g.carpinteiro, g.qntdd_funcao, g.total, g.dias, +(g.total / Math.max(g.dias, 1)).toFixed(1)]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [51, 51, 51], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 14, right: 14 },
  });

  doc.addPage();
  y = addTitle("Resumo por Semana", 15);
  const bySem = groupSum(apontamentos, (a) => a.ano_semana).sort((a, b) => a.key.localeCompare(b.key));
  autoTable(doc, {
    startY: y,
    head: [["ANO-SEMANA", "PEDREIRO", "SERVENTE", "CARPINTEIRO", "QNTD", "TOTAL"]],
    body: bySem.map((g) => [g.key, g.pedreiro, g.servente, g.carpinteiro, g.qntdd_funcao, g.total]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [51, 51, 51], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 14, right: 14 },
  });

  return doc;
}

export function downloadPdf(apontamentos: Apontamento[], dataInicio: string, dataFim: string) {
  const doc = buildPdf(apontamentos);
  const fmt = (d: string) => d.split("-").reverse().join("");
  doc.save(`Apontamento_${fmt(dataInicio)}_a_${fmt(dataFim)}.pdf`);
}
