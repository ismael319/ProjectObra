import type { jsPDF as JsPDF } from "jspdf"
import { obterFotoUrl } from "./rdr-db"
import { MESES_PT_SHORT } from "./constants"
import type { RdrRecord } from "./mappers"

const LOGO_SRC: string | null = null

async function carregarImagemParaPdf(path: string): Promise<string> {
  try {
    const url = await obterFotoUrl(path)
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return ""
  }
}

export interface DashboardDados {
  registros: RdrRecord[]
  reconhecimentos: number
  desvios: number
  abertos: number
  finalizados: number
  txConclusaoNoPrazo: number
  prazoMedioDias: number
  metaMensal: number
  taxaDesvios: number
  reincidenciaPct: number
  reincidenciaRegistros: number
  reincidenciaTotalDesvios: number
  porTecnico: Record<string, number>
  porCategoria: Record<string, number>
  porLocal: Record<string, number>
  pendentesPorResponsavel: Record<string, number>
}

export async function gerarPdfRegistro(record: RdrRecord): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()

  if (LOGO_SRC) {
    try {
      doc.addImage(LOGO_SRC, "PNG", 14, 10, 30, 20)
    } catch {
      /* sem logo */
    }
  }
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text("Segurança — ProjectObra", pageWidth - 14, 15, { align: "right" })
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageWidth - 14, 20, { align: "right" })
  doc.setDrawColor(200)
  doc.setLineWidth(0.3)
  doc.line(14, 32, pageWidth - 14, 32)

  doc.setTextColor(0)
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text("REGISTRO DE DESVIO E RECONHECIMENTO", pageWidth / 2, 40, { align: "center" })
  doc.setFont("helvetica", "normal")

  const linhas: [string, string][] = [
    ["Data", record.data_ocorrido ? new Date(record.data_ocorrido + "T00:00:00").toLocaleDateString("pt-BR") : ""],
    ["Hora", record.hora],
    ["Local", record.local],
    ["Registrado por", record.autor_nome],
    ["Responsável pelo setor", record.responsavel_setor],
    ["Responsável pelo registro", record.responsavel_registro],
    ["Nome do colaborador", record.nome_colaborador],
    ["Categorias", (record.categorias ?? []).join(", ")],
    ["Status", record.concluido],
    ["Prazo", record.prazo ? new Date(record.prazo + "T00:00:00").toLocaleDateString("pt-BR") : ""],
  ]

  let y = 50
  for (const [label, value] of linhas) {
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(80)
    doc.text(label.toUpperCase(), 14, y)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(0)
    doc.text(value || "—", 60, y)
    y += 7
  }

  y += 3
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(0)
  doc.text("Descrição do desvio / reconhecimento", 14, y)
  doc.setFont("helvetica", "normal")
  y += 6
  doc.setFontSize(9)
  const descLinhas = doc.splitTextToSize(record.descricao || "", pageWidth - 28) as string[]
  for (const l of descLinhas) {
    if (y > 270) {
      doc.addPage()
      y = 20
    }
    doc.text(l, 14, y)
    y += 5
  }

  if (record.sugestao_correcao) {
    y += 4
    if (y > 265) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Sugestão de correção", 14, y)
    doc.setFont("helvetica", "normal")
    y += 6
    doc.setFontSize(9)
    const sugLinhas = doc.splitTextToSize(record.sugestao_correcao, pageWidth - 28) as string[]
    for (const l of sugLinhas) {
      if (y > 270) {
        doc.addPage()
        y = 20
      }
      doc.text(l, 14, y)
      y += 5
    }
  }

  if (record.fotos?.length) {
    y += 4
    doc.setFontSize(10)
    doc.setFont("helvetica", "bold")
    doc.text("Fotos", 14, y)
    doc.setFont("helvetica", "normal")
    y += 5
    for (const foto of record.fotos) {
      const dataUrl = await carregarImagemParaPdf(foto.path)
      if (!dataUrl) continue
      if (y > 250) {
        doc.addPage()
        y = 20
      }
      const imgW = 80
      const imgH = 60
      try {
        doc.addImage(dataUrl, "JPEG", 14, y, imgW, imgH)
      } catch {
        try {
          doc.addImage(dataUrl, "PNG", 14, y, imgW, imgH)
        } catch {
          continue
        }
      }
      y += imgH + 4
    }
  }

  doc.save(`RDR-${record.data_ocorrido || "sem-data"}-${(record.autor_nome || "sem-autor").replace(/\s+/g, "_")}.pdf`)
}

