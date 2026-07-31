// Converte um nó DOM em PNG (client-side, sem depender de serviço externo) —
// usado pra gerar a imagem compartilhável do relatório visual da Programação.

import html2canvas from 'html2canvas'

async function nodeToBlob(node: HTMLElement, scale = 2): Promise<Blob> {
  const canvas = await html2canvas(node, {
    scale,
    backgroundColor: '#f3efe9',
    useCORS: true,
  })
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
