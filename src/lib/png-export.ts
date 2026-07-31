// Converte um nó DOM em PNG (client-side, sem depender de serviço externo) —
// usado pra gerar a imagem compartilhável do relatório visual da Programação.

import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

async function nodeToCanvas(node: HTMLElement, scale = 2): Promise<HTMLCanvasElement> {
  // Os cards de relatório (ver paleta.ts) só usam cores em hex literal — nada de
  // oklch()/oklab() — então não precisamos mais do foreignObjectRendering (modo
  // que delega pro motor SVG do navegador). Esse modo é conhecidamente instável
  // no html2canvas 1.4.1 e às vezes gera canvas em branco sem erro nenhum; o modo
  // padrão (clona o DOM e desenha manualmente) é o caminho mais testado da lib.
  return html2canvas(node, {
    scale,
    backgroundColor: '#f3efe9',
    useCORS: true,
  })
}

async function nodeToBlob(node: HTMLElement, scale = 2): Promise<Blob> {
  const canvas = await nodeToCanvas(node, scale)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Falha ao gerar a imagem'))
    }, 'image/png')
  })
}

export async function downloadNodeAsPng(node: HTMLElement, filename: string): Promise<void> {
  const blob = await nodeToBlob(node)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function downloadNodeAsPdf(node: HTMLElement, filename: string): Promise<void> {
  const canvas = await nodeToCanvas(node)
  // Páginas A4, com a imagem ajustada à largura útil da página e fatiada em quantas
  // páginas forem necessárias pra cobrir a altura toda — o card costuma ser bem mais
  // alto que uma página só (várias áreas/tarefas), então uma página única do tamanho
  // da imagem inteira não é um PDF de verdade pra imprimir/ler.
  const doc = new jsPDF({
    orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  })
  const margin = 24
  const usableWidth = doc.internal.pageSize.getWidth() - margin * 2
  const usableHeight = doc.internal.pageSize.getHeight() - margin * 2
  const scale = usableWidth / canvas.width
  const sliceHeightPx = Math.floor(usableHeight / scale)

  const sliceCanvas = document.createElement('canvas')
  const ctx = sliceCanvas.getContext('2d')
  if (!ctx) throw new Error('Falha ao gerar o PDF')
  sliceCanvas.width = canvas.width

  for (let y = 0, primeira = true; y < canvas.height; y += sliceHeightPx, primeira = false) {
    const altura = Math.min(sliceHeightPx, canvas.height - y)
    sliceCanvas.height = altura
    ctx.clearRect(0, 0, sliceCanvas.width, altura)
    ctx.drawImage(canvas, 0, y, canvas.width, altura, 0, 0, canvas.width, altura)
    if (!primeira) doc.addPage()
    doc.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, usableWidth, altura * scale)
  }
  doc.save(filename)
}

/** true quando o navegador consegue de fato compartilhar um arquivo de imagem
 * (Web Share API nível 2 — Safari/Chrome mobile; a maioria dos navegadores
 * desktop não suporta e cai pro botão "Baixar imagem" sozinho). */
export function canShareFiles(): boolean {
  if (!navigator.share || !navigator.canShare) return false
  try {
    const probe = new File([''], 'probe.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export async function shareNodeAsPng(node: HTMLElement, filename: string, title: string): Promise<void> {
  const blob = await nodeToBlob(node)
  const file = new File([blob], filename, { type: 'image/png' })
  await navigator.share({ files: [file], title })
}