function novaPaginaPdf(doc: JsPDF, _y: number): number {
  doc.addPage()
  return 20
}

export async function gerarPdfDashboard(dados: DashboardDados): Promise<void> {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text("RDR — RELATÓRIO GERAL", pageWidth / 2, 20, { align: "center" })
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(100)
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, pageWidth / 2, 26, { align: "center" })
  doc.setTextColor(0)

  let y = 36
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text(`Registros: ${dados.registros.length}  ·  Reconhecimentos: ${dados.reconhecimentos}  ·  Desvios: ${dados.desvios}`, 14, y)
  y += 6
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(`Abertos: ${dados.abertos}  ·  Finalizados: ${dados.finalizados}`, 14, y)
  y += 6
  doc.text(
    `Conclusão no prazo: ${dados.txConclusaoNoPrazo}%  ·  Prazo médio: ${dados.prazoMedioDias} dia(s)${dados.metaMensal > 0 ? `  ·  Meta mensal: ${dados.metaMensal}` : ""}`,
    14,
    y
  )
  y += 6
  doc.text(`Taxa de desvios: ${dados.taxaDesvios}%  ·  Reincidência: ${dados.reincidenciaPct}%`, 14, y)
  y += 10

  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Por técnico", 14, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  y += 6
  const tecnicos = Object.entries(dados.porTecnico).sort((a, b) => b[1] - a[1])
  for (const [nome, qtd] of tecnicos) {
    if (y > 270) y = novaPaginaPdf(doc, y)
    doc.text(`${nome}: ${qtd}`, 14, y)
    y += 5
  }

  y += 6
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Por categoria", 14, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  y += 6
  const categorias = Object.entries(dados.porCategoria).sort((a, b) => b[1] - a[1])
  for (const [cat, qtd] of categorias) {
    if (y > 270) y = novaPaginaPdf(doc, y)
    doc.text(`${cat}: ${qtd}`, 14, y)
    y += 5
  }

  y += 6
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Por local", 14, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  y += 6
  const locais = Object.entries(dados.porLocal).sort((a, b) => b[1] - a[1])
  for (const [loc, qtd] of locais) {
    if (y > 270) y = novaPaginaPdf(doc, y)
    doc.text(`${loc}: ${qtd}`, 14, y)
    y += 5
  }

  y += 6
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Pendências por responsável", 14, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  y += 6
  const resp = Object.entries(dados.pendentesPorResponsavel).sort((a, b) => b[1] - a[1])
  for (const [nome, qtd] of resp) {
    if (y > 270) y = novaPaginaPdf(doc, y)
    doc.text(`${nome}: ${qtd}`, 14, y)
    y += 5
  }

  y += 6
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Registros", 14, y)
  y += 6
  for (const r of dados.registros) {
    if (y > 270) y = novaPaginaPdf(doc, y)
    const data = r.data_ocorrido ? new Date(r.data_ocorrido + "T00:00:00").toLocaleDateString("pt-BR") : ""
    doc.setFontSize(9)
    doc.setFont("helvetica", "bold")
    doc.text(`${data}  ${r.autor_nome || ""}`, 14, y)
    doc.setFont("helvetica", "normal")
    y += 4
    doc.setFontSize(8)
    const resumo = `${r.local || ""}${r.local ? " — " : ""}${(r.categorias ?? []).join(", ")} — ${r.concluido || "—"}`
    const linhasResumo = doc.splitTextToSize(resumo, pageWidth - 28) as string[]
    for (const l of linhasResumo) {
      if (y > 275) y = novaPaginaPdf(doc, y)
      doc.text(l, 14, y)
      y += 4
    }
    y += 3
  }

  doc.save(`RDR-Relatorio-${new Date().toISOString().slice(0, 10)}.pdf`)
}

