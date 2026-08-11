// Converte uma página de PDF em imagem, para a planta poder ser enviada direto
// do PDF exportado do AutoCAD em vez de exigir um PNG.
//
// A conversão acontece no UPLOAD, não na exibição: o resto do módulo (recorte,
// escala, posição das células) trabalha em cima de um sistema de coordenadas em
// pixels de imagem. Renderizar o PDF a cada abertura obrigaria a refazer essa
// conta toda vez e a manter o worker do pdfjs carregado só para ver o mapa.
//
// Mesmo setup de worker de src/pages/qualidade/concreto/lib/pdf-ensaios-estrutec.ts.

import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/**
 * Largura alvo do PNG gerado.
 *
 * Planta de obra tem muita linha fina: renderizar no tamanho nominal do PDF sai
 * ilegível ao dar zoom num setor. Por outro lado, escala alta demais gera um
 * arquivo enorme para subir do celular em obra — 2400px é o meio-termo.
 */
const LARGURA_ALVO = 2400
const ESCALA_MAXIMA = 4

export async function contarPaginasPdf(arquivo: File): Promise<number> {
  const buf = await arquivo.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  return doc.numPages
}

/**
 * Renderiza uma página (1-based) e devolve um PNG pronto para upload.
 */
export async function pdfPaginaParaPng(
  arquivo: File,
  pagina = 1,
): Promise<{ blob: Blob; largura: number; altura: number }> {
  const buf = await arquivo.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise

  if (pagina < 1 || pagina > doc.numPages) {
    throw new Error(`O PDF tem ${doc.numPages} página(s); a ${pagina} não existe.`)
  }

  const page = await doc.getPage(pagina)
  const base = page.getViewport({ scale: 1 })
  const escala = Math.min(ESCALA_MAXIMA, Math.max(1, LARGURA_ALVO / base.width))
  const viewport = page.getViewport({ scale: escala })

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar o canvas para renderizar o PDF.')

  // Planta costuma ter fundo transparente no PDF; sem pintar de branco, ela
  // vira um PNG com transparência e some no tema escuro do app.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await page.render({ canvas, canvasContext: ctx, viewport }).promise

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Falha ao gerar a imagem da planta.')

  return { blob, largura: canvas.width, altura: canvas.height }
}

export function ehPdf(arquivo: File): boolean {
  return arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf')
}

/** Dimensões naturais de um arquivo de imagem já pronto. */
export function medirImagem(arquivo: File): Promise<{ largura: number; altura: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ largura: img.naturalWidth, altura: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Arquivo não é uma imagem válida.'))
    }
    img.src = url
  })
}
