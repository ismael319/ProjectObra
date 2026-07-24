import * as XLSX from 'xlsx'
import { saveAs } from 'file-saver'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { WBSActivity, WBSResource, WBSAssignment } from './xml-parser'
import type { ProjectIndices } from './project-calculations'

export function exportToExcel(
  activities: WBSActivity[],
  resources: WBSResource[],
  assignments: WBSAssignment[],
  projectName: string
) {
  const wb = XLSX.utils.book_new()

  // Sheet de Atividades
  const actData = activities.map((a) => ({
    'WBS': a.wbs,
    'Atividade': a.name,
    'Início': a.start.toLocaleDateString('pt-BR'),
    'Término': a.finish.toLocaleDateString('pt-BR'),
    'Duração (dias)': Math.ceil(a.duration / (8 * 60)),
    'Progresso (%)': a.percentComplete,
    'Responsável': a.responsible,
    'Disciplina': a.discipline,
    'Área': a.area,
    'Custo Estimado': a.cost || 0,
    'Custo Real': a.actualCost || 0,
    'Status': a.percentComplete === 100 ? 'Concluído' :
              a.percentComplete > 0 ? 'Em andamento' :
              a.finish < new Date() ? 'Atrasado' : 'Pendente',
  }))
  const wsAct = XLSX.utils.json_to_sheet(actData)
  wsAct['!cols'] = [
    { wch: 10 }, { wch: 40 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 20 },
    { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
  ]
  XLSX.utils.book_append_sheet(wb, wsAct, 'Atividades')

  // Sheet de Recursos
  const resData = resources.map((r) => ({
    'UID': r.uid,
    'Nome': r.name,
    'Tipo': r.type === 1 ? 'Trabalho' : r.type === 2 ? 'Material' : 'Custo',
    'Função': r.role,
    'Grupo': r.group,
    'Código': r.code,
    'Taxa Base': r.baseRate,
    'Máx. Unidades': r.maxUnits,
  }))
  const wsRes = XLSX.utils.json_to_sheet(resData)
  XLSX.utils.book_append_sheet(wb, wsRes, 'Recursos')

  // Sheet de Alocações
  const assignData = assignments.map((a) => {
    const act = activities.find((t) => t.uid === a.taskUid)
    const res = resources.find((r) => r.uid === a.resourceUid)
    return {
      'Atividade': act?.name || '',
      'WBS': act?.wbs || '',
      'Recurso': res?.name || '',
      'Unidades': a.units,
      'Trabalho (h)': Math.round(a.work / 60 * 10) / 10,
      'Trabalho Real (h)': Math.round(a.actualWork / 60 * 10) / 10,
      'Custo': a.cost,
      'Custo Real': a.actualCost,
    }
  })
  const wsAssign = XLSX.utils.json_to_sheet(assignData)
  XLSX.utils.book_append_sheet(wb, wsAssign, 'Alocações')

  // Salvar
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  saveAs(blob, `${projectName.replace(/\s+/g, '_')}_cronograma.xlsx`)
}

export function exportSCurveToExcel(
  curveData: Array<{
    date: string
    label: string
    planned: number
    actual: number
    forecast: number
    plannedPeriod: number
    actualPeriod: number
    forecastPeriod: number
    blCum: Record<string, number>
    blPeriod: Record<string, number>
  }>,
  baselineIds: string[],
  unitLabel: string,
  projectName: string,
  advances?: {
    statusDate: string
    statusDateFormatted: string
    real: { percent: number; absolute: number; deltaPP: number }
    baselines: Array<{ id: string; label: string; metric: { percent: number; absolute: number; deltaPP: number } }>
  },
  periodLabel: string = 'Sem.',
) {
  const wb = XLSX.utils.book_new()

  // Sheet: Avanço Atual
  if (advances) {
    const advRows = [
      { Métrica: 'AVANÇO REAL (%)', 'Valor': advances.real.percent.toFixed(1) + '%', 'Absoluto': advances.real.absolute, 'Variação (pp)': (advances.real.deltaPP > 0 ? '+' : '') + advances.real.deltaPP.toFixed(1) },
      ...advances.baselines.map((bl) => ({
        Métrica: `AVANÇO ${bl.label.toUpperCase()} (%)`,
        'Valor': bl.metric.percent.toFixed(1) + '%',
        'Absoluto': bl.metric.absolute,
        'Variação (pp)': (bl.metric.deltaPP > 0 ? '+' : '') + bl.metric.deltaPP.toFixed(1),
      })),
      { Métrica: '', 'Valor': '', 'Absoluto': '', 'Variação (pp)': '' },
      { Métrica: 'Data de Status', 'Valor': advances.statusDate, 'Absoluto': advances.statusDateFormatted, 'Variação (pp)': '' },
      { Métrica: 'Unidade', 'Valor': unitLabel, 'Absoluto': '', 'Variação (pp)': '' },
    ]
    const wsAdv = XLSX.utils.json_to_sheet(advRows)
    wsAdv['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 18 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, wsAdv, 'Avanço Atual')
  }

  // Sheet: Curva S por Período
  const headers = [
    'Data', 'Período',
    'Real Acum.', `Real ${periodLabel}`,
    'Previsto Acum.', `Previsto ${periodLabel}`,
    'Forecast Acum.', `Forecast ${periodLabel}`,
  ]
  for (const blId of baselineIds) {
    headers.push(`${blId} Acum.`, `${blId} ${periodLabel}`)
  }

  const rows = curveData.map((w) => {
    const row: (string | number)[] = [
      w.date,
      w.label,
      Math.round(w.actual * 100) / 100,
      Math.round(w.actualPeriod * 100) / 100,
      Math.round(w.planned * 100) / 100,
      Math.round(w.plannedPeriod * 100) / 100,
      Math.round(w.forecast * 100) / 100,
      Math.round(w.forecastPeriod * 100) / 100,
    ]
    for (const blId of baselineIds) {
      row.push(Math.round((w.blCum[blId] || 0) * 100) / 100)
      row.push(Math.round((w.blPeriod[blId] || 0) * 100) / 100)
    }
    return row
  })

  const wsData = XLSX.utils.aoa_to_sheet([headers, ...rows])
  wsData['!cols'] = headers.map((_, i) => ({ wch: i < 2 ? 14 : 16 }))
  XLSX.utils.book_append_sheet(wb, wsData, 'Curva S por Período')

  // Sheet: Curva S Percentual
  const lastWeek = curveData[curveData.length - 1]
  if (lastWeek) {
    const totalPlanned = lastWeek.planned
    const pctHeaders = ['Data', 'Período', 'Real %', 'Previsto %', 'Forecast %']
    for (const blId of baselineIds) {
      pctHeaders.push(`${blId} %`)
    }

    const pctRows = curveData.map((w) => {
      const row: (string | number)[] = [
        w.date,
        w.label,
        totalPlanned > 0 ? Math.round((w.actual / totalPlanned) * 1000) / 10 : 0,
        totalPlanned > 0 ? Math.round((w.planned / totalPlanned) * 1000) / 10 : 0,
        totalPlanned > 0 ? Math.round((w.forecast / totalPlanned) * 1000) / 10 : 0,
      ]
      for (const blId of baselineIds) {
        const blLast = lastWeek.blCum[blId] || 0
        row.push(blLast > 0 ? Math.round(((w.blCum[blId] || 0) / blLast) * 1000) / 10 : 0)
      }
      return row
    })

    const wsPct = XLSX.utils.aoa_to_sheet([pctHeaders, ...pctRows])
    wsPct['!cols'] = pctHeaders.map((_, i) => ({ wch: i < 2 ? 14 : 12 }))
    XLSX.utils.book_append_sheet(wb, wsPct, 'Curva S Percentual')
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  saveAs(blob, `${projectName.replace(/\s+/g, '_')}_curva_s.xlsx`)
}

/** Exporta a tabela larga da Curva S (SCurveWideTable) com os valores absolutos em H/R$ — a tela mostra em %, o export mantém os números originais pra quem precisa avaliá-los. */
export function exportWideTableToExcel(
  title: string,
  rows: { metric: string; total: number; values: number[] }[],
  periodLabels: string[],
  unitSuffix: string,
) {
  const wb = XLSX.utils.book_new()
  const round2 = (v: number) => Math.round(v * 100) / 100
  const headers = ['Métrica', `Total (${unitSuffix})`, ...periodLabels]
  const data = rows.map((row) => [row.metric, round2(row.total), ...row.values.map(round2)])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data])
  XLSX.utils.book_append_sheet(wb, ws, 'Valores')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/octet-stream' })
  saveAs(blob, `${title.replace(/\s+/g, '_')}_valores.xlsx`)
}

export function exportToPDF(
  activities: WBSActivity[],
  indices: ProjectIndices | null,
  projectName: string
) {
  const doc = new jsPDF('landscape', 'mm', 'a4')

  // Título
  doc.setFontSize(18)
  doc.text(`Relatório: ${projectName}`, 14, 15)
  doc.setFontSize(10)
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22)

  // Índices
  if (indices) {
    doc.setFontSize(12)
    doc.text('Índices de Desempenho', 14, 32)
    doc.setFontSize(9)
    doc.text(`SPI: ${indices.SPI} | CPI: ${indices.CPI} | PPC: ${indices.PPC}%`, 14, 38)
    doc.text(`PV: R$ ${indices.PV.toLocaleString('pt-BR')} | EV: R$ ${indices.EV.toLocaleString('pt-BR')} | AC: R$ ${indices.AC.toLocaleString('pt-BR')}`, 14, 44)
    doc.text(`EAC: R$ ${indices.EAC.eac1.toLocaleString('pt-BR')} | ETC: R$ ${indices.ETC.eac1.toLocaleString('pt-BR')} | VAC: R$ ${indices.VAC.toLocaleString('pt-BR')}`, 14, 50)
  }

  // Tabela de Atividades
  const tableData = activities
    .filter((a) => !a.isSummary)
    .slice(0, 50) // Limitar para PDF
    .map((a) => [
      a.wbs,
      a.name.substring(0, 40),
      a.start.toLocaleDateString('pt-BR'),
      a.finish.toLocaleDateString('pt-BR'),
      `${Math.ceil(a.duration / (8 * 60))}d`,
      `${a.percentComplete}%`,
      a.responsible || '-',
      a.discipline || '-',
      a.percentComplete === 100 ? 'OK' :
      a.percentComplete > 0 ? 'AND' :
      a.finish < new Date() ? 'ATR' : 'PEN',
    ])

  autoTable(doc, {
    startY: indices ? 58 : 30,
    head: [['WBS', 'Atividade', 'Início', 'Término', 'Duração', 'Progresso', 'Responsável', 'Disciplina', 'Status']],
    body: tableData,
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246] },
    alternateRowStyles: { fillColor: [249, 250, 251] },
  })

  doc.save(`${projectName.replace(/\s+/g, '_')}_relatorio.pdf`)
}
