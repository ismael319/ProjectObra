// PDF paginado "de verdade" (jsPDF + autoTable) pra Programação semanal — troca a
// captura de tela usada nos outros exports (html2canvas fatiado em páginas) por uma
// tabela nativa. É o que garante quebra de página sem cortar linha/palavra ao meio —
// autoTable nunca corta o conteúdo de uma linha, sempre move ela inteira pra próxima
// página — além de cabeçalho com aderência repetido em toda página, numeração
// "página/total" e fontes/margens realmente pequenas (texto vetorial, não pixels de
// uma imagem re-escalada).

import type { RowInput } from "jspdf-autotable";
import type { MatrizSemanal, LinhaMatriz } from "./relatorio-visual";
import type { ActivityStatus } from "./adherence";
import type { WBSActivity } from "./xml-parser";
import { WEEKDAY_LABELS } from "./iso-week";
import { COR } from "@/components/relatorio/paleta";

const MARGIN = 18;
const HEADER_HEIGHT = 64;
const DAY_COL_START = 6; // Área, Subárea, ID, Atividade, Início, Término, depois os 7 dias

function formatDataCurta(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatDataAno(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function corStatus(status: string): string | false {
  switch (status as ActivityStatus) {
    case "concluida":
      return COR.emerald300;
    case "parcial":
      return COR.amber300;
    case "nao_concluida":
      return COR.rose300;
    case "pendente":
      return COR.gray300;
    default:
      return false;
  }
}

export async function downloadMatrizSemanalPdf(params: {
  codigo: string;
  nomeProjeto: string;
  gestor?: string;
  dataLabel: string;
  matriz: MatrizSemanal;
  getDetalhe?: (linha: LinhaMatriz) => WBSActivity | null;
  filename: string;
  /** Dados do projeto geral (não da semana) — avanço físico médio do cronograma,
   * datas de início/término de todo o projeto e o local da obra. Undefined/vazio
   * simplesmente some da faixa do cabeçalho, sem quebrar o layout. */
  percentualAvanco?: number;
  dataInicioProjeto?: string;
  dataFimProjeto?: string;
  localizacao?: string;
}): Promise<void> {
  const {
    codigo,
    nomeProjeto,
    gestor,
    dataLabel,
    matriz,
    getDetalhe,
    filename,
    percentualAvanco,
    dataInicioProjeto,
    dataFimProjeto,
    localizacao,
  } = params;
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Faixa com projeto/gestor/data, avanço geral da obra + período do projeto (à
  // esquerda), local da obra, e o resumo de aderência da semana — repetida em toda
  // página via didDrawPage.
  const desenharCabecalho = () => {
    doc.setFillColor(COR.navy);
    doc.rect(MARGIN, MARGIN, pageWidth - MARGIN * 2, HEADER_HEIGHT, "F");
    doc.setTextColor("#ffffff");
    let y = MARGIN + 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`${codigo} · ${nomeProjeto}${gestor ? ` · Gestor: ${gestor.toUpperCase()}` : ""}`, MARGIN + 8, y);
    y += 13;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`Programação semanal · ${dataLabel}`, MARGIN + 8, y);
    y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const infoObra: string[] = [];
    if (dataInicioProjeto) infoObra.push(`Início da obra: ${formatDataAno(new Date(dataInicioProjeto))}`);
    if (dataFimProjeto) infoObra.push(`Término previsto: ${formatDataAno(new Date(dataFimProjeto))}`);
    if (percentualAvanco != null) infoObra.push(`Avanço geral da obra: ${percentualAvanco}%`);
    if (infoObra.length > 0) {
      doc.text(infoObra.join("   ·   "), MARGIN + 8, y);
      y += 11;
    }
    if (localizacao) {
      doc.text(`Local: ${localizacao}`, MARGIN + 8, y);
      y += 11;
    }
    doc.setFontSize(8);
    const aderencia = matriz.aderenciaPct != null ? `${matriz.aderenciaPct}%` : "—";
    doc.text(
      `${matriz.concluidas} concluídas   ${matriz.naoConcluidas} não concluídas   Aderência: ${aderencia} (${matriz.concluidas}/${matriz.totalPlanejadas})`,
      MARGIN + 8,
      y,
    );
  };

  if (matriz.engenheiros.length === 0) {
    desenharCabecalho();
    doc.setTextColor(COR.gray500);
    doc.setFontSize(10);
    doc.text("Nenhuma atividade programada para esta semana.", pageWidth / 2, MARGIN + HEADER_HEIGHT + 30, { align: "center" });
    doc.save(filename);
    return;
  }

  const weekDays = matriz.weekDays;
  const head: RowInput[] = [
    [
      "Área",
      "Subárea",
      "EDT",
      "Atividade",
      "Início",
      "Término",
      ...weekDays.map((d, i) => `${WEEKDAY_LABELS[i]}\n${formatDataCurta(new Date(`${d}T00:00:00`))}`),
    ],
  ];

  const totalCols = DAY_COL_START + weekDays.length;
  const body: RowInput[] = [];
  for (const eng of matriz.engenheiros) {
    body.push([
      { content: eng.nome, colSpan: totalCols, styles: { fillColor: COR.indigo500, textColor: "#ffffff", fontStyle: "bold", fontSize: 8 } },
    ]);
    for (const linha of eng.linhas) {
      const detalhe = getDetalhe?.(linha) ?? null;
      body.push([
        linha.area,
        linha.subarea || "",
        linha.edt || "",
        linha.nome,
        detalhe ? formatDataCurta(detalhe.start) : "—",
        detalhe ? formatDataCurta(detalhe.finish) : "—",
        ...weekDays.map((d) => linha.porDia[d] ?? ""),
      ]);
    }
  }

  autoTable(doc, {
    head,
    body,
    startY: MARGIN + HEADER_HEIGHT + 8,
    margin: { top: MARGIN + HEADER_HEIGHT + 8, left: MARGIN, right: MARGIN, bottom: 24 },
    theme: "grid",
    // Fontes/paddings enxutos — o principal é sobrar espaço pra coluna Atividade
    // (cellWidth "auto" abaixo herda o restante da largura disponível). cellPadding
    // vertical baixo (2, era 3) + minCellHeight fixo deixam a altura das linhas
    // consistente entre si — sem isso, uma linha com Atividade/Subárea mais longa
    // (que quebra em 2 linhas de texto) ficava visivelmente mais alta que as vizinhas.
    styles: { fontSize: 7, cellPadding: { top: 2, bottom: 2, left: 4, right: 4 }, valign: "middle", overflow: "linebreak", lineColor: COR.gray100, lineWidth: 0.5, minCellHeight: 14 },
    headStyles: { fillColor: COR.gray100, textColor: COR.gray800, fontStyle: "bold", fontSize: 7 },
    columnStyles: {
      // Área/Subárea com fonte um pouco menor (cabe mais texto numa linha só, reduz
      // quebra) — quebram linha sozinhas (overflow "linebreak" acima) em vez de
      // estourar a coluna quando mesmo assim não coube.
      0: { cellWidth: 82, fontSize: 6.5, cellPadding: { top: 2, bottom: 2, left: 5, right: 5 } },
      1: { cellWidth: 82, fontSize: 6.5, cellPadding: { top: 2, bottom: 2, left: 5, right: 5 } },
      2: { cellWidth: 30, fontSize: 6.5, textColor: COR.gray500, halign: "center" },
      3: { cellWidth: "auto", fontSize: 6.5 },
      4: { cellWidth: 32, halign: "center" },
      5: { cellWidth: 32, halign: "center" },
      ...Object.fromEntries(weekDays.map((_, i) => [DAY_COL_START + i, { cellWidth: 27, halign: "center" as const }])),
    },
    // Sem texto nas células de dia — a cor vira um "chip" arredondado desenhado à
    // mão em didDrawCell (mais visual que o preenchimento quadrado padrão do
    // autoTable). Dia sem cor (status vazio) = fora do período real da tarefa, mesmo
    // critério da imagem/PNG.
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index < DAY_COL_START) return;
      data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index < DAY_COL_START) return;
      const raw = data.cell.raw;
      if (typeof raw !== "string") return;
      const cor = corStatus(raw);
      if (!cor) return;
      const pad = 3;
      doc.setFillColor(cor);
      doc.roundedRect(data.cell.x + pad, data.cell.y + pad, data.cell.width - pad * 2, data.cell.height - pad * 2, 2.5, 2.5, "F");
    },
    // Nunca quebra uma linha de tarefa no meio entre páginas — o padrão do autoTable
    // já é mover a linha inteira pra página seguinte quando não cabe.
    rowPageBreak: "avoid",
    didDrawPage: desenharCabecalho,
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  let legendaY = finalY + 16;
  if (legendaY > pageHeight - MARGIN) {
    doc.addPage();
    desenharCabecalho();
    legendaY = MARGIN + HEADER_HEIGHT + 20;
  }
  const legenda: [string, string][] = [
    [COR.emerald300, "Concluído"],
    [COR.amber300, "Em execução"],
    [COR.rose300, "Atrasado"],
    [COR.gray300, "Pendente"],
  ];
  let lx = MARGIN;
  doc.setFontSize(7);
  for (const [cor, label] of legenda) {
    doc.setFillColor(cor);
    doc.roundedRect(lx, legendaY - 6, 8, 8, 1.5, 1.5, "F");
    doc.setTextColor(COR.gray800);
    doc.text(label, lx + 12, legendaY);
    lx += 12 + doc.getTextWidth(label) + 16;
  }

  // Numeração "página/total" — só dá pra saber o total depois que a tabela inteira
  // termina (autoTable pode ter criado páginas novas sozinho durante a geração).
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(COR.gray400);
    doc.text(`${i}/${totalPages}`, pageWidth - MARGIN, pageHeight - 8, { align: "right" });
  }

  doc.save(filename);
}
