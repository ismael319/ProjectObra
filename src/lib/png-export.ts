// Converte um nó DOM em PNG (client-side, sem depender de serviço externo) —
// usado pra gerar a imagem compartilhável do relatório visual da Programação.

import html2canvas from 'html2canvas'

// scale 3 (não 2): o WhatsApp recomprime qualquer imagem enviada como "foto" — um
// PNG de origem mais nítido/maior sobra mais detalhe pro algoritmo de recompressão
// deles trabalhar em cima, o que reduz bastante o efeito de "borrão" no texto
// depois de enviado, mesmo sem controle nenhum sobre a compressão em si.
async function nodeToCanvas(node: HTMLElement, scale = 3): Promise<HTMLCanvasElement> {
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

async function nodeToBlob(node: HTMLElement, scale = 3): Promise<Blob> {
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
