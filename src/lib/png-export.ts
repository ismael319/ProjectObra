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
  // A opção backgroundColor do html2canvas só preenche área REALMENTE
  // transparente — se o próprio nó capturado tiver um background-color
  // explícito (ex.: bg-background do Tailwind, que segue o tema e fica
  // escuro no dark mode), esse estilo vale mais e a opção é ignorada.
  // Sobrescreve como inline temporário (maior prioridade que qualquer
  // classe) só durante a captura, restaurando logo em seguida — garante o
  // fundo pedido de verdade, sem alterar a tela pro usuário.
  const bgAnterior = node.style.backgroundColor
  node.style.backgroundColor = backgroundColor
  try {
    // html2canvas desenha o conteúdo numa janela/iframe clonada — sem passar
    // windowWidth/windowHeight explícitos, o padrão da lib é window.innerWidth/
    // innerHeight no momento da chamada, o que DEVERIA bater com a tela real,
    // mas na prática (ex.: telas com grid responsivo, breakpoint lg:) o clone
    // às vezes acaba menor e reflui pra layout de coluna única. Fixando
    // explicitamente pro tamanho atual do documento, garante que toda regra
    // responsiva (ex.: grid-cols-3 a partir de lg:) resolve igual no clone e
    // na tela.
    return await html2canvas(node, {
      scale,
      backgroundColor,
      useCORS: true,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
    })
  } finally {
    node.style.backgroundColor = bgAnterior
  }
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

// A4 paisagem: 297mm × 210mm (proporção ≈ 1.4143:1). Captura o conteúdo
// do nó e redesenha num canvas com essa proporção, preservando o layout
// original (escala proporcional + centralizado). Ideal pra dashboards que
// precisam de saída com dimensões previsíveis pra impressão/compartilhamento.
const A4_LARGURA_MM = 297
const A4_ALTURA_MM = 210
const A4_RATIO = A4_LARGURA_MM / A4_ALTURA_MM

export async function downloadNodeAsA4Png(node: HTMLElement, filename: string, backgroundColor = '#ffffff'): Promise<void> {
  const canvasCaptura = await nodeToCanvas(node, 3, backgroundColor)
  const srcW = canvasCaptura.width
  const srcH = canvasCaptura.height
  const srcRatio = srcW / srcH

  let destW: number
  let destH: number
  if (srcRatio > A4_RATIO) {
    // Conteúdo mais largo que A4 — ajusta pela largura
    destW = srcW
    destH = Math.round(srcW / A4_RATIO)
  } else {
    // Conteúdo mais alto que A4 — ajusta pela altura
    destH = srcH
    destW = Math.round(srcH * A4_RATIO)
  }

  const canvasFinal = document.createElement('canvas')
  canvasFinal.width = destW
  canvasFinal.height = destH
  const ctx = canvasFinal.getContext('2d')!
  ctx.fillStyle = backgroundColor
  ctx.fillRect(0, 0, destW, destH)

  // Escala proporcional pra caber no canvas A4
  const scale = Math.min(destW / srcW, destH / srcH)
  const drawW = srcW * scale
  const drawH = srcH * scale
  ctx.drawImage(canvasCaptura, (destW - drawW) / 2, (destH - drawH) / 2, drawW, drawH)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvasFinal.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('Falha ao gerar a imagem A4'))
    }, 'image/png')
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// PDF de uma página só em A4 paisagem (297mm × 210mm). O conteúdo é
// escalado proporcionalmente pra caber na página, centralizado, com a
// cor de fundo preenchendo o espaço restante.
export async function downloadNodeAsPdf(node: HTMLElement, filename: string, backgroundColor = '#ffffff'): Promise<void> {
  const canvas = await nodeToCanvas(node, 2, backgroundColor)
  const { jsPDF } = await import('jspdf')
  const larguraMm = A4_LARGURA_MM
  const alturaMm = A4_ALTURA_MM
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [larguraMm, alturaMm] })
  doc.setFillColor(backgroundColor)
  doc.rect(0, 0, larguraMm, alturaMm, 'F')
  const srcRatio = canvas.width / canvas.height
  const a4Ratio = larguraMm / alturaMm
  let imgW: number, imgH: number, offsetX: number, offsetY: number
  if (srcRatio > a4Ratio) {
    imgW = larguraMm
    imgH = larguraMm / srcRatio
    offsetX = 0
    offsetY = (alturaMm - imgH) / 2
  } else {
    imgH = alturaMm
    imgW = alturaMm * srcRatio
    offsetX = (larguraMm - imgW) / 2
    offsetY = 0
  }
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', offsetX, offsetY, imgW, imgH)
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