export async function exportarExcelRdr(records: RdrRecord[], dados?: DashboardDados): Promise<void> {
  const XLSX = await import("xlsx")
  const wb = XLSX.utils.book_new()

  const detalhamento = records.map((r, i) => ({
    "#": i + 1,
    "Data": r.data_ocorrido ? new Date(r.data_ocorrido + "T00:00:00").toLocaleDateString("pt-BR") : "",
    "Hora": r.hora,
    "Local": r.local,
    "Registrado por": r.autor_nome,
    "Colaborador": r.nome_colaborador,
    "Responsável setor": r.responsavel_setor,
    "Responsável registro": r.responsavel_registro,
    "Categorias": (r.categorias ?? []).join(", "),
    "Status": r.concluido,
    "Prazo": r.prazo ? new Date(r.prazo + "T00:00:00").toLocaleDateString("pt-BR") : "",
    "Descrição": r.descricao,
    "Sugestão de correção": r.sugestao_correcao,
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalhamento), "Detalhamento")

  const pendentes = records
    .filter((r) => r.concluido !== "SIM")
    .map((r, i) => ({
      "#": i + 1,
      "Data": r.data_ocorrido ? new Date(r.data_ocorrido + "T00:00:00").toLocaleDateString("pt-BR") : "",
      "Registrado por": r.autor_nome,
      "Local": r.local,
      "Categorias": (r.categorias ?? []).join(", "),
      "Prazo": r.prazo ? new Date(r.prazo + "T00:00:00").toLocaleDateString("pt-BR") : "",
      "Descrição": r.descricao,
    }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pendentes), "Pendentes")

  const porTecnico: Record<string, number> = {}
  for (const r of records) {
    const key = r.autor_nome || "—"
    porTecnico[key] = (porTecnico[key] ?? 0) + 1
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      Object.entries(porTecnico)
        .sort((a, b) => b[1] - a[1])
        .map(([nome, qtd]) => ({ "Registrado por": nome, "Total": qtd }))
    ),
    "Por Técnico"
  )

  const porCategoria: Record<string, number> = {}
  for (const r of records) {
    for (const c of r.categorias ?? []) porCategoria[c] = (porCategoria[c] ?? 0) + 1
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      Object.entries(porCategoria)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, qtd]) => ({ "Categoria": cat, "Total": qtd }))
    ),
    "Por Categoria"
  )

  if (dados) {
    const porLocal = Object.entries(dados.porLocal).sort((a, b) => b[1] - a[1])
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(porLocal.map(([local, qtd]) => ({ "Local": local, "Total": qtd }))),
      "Por Local"
    )

    const pendResp = Object.entries(dados.pendentesPorResponsavel).sort((a, b) => b[1] - a[1])
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(pendResp.map(([nome, qtd]) => ({ "Responsável": nome, "Pendentes": qtd }))),
      "Pendências por Responsável"
    )
  }

  const agora = new Date()
  const mes = MESES_PT_SHORT[agora.getMonth()]
  const resumo: { Indicador: string; Valor: string | number }[] = [
    { "Indicador": "Período", "Valor": `${mes}/${agora.getFullYear()}` },
    { "Indicador": "Registros", "Valor": records.length },
    { "Indicador": "Reconhecimentos", "Valor": records.filter((r) => (r.categorias ?? []).includes("Reconhecimento")).length },
    { "Indicador": "Desvios", "Valor": records.filter((r) => !(r.categorias ?? []).includes("Reconhecimento")).length },
    { "Indicador": "Finalizados", "Valor": records.filter((r) => r.concluido === "SIM").length },
    { "Indicador": "Abertos", "Valor": records.filter((r) => r.concluido !== "SIM").length },
  ]
  if (dados) {
    resumo.push(
      { "Indicador": "Conclusão no prazo", "Valor": `${dados.txConclusaoNoPrazo}%` },
      { "Indicador": "Prazo médio de atendimento (dias)", "Valor": dados.prazoMedioDias },
      { "Indicador": "Meta mensal", "Valor": dados.metaMensal || "—" },
      { "Indicador": "Taxa de desvios", "Valor": `${dados.taxaDesvios}%` },
      { "Indicador": "Índice de reincidência", "Valor": `${dados.reincidenciaPct}%` },
      { "Indicador": "Registros de categorias recorrentes", "Valor": `${dados.reincidenciaRegistros} de ${dados.reincidenciaTotalDesvios} desvios` },
    )
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumo), "Resumo")

  XLSX.writeFile(wb, `RDR-${mes}-${agora.getFullYear()}.xlsx`)
}
