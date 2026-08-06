// Converte um nó DOM em PNG (client-side, sem depender de serviço externo) —
// usado pra gerar a imagem compartilhável do relatório visual da Programação
// e as exportações de dashboard (imagem/PDF).

// html2canvas "normal" (1.4.1) tem um parser de cor anterior ao CSS Color 4
// e LANÇA EXCEÇÃO ("Attempting to parse an unsupported color function")
// assim que encontra oklch()/oklab() — o tema inteiro do app (src/index.css)
// é declarado em oklch(), então qualquer captura de um componente shadcn
// "normal" (Card, Button...) falhava por completo, não só ficava com cor
// errada. html2canvas-pro é o mesmo pacote (fork ativo, mesma API) só que
// com CSS Color 4 suportado nativamente — sem precisar reescrever cor
// nenhuma na mão antes de capturar.
import html2canvas from 'html2canvas-pro'

// scale 3 (não 2): o WhatsApp recomprime qualquer imagem enviada como "foto" — um
// PNG de origem mais nítido/maior sobra mais detalhe pro algoritmo de recompressão
// deles trabalhar em cima, o que reduz bastante o efeito de "borrão" no texto
// depois de enviado, mesmo sem controle nenhum sobre a compressão em si.
// backgroundColor tem esse tom bege por padrão (cor dos cards de relatório da
// Programação, ver paleta.ts) — outros chamadores (dashboards com tema claro/
// escuro) devem passar a própria cor de fundo explicitamente.
async function nodeToCanvas(node: HTMLElement, scale = 3, backgroundColor = '#f3efe9'): Promise<HTMLCanvasElement> {
  return html2canvas(node, {
    scale,
    backgroundColor,
    useCORS: true,
  })
}

async function nodeToBlob(node: HTMLElement, scale = 3, backgroundColor = '#f3efe9'): Promise<Blob> {
  const canvas = await nodeToCanvas(node, scale, backgroundColor)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Falha ao gerar a imagem'))
    }, 'image/png')
  })
}

export async function downloadNodeAsPng(node: HTMLElement, filename: string, backgroundColor = '#f3efe9'): Promise<void> {
  const blob = await nodeToBlob(node, 3, backgroundColor)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// PDF de uma página só, com o tamanho da página ajustado pra MESMA proporção
// do conteúdo capturado (em vez de forçar A4 e cortar/sobrar margem) — feito
// pra telas de dashboard, bem mais largas que altas. scale menor que o padrão
// de compartilhamento (2, não 3): PDF/impressão não tem a recompressão do
// WhatsApp que scale=3 foi calibrado pra compensar, e um canvas 3x de um
// dashboard inteiro (vários gráficos Recharts) fica pesado à toa.
export async function downloadNodeAsPdf(node: HTMLElement, filename: string, backgroundColor = '#ffffff'): Promise<void> {
  const canvas = await nodeToCanvas(node, 2, backgroundColor)
  const { jsPDF } = await import('jspdf')
  const larguraMm = 297 // A4 paisagem
  const alturaMm = (canvas.height / canvas.width) * larguraMm
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [larguraMm, alturaMm] })
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, larguraMm, alturaMm)
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

/** true quando o navegador suporta compartilhar texto puro via Web Share API — bem
 * mais comum que canShareFiles (não depende de suporte a File), inclusive em Chrome
 * desktop. Usado pra oferecer "Enviar mensagem" direto pro WhatsApp sem anexo. */
export function canShareText(): boolean {
  return typeof navigator.share === 'function'
}

export async function shareText(text: string, title?: string): Promise<void> {
  await navigator.share({ text, title })
}
