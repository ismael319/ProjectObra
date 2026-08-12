// PDF paginado "de verdade" (jsPDF + autoTable) pra Programação do dia — mesma
// técnica do PDF da semanal (matriz-semanal-pdf.ts): tabela nativa em vez de
// captura de tela fatiada, o que garante quebra de página sem cortar linha/palavra
// ao meio (autoTable sempre move uma linha inteira pra próxima página quando ela não
// cabe), cabeçalho repetido em toda página e numeração "página/total".

import type { RowInput } from "jspdf-autotable";
import type { RelatorioVisual } from "./relatorio-visual";
import { COR } from "@/components/relatorio/paleta";

const MARGIN = 18;
const HEADER_HEIGHT = 44;

function corStatus(status: string): string | false {
  switch (status) {
    case "concluida":
      return COR.emerald300;
    case "parcial":
      return COR.amber300;
    case "nao_concluida":
      return COR.rose300;
    case "extra":
      return COR.amber300;
    case "pendente":
      return COR.gray300;
    default:
      return false;
  }
}

export async function downloadRelatorioDiaPdf(params: {
  codigo: string;
  nomeProjeto: string;
  gestor?: string;
  tipo: string;
  dataLabel: string;
  relatorio: RelatorioVisual;
  filename: string;
}): Promise<void> {
  const { codigo, nomeProjeto, gestor, tipo, dataLabel, relatorio, filename } = params;
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const desenharCabecalho = () => {
    doc.setFillColor(COR.navy);
    doc.rect(MARGIN, MARGIN, pageWidth - MARGIN * 2, HEADER_HEIGHT, "F");
    doc.setTextColor("#ffffff");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`${codigo} · ${nomeProjeto}${gestor ? ` · Gestor: ${gestor.toUpperCase()}` : ""}`, MARGIN + 8, MARGIN + 12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${tipo} · ${dataLabel}`, MARGIN + 8, MARGIN + 26);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const aderencia = relatorio.aderenciaPct != null ? `${relatorio.aderenciaPct}%` : "—";
    doc.text(
      `${relatorio.concluidas} concluídas   ${relatorio.naoConcluidas} não concluídas   Aderência: ${aderencia} (${relatorio.concluidas}/${relatorio.totalPlanejadas})`,
      MARGIN + 8,
      MARGIN + 38,
    );
  };

  if (relatorio.totalAtividades === 0) {
    desenharCabecalho();
    doc.setTextColor(COR.gray500);
    doc.setFontSize(10);
    doc.text("Nenhuma atividade programada para este período.", pageWidth / 2, MARGIN + HEADER_HEIGHT + 30, { align: "center" });
    doc.save(filename);
    return;
  }

  const body: RowInput[] = [];
  for (const area of relatorio.areas) {
    body.push([{ content: area.nome, colSpan: 2, styles: { fillColor: COR.gray100, textColor: COR.gray800, fontStyle: "bold", fontSize: 8 } }]);
    for (const item of area.itens) {
      const nomeComSubarea = item.subarea ? `${item.nome} — ${item.subarea}` : item.nome;
      body.push([item.isExtra ? "extra" : item.status, `${nomeComSubarea}${item.isExtra ? "  (extra)" : ""}`]);
      for (const sub of item.subetapas) {
        body.push([sub.status, `    • ${sub.nome}`]);
      }
    }
  }

  autoTable(doc, {
    body,
    startY: MARGIN + HEADER_HEIGHT + 8,
    margin: { top: MARGIN + HEADER_HEIGHT + 8, left: MARGIN, right: MARGIN, bottom: 24 },
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 4, valign: "middle", overflow: "linebreak", lineColor: COR.gray100, lineWidth: 0.5 },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: "auto" },
    },
    // Sem texto na célula de status — a cor vira um "chip" arredondado desenhado à
    // mão em didDrawCell, mais visual que o preenchimento quadrado padrão. Só quando
    // raw é string (status "concluida"/"pendente"/etc.) — a linha de cabeçalho da
    // área também cai na coluna 0 (por causa do colSpan), mas o raw dela é o objeto
    // {content, colSpan, styles}, não string; sem essa checagem, o nome da área
    // também era limpo e a linha ficava em branco.
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      if (typeof data.cell.raw !== "string") return;
      data.cell.text = [];
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      const raw = data.cell.raw;
      if (typeof raw !== "string") return;
      const cor = corStatus(raw);
      if (!cor) return;
      const pad = 4;
      doc.setFillColor(cor);
      doc.roundedRect(data.cell.x + pad, data.cell.y + pad, data.cell.width - pad * 2, data.cell.height - pad * 2, 2.5, 2.5, "F");
    },
    // Nunca quebra uma atividade no meio entre páginas — o padrão do autoTable já é
    // mover a linha inteira pra próxima página quando ela não cabe.
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
    [COR.emerald300, "Concluída"],
    [COR.amber300, "Parcial / Extra"],
    [COR.rose300, "Não concluída"],
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

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(COR.gray400);
    doc.text(`${i}/${totalPages}`, pageWidth - MARGIN, pageHeight - 8, { align: "right" });
  }

  doc.save(filename);
}
