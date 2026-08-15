import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus, ScanSearch, Settings2 } from 'lucide-react'
import type { MapaSetoresMarcador, MapaSetoresPlanta } from '@/lib/mapa-setores/mapa-setores-db'
import { CAMPO_LABEL, formatarValorCampo, type CampoCard, type EngenheiroDoSetor, type ValorCampo } from '@/lib/mapa-setores/progresso'
import { STATUS_SETORES, type SetorVisual } from '@/lib/mapa-setores/status'
import {
  cameraParaEnquadrarMapaSetores,
  cameraParaPontoMapaSetores,
  limitarCameraMapaSetores,
} from '@/lib/mapa-setores/camera'

// Interação de arraste inteira (marcador ponto/área, card solto, criação por clique ou
// retângulo) é mouse events manuais, sem lib de drag — o projeto não tem nenhuma
// (framer-motion/dnd-kit/etc). Segue a mesma técnica já usada em MapaViewport.tsx: escala
// = largura do container / largura do recorte, listeners de "soltar" no `window` (não no
// elemento) pra não perder o solto se o cursor sair da área durante o arraste.

export type ModoEdicao = 'nenhum' | 'ponto' | 'area' | 'recorte'

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

interface GeometriaPonto {
  tipo: 'ponto'
  posXPct: number
  posYPct: number
}
interface GeometriaArea {
  tipo: 'area'
  areaXPct: number
  areaYPct: number
  areaWPct: number
  areaHPct: number
}
export type NovaGeometria = GeometriaPonto | GeometriaArea

interface Props {
  planta: MapaSetoresPlanta
  imagemUrl: string
  marcadores: MapaSetoresMarcador[]
  camposPorMarcador: Map<string, Partial<Record<CampoCard, ValorCampo>>>
  engenheiroPorMarcador: Map<string, EngenheiroDoSetor>
  orfaoPorMarcador: Map<string, boolean>
  setoresVisuais: SetorVisual[]
  idsVisiveis: Set<string>
  setorSelecionadoId: string | null
  versaoFoco: number
  modo: ModoEdicao
  podeEditar: boolean
  onSelecionarSetor: (id: string | null) => void
  onCriarPendente: (geometria: NovaGeometria, cardPos: { x: number; y: number }) => void
  onMoverMarcador: (id: string, campos: Partial<MapaSetoresMarcador>) => void
  onRecortar: (crop: { x: number; y: number; w: number; h: number }) => void
  onConfigurarCaixa: (id: string) => void
  onPropriedadesCard: (id: string) => void
}

type ModoDrag = 'move-point' | 'move-area' | 'resize-area' | 'move-card'
const ORDEM_CAMPOS: CampoCard[] = ['inicio', 'termino', 'avanco_prev', 'avanco_concl']

export default function PalcoSetores({
  planta,
  imagemUrl,
  marcadores,
  camposPorMarcador,
  engenheiroPorMarcador,
  orfaoPorMarcador,
  setoresVisuais,
  idsVisiveis,
  setorSelecionadoId,
  versaoFoco,
  modo,
  podeEditar,
  onSelecionarSetor,
  onCriarPendente,
  onMoverMarcador,
  onRecortar,
  onConfigurarCaixa,
  onPropriedadesCard,
}: Props) {
  const [menuContexto, setMenuContexto] = useState<{ marcadorId: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuContexto) return
    const fechar = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setMenuContexto(null)
    }
    window.addEventListener('mousedown', fechar)
    window.addEventListener('scroll', fechar, true)
    return () => {
      window.removeEventListener('mousedown', fechar)
      window.removeEventListener('scroll', fechar, true)
    }
  }, [menuContexto])
  const containerRef = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  const [camera, setCamera] = useState({ zoom: 1, x: 0, y: 0 })
  const cameraDragRef = useRef<{ pointerId: number; startX: number; startY: number; cameraX: number; cameraY: number } | null>(null)
  const toquesRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distancia: number; zoom: number; mundoX: number; mundoY: number } | null>(null)
  const [zoomAreaAtivo, setZoomAreaAtivo] = useState(false)
  const [caixaZoom, setCaixaZoom] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const caixaZoomRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const inicioZoomRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => setLargura(entry.contentRect.width))
    obs.observe(el)
    setLargura(el.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [])

  const crop = { x: planta.crop_x, y: planta.crop_y, w: planta.crop_w, h: planta.crop_h }
  const cropVisivel = modo === 'recorte' ? { x: 0, y: 0, w: planta.largura_natural, h: planta.altura_natural } : crop
  const escala = largura > 0 && cropVisivel.w > 0 ? largura / cropVisivel.w : 0
  const alturaViewport = cropVisivel.h * escala
  const viewport = { largura, altura: alturaViewport }
  const setorVisualPorId = useMemo(() => new Map(setoresVisuais.map((setor) => [setor.id, setor])), [setoresVisuais])

  function ajustarZoom(novoZoom: number, ponto?: { x: number; y: number }) {
    const el = containerRef.current
    if (!el) return
    setCamera((atual) => {
      if (!ponto) return limitarCameraMapaSetores({ zoom: novoZoom, x: 0, y: 0 }, viewport)
      const mundoX = (ponto.x - atual.x) / atual.zoom
      const mundoY = (ponto.y - atual.y) / atual.zoom
      return limitarCameraMapaSetores(
        { zoom: novoZoom, x: ponto.x - mundoX * novoZoom, y: ponto.y - mundoY * novoZoom },
        viewport,
      )
    })
  }

  function ajustarAoQuadro() {
    setCamera({ zoom: 1, x: 0, y: 0 })
  }

  useEffect(() => {
    setCamera((atual) => limitarCameraMapaSetores(atual, { largura, altura: alturaViewport }))
  }, [largura, alturaViewport])

  // --- overrides locais durante o arraste — some sozinho quando o dado do servidor
  // (vindo da query, depois de invalidada pela mutação) já bate com o valor arrastado.
  const [overrides, setOverrides] = useState<Record<string, Partial<MapaSetoresMarcador>>>({})
  useEffect(() => {
    setOverrides((prev) => {
      let mudou = false
      const next = { ...prev }
      for (const [id, ov] of Object.entries(prev)) {
        const atual = marcadores.find((m) => m.id === id)
        if (!atual) continue
        const bateu = Object.entries(ov).every(
          ([k, v]) => Math.abs((atual[k as keyof MapaSetoresMarcador] as number) - (v as number)) < 0.01,
        )
        if (bateu) {
          delete next[id]
          mudou = true
        }
      }
      return mudou ? next : prev
    })
  }, [marcadores])

  const marcadoresView = useMemo(
    () => marcadores.map((m) => ({ ...m, ...overrides[m.id] })),
    [marcadores, overrides],
  )

  const cropAtual = `${planta.crop_x}:${planta.crop_y}:${planta.crop_w}:${planta.crop_h}`
  const cropAnteriorRef = useRef(cropAtual)
  useEffect(() => {
    if (cropAnteriorRef.current === cropAtual) return
    cropAnteriorRef.current = cropAtual
    setCamera({ zoom: 1, x: 0, y: 0 })
  }, [cropAtual])

  useEffect(() => {
    if (modo === 'nenhum') return
    setZoomAreaAtivo(false)
    setCaixaZoom(null)
    caixaZoomRef.current = null
    inicioZoomRef.current = null
    if (modo === 'recorte') setCamera({ zoom: 1, x: 0, y: 0 })
  }, [modo])

  useEffect(() => {
    if (!setorSelecionadoId || versaoFoco === 0 || !containerRef.current) return
    const marcador = marcadoresView.find((item) => item.id === setorSelecionadoId)
    if (!marcador) return
    const rect = containerRef.current.getBoundingClientRect()
    const dimensoes = { largura: rect.width, altura: rect.height }
    if (marcador.tipo === 'area') {
      setCamera(cameraParaEnquadrarMapaSetores({
        x: rect.width * (marcador.area_x_pct ?? 0) / 100,
        y: rect.height * (marcador.area_y_pct ?? 0) / 100,
        w: rect.width * (marcador.area_w_pct ?? 0) / 100,
        h: rect.height * (marcador.area_h_pct ?? 0) / 100,
      }, dimensoes))
      return
    }
    setCamera(cameraParaPontoMapaSetores({
      x: rect.width * (marcador.pos_x_pct ?? 0) / 100,
      y: rect.height * (marcador.pos_y_pct ?? 0) / 100,
    }, dimensoes))
  }, [setorSelecionadoId, versaoFoco, marcadoresView])

  // --- arraste de marcador/card existente ------------------------------------------
  const dragRef = useRef<{
    id: string
    modo: ModoDrag
    pointerId: number
    startClientX: number
    startClientY: number
    start: MapaSetoresMarcador
  } | null>(null)

  const finalizarDragMarcador = () => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    const atual = marcadoresView.find((m) => m.id === d.id)
    if (!atual) return
    if (d.modo === 'move-point') onMoverMarcador(d.id, { pos_x_pct: atual.pos_x_pct, pos_y_pct: atual.pos_y_pct })
    else if (d.modo === 'move-area') onMoverMarcador(d.id, { area_x_pct: atual.area_x_pct, area_y_pct: atual.area_y_pct })
    else if (d.modo === 'resize-area') onMoverMarcador(d.id, { area_w_pct: atual.area_w_pct, area_h_pct: atual.area_h_pct })
    else if (d.modo === 'move-card') onMoverMarcador(d.id, { card_x_pct: atual.card_x_pct, card_y_pct: atual.card_y_pct })
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const rect = containerRef.current!.getBoundingClientRect()
      const dxPct = ((e.clientX - d.startClientX) / rect.width / camera.zoom) * 100
      const dyPct = ((e.clientY - d.startClientY) / rect.height / camera.zoom) * 100

      if (d.modo === 'move-point') {
        setOverrides((prev) => ({
          ...prev,
          [d.id]: {
            pos_x_pct: clamp((d.start.pos_x_pct ?? 0) + dxPct, 0, 100),
            pos_y_pct: clamp((d.start.pos_y_pct ?? 0) + dyPct, 0, 100),
          },
        }))
      } else if (d.modo === 'move-area') {
        const w = d.start.area_w_pct ?? 0
        const h = d.start.area_h_pct ?? 0
        setOverrides((prev) => ({
          ...prev,
          [d.id]: {
            area_x_pct: clamp((d.start.area_x_pct ?? 0) + dxPct, 0, 100 - w),
            area_y_pct: clamp((d.start.area_y_pct ?? 0) + dyPct, 0, 100 - h),
          },
        }))
      } else if (d.modo === 'resize-area') {
        setOverrides((prev) => ({
          ...prev,
          [d.id]: {
            area_w_pct: clamp((d.start.area_w_pct ?? 0) + dxPct, 3, 100 - (d.start.area_x_pct ?? 0)),
            area_h_pct: clamp((d.start.area_h_pct ?? 0) + dyPct, 3, 100 - (d.start.area_y_pct ?? 0)),
          },
        }))
      } else if (d.modo === 'move-card') {
        setOverrides((prev) => ({
          ...prev,
          [d.id]: {
            card_x_pct: clamp(d.start.card_x_pct + dxPct, 0, 100),
            card_y_pct: clamp(d.start.card_y_pct + dyPct, 0, 100),
          },
        }))
      }
    }
    function onUp(e: PointerEvent) {
      if (dragRef.current?.pointerId === e.pointerId) finalizarDragMarcador()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcadoresView, camera.zoom])

  function iniciarDragMarcador(id: string, modoDrag: ModoDrag, e: React.PointerEvent) {
    if (!podeEditar || modo !== 'nenhum') return
    e.stopPropagation()
    const atual = marcadoresView.find((m) => m.id === id)
    if (!atual) return
    dragRef.current = { id, modo: modoDrag, pointerId: e.pointerId, startClientX: e.clientX, startClientY: e.clientY, start: atual }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = cameraDragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      setCamera((atual) => limitarCameraMapaSetores({
        ...atual,
        x: drag.cameraX + e.clientX - drag.startX,
        y: drag.cameraY + e.clientY - drag.startY,
      }, { largura, altura: alturaViewport }))
    }
    function encerrar(e: PointerEvent) {
      if (cameraDragRef.current?.pointerId === e.pointerId) cameraDragRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', encerrar)
    window.addEventListener('pointercancel', encerrar)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', encerrar)
      window.removeEventListener('pointercancel', encerrar)
    }
  }, [largura, alturaViewport])

  // --- criação de novo marcador (clique = ponto, arraste = área) -------------------
  const [addDrag, setAddDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const addStartRef = useRef<{ x: number; y: number } | null>(null)

  function pctDoEvento(e: React.PointerEvent): { x: number; y: number } | null {
    const ponto = pontoMundoDoEvento(e)
    const el = containerRef.current
    if (!ponto || !el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: clamp((ponto.x / rect.width) * 100, 0, 100),
      y: clamp((ponto.y / rect.height) * 100, 0, 100),
    }
  }

  function pontoMundoDoEvento(e: React.PointerEvent): { x: number; y: number } | null {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: clamp((e.clientX - rect.left - camera.x) / camera.zoom, 0, rect.width),
      y: clamp((e.clientY - rect.top - camera.y) / camera.zoom, 0, rect.height),
    }
  }

  // --- seleção do recorte ------------------------------------------------------------
  const [caixaRecorte, setCaixaRecorte] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const inicioRecorteRef = useRef<{ x: number; y: number } | null>(null)

  function onStagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) return
    if (zoomAreaAtivo) {
      const rect = e.currentTarget.getBoundingClientRect()
      inicioZoomRef.current = {
        x: clamp(e.clientX - rect.left, 0, rect.width),
        y: clamp(e.clientY - rect.top, 0, rect.height),
      }
      const caixa = { ...inicioZoomRef.current, w: 0, h: 0 }
      caixaZoomRef.current = caixa
      setCaixaZoom(caixa)
      e.currentTarget.setPointerCapture?.(e.pointerId)
      return
    }
    if (modo === 'nenhum' && e.pointerType === 'touch') {
      const rect = e.currentTarget.getBoundingClientRect()
      toquesRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      const pontos = [...toquesRef.current.values()]
      if (pontos.length === 2) {
        const [a, b] = pontos
        const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        pinchRef.current = {
          distancia: Math.hypot(b.x - a.x, b.y - a.y),
          zoom: camera.zoom,
          mundoX: (meio.x - camera.x) / camera.zoom,
          mundoY: (meio.y - camera.y) / camera.zoom,
        }
        cameraDragRef.current = null
        return
      }
    }
    if (modo === 'nenhum' && !((e.target as HTMLElement).closest('[data-setor-interativo]'))) {
      if (camera.zoom > 1 || camera.x !== 0 || camera.y !== 0) {
        cameraDragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          cameraX: camera.x,
          cameraY: camera.y,
        }
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
      onSelecionarSetor(null)
      return
    }
    if (modo === 'recorte') {
      const ponto = pontoMundoDoEvento(e)
      if (!ponto) return
      inicioRecorteRef.current = ponto
      setCaixaRecorte({ x: inicioRecorteRef.current.x, y: inicioRecorteRef.current.y, w: 0, h: 0 })
      return
    }
    if (!podeEditar || (modo !== 'ponto' && modo !== 'area')) return
    const p = pctDoEvento(e)
    if (!p) return
    if (modo === 'ponto') {
      onCriarPendente({ tipo: 'ponto', posXPct: p.x, posYPct: p.y }, { x: p.x, y: clamp(p.y - 8, 0, 100) })
      return
    }
    addStartRef.current = p
    setAddDrag({ x: p.x, y: p.y, w: 0, h: 0 })
  }

  function onStagePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (zoomAreaAtivo && inicioZoomRef.current) {
      const rect = e.currentTarget.getBoundingClientRect()
      const x = clamp(e.clientX - rect.left, 0, rect.width)
      const y = clamp(e.clientY - rect.top, 0, rect.height)
      const caixa = {
        x: Math.min(inicioZoomRef.current.x, x),
        y: Math.min(inicioZoomRef.current.y, y),
        w: Math.abs(x - inicioZoomRef.current.x),
        h: Math.abs(y - inicioZoomRef.current.y),
      }
      caixaZoomRef.current = caixa
      setCaixaZoom(caixa)
      return
    }
    if (e.pointerType === 'touch' && toquesRef.current.has(e.pointerId)) {
      const rect = e.currentTarget.getBoundingClientRect()
      toquesRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      const pontos = [...toquesRef.current.values()]
      const pinch = pinchRef.current
      if (pinch && pontos.length === 2 && pinch.distancia > 0) {
        const [a, b] = pontos
        const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const zoom = pinch.zoom * (Math.hypot(b.x - a.x, b.y - a.y) / pinch.distancia)
        setCamera(limitarCameraMapaSetores({ zoom, x: meio.x - pinch.mundoX * zoom, y: meio.y - pinch.mundoY * zoom }, viewport))
        return
      }
    }
    if (modo === 'recorte' && inicioRecorteRef.current) {
      const ponto = pontoMundoDoEvento(e)
      if (!ponto) return
      setCaixaRecorte({
        x: Math.min(inicioRecorteRef.current.x, ponto.x),
        y: Math.min(inicioRecorteRef.current.y, ponto.y),
        w: Math.abs(ponto.x - inicioRecorteRef.current.x),
        h: Math.abs(ponto.y - inicioRecorteRef.current.y),
      })
      return
    }
    if (modo === 'area' && addStartRef.current) {
      const p = pctDoEvento(e)
      if (!p) return
      const start = addStartRef.current
      setAddDrag({
        x: Math.min(start.x, p.x),
        y: Math.min(start.y, p.y),
        w: Math.abs(p.x - start.x),
        h: Math.abs(p.y - start.y),
      })
    }
  }

  function onStagePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (zoomAreaAtivo) {
      const caixa = caixaZoomRef.current
      inicioZoomRef.current = null
      caixaZoomRef.current = null
      setCaixaZoom(null)
      setZoomAreaAtivo(false)
      if (!caixa || caixa.w < 24 || caixa.h < 24) return
      setCamera(cameraParaEnquadrarMapaSetores({
        x: (caixa.x - camera.x) / camera.zoom,
        y: (caixa.y - camera.y) / camera.zoom,
        w: caixa.w / camera.zoom,
        h: caixa.h / camera.zoom,
      }, viewport))
      return
    }
    if (e.pointerType === 'touch') {
      toquesRef.current.delete(e.pointerId)
      if (toquesRef.current.size < 2) pinchRef.current = null
    }
    if (modo === 'recorte') {
      const caixa = caixaRecorte
      inicioRecorteRef.current = null
      setCaixaRecorte(null)
      if (!caixa || caixa.w < 12 || caixa.h < 12 || escala === 0) return
      onRecortar({ x: caixa.x / escala, y: caixa.y / escala, w: caixa.w / escala, h: caixa.h / escala })
      return
    }
    if (modo === 'area' && addStartRef.current) {
      const area = addDrag
      addStartRef.current = null
      setAddDrag(null)
      if (!area || area.w < 1.5 || area.h < 1.5) return
      onCriarPendente(
        { tipo: 'area', areaXPct: area.x, areaYPct: area.y, areaWPct: area.w, areaHPct: area.h },
        { x: area.x, y: clamp(area.y - 8, 0, 100) },
      )
    }
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const fator = e.deltaY > 0 ? 0.9 : 1.1
      const ponto = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      setCamera((atual) => {
        const zoom = atual.zoom * fator
        const mundoX = (ponto.x - atual.x) / atual.zoom
        const mundoY = (ponto.y - atual.y) / atual.zoom
        return limitarCameraMapaSetores(
          { zoom, x: ponto.x - mundoX * zoom, y: ponto.y - mundoY * zoom },
          { largura, altura: alturaViewport },
        )
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [largura, alturaViewport])

  useEffect(() => {
    const cancelarZoomArea = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !zoomAreaAtivo) return
      setZoomAreaAtivo(false)
      setCaixaZoom(null)
      caixaZoomRef.current = null
      inicioZoomRef.current = null
    }
    window.addEventListener('keydown', cancelarZoomArea)
    return () => window.removeEventListener('keydown', cancelarZoomArea)
  }, [zoomAreaAtivo])

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden border rounded-md select-none bg-muted/30 ${
        modo === 'recorte' ? 'cursor-crosshair' : modo === 'ponto' || modo === 'area' ? 'cursor-crosshair' : ''
      }`}
      style={{ height: alturaViewport || 400, touchAction: 'none' }}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerUp}
    >
      <div className="absolute right-2 top-2 z-40 flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm" data-setor-interativo>
        <button
          type="button"
          aria-label="Selecionar área para aproximar"
          aria-pressed={zoomAreaAtivo}
          title={modo === 'nenhum' ? 'Zoom por área' : 'Finalize o modo atual antes de ampliar'}
          disabled={modo !== 'nenhum'}
          className={`rounded p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 ${zoomAreaAtivo ? 'bg-primary text-primary-foreground hover:bg-primary/90' : ''}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (modo !== 'nenhum') return
            setZoomAreaAtivo((atual) => {
              const proximo = !atual
              if (!proximo) {
                setCaixaZoom(null)
                caixaZoomRef.current = null
                inicioZoomRef.current = null
              }
              return proximo
            })
          }}
        >
          <ScanSearch size={15} />
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button
          type="button"
          aria-label="Reduzir zoom"
          className="rounded p-1.5 hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => ajustarZoom(camera.zoom / 1.2, { x: largura / 2, y: alturaViewport / 2 })}
        >
          <Minus size={15} />
        </button>
        <span className="min-w-10 text-center text-xs tabular-nums">{Math.round(camera.zoom * 100)}%</span>
        <button
          type="button"
          aria-label="Aumentar zoom"
          className="rounded p-1.5 hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => ajustarZoom(camera.zoom * 1.2, { x: largura / 2, y: alturaViewport / 2 })}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          aria-label="Ajustar planta à tela"
          className="rounded p-1.5 hover:bg-muted"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={ajustarAoQuadro}
        >
          <Maximize size={15} />
        </button>
      </div>

      {zoomAreaAtivo && <div className="absolute inset-0 z-30 cursor-crosshair" aria-label="Arraste para definir o zoom" />}
      {zoomAreaAtivo && (
        <div className="pointer-events-none absolute left-2 top-2 z-30 rounded bg-background/95 px-2 py-1 text-xs font-medium shadow-sm">
          Arraste uma área para ampliar. Esc cancela.
        </div>
      )}
      {caixaZoom && (
        <div
          className="pointer-events-none absolute z-30 border-2 border-dashed border-primary bg-primary/10"
          style={{ left: caixaZoom.x, top: caixaZoom.y, width: caixaZoom.w, height: caixaZoom.h }}
        />
      )}

      <div
        className="absolute inset-0"
        style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`, transformOrigin: 'top left' }}
      >
        <div
          className="absolute"
        style={{
          width: planta.largura_natural * escala,
          height: planta.altura_natural * escala,
          left: -cropVisivel.x * escala,
          top: -cropVisivel.y * escala,
        }}
      >
        <img src={imagemUrl} alt={planta.nome} className="block w-full h-full pointer-events-none" draggable={false} />
      </div>

      {modo !== 'recorte' && (
        <>
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            {marcadoresView.filter((m) => m.id === setorSelecionadoId && idsVisiveis.has(m.id)).map((m) => {
              const anchor = m.tipo === 'area' ? { x: m.area_x_pct ?? 0, y: m.area_y_pct ?? 0 } : { x: m.pos_x_pct ?? 0, y: m.pos_y_pct ?? 0 }
              return (
                <line
                  key={m.id}
                  x1={anchor.x}
                  y1={anchor.y}
                  x2={m.card_x_pct}
                  y2={m.card_y_pct}
                  stroke="#64748b"
                  strokeWidth={0.25}
                  strokeDasharray="1.2,1"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>

            {marcadoresView.filter((m) => idsVisiveis.has(m.id)).map((m) => {
              const campos = camposPorMarcador.get(m.id)
              const eng = engenheiroPorMarcador.get(m.id)
              const visual = setorVisualPorId.get(m.id)
              const cor = visual ? STATUS_SETORES[visual.status].cor : eng?.cor ?? '#64748b'
              const orfao = orfaoPorMarcador.get(m.id) ?? false
              const selecionado = setorSelecionadoId === m.id
              const atenuado = setorSelecionadoId !== null && !selecionado

              return (
                <div key={m.id} className={`transition-opacity ${atenuado ? 'opacity-30' : 'opacity-100'}`}>
                {m.tipo === 'ponto' ? (
                  <div
                    className="absolute z-10"
                    style={{ left: `${m.pos_x_pct}%`, top: `${m.pos_y_pct}%`, transform: 'translate(-50%, -100%)' }}
                  >
                    <div
                      data-setor-interativo
                      onPointerDown={(e) => {
                        onSelecionarSetor(m.id)
                        iniciarDragMarcador(m.id, 'move-point', e)
                      }}
                      onClick={() => onSelecionarSetor(m.id)}
                      className={`w-4 h-4 rounded-full border-2 border-white shadow cursor-grab active:cursor-grabbing ${selecionado ? 'ring-4 ring-primary/35' : ''}`}
                      style={{
                        backgroundColor: cor,
                        transform: `scale(${1 / camera.zoom})`,
                        transformOrigin: '50% 100%',
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="absolute z-10"
                    style={{ left: `${m.area_x_pct}%`, top: `${m.area_y_pct}%`, width: `${m.area_w_pct}%`, height: `${m.area_h_pct}%` }}
                  >
                    <div
                      data-setor-interativo
                      onPointerDown={(e) => {
                        onSelecionarSetor(m.id)
                        iniciarDragMarcador(m.id, 'move-area', e)
                      }}
                      onClick={() => onSelecionarSetor(m.id)}
                      className={`absolute inset-0 rounded-sm border-2 cursor-grab active:cursor-grabbing ${selecionado ? 'ring-4 ring-primary/25' : ''}`}
                      style={{ borderColor: cor, backgroundColor: `${cor}22` }}
                    />
                    <div
                      className="absolute -left-2 -top-2 w-3.5 h-3.5 rounded-full border-2 border-white shadow pointer-events-none"
                      style={{
                        backgroundColor: cor,
                        transform: `scale(${1 / camera.zoom})`,
                        transformOrigin: 'center',
                      }}
                    />
                    {podeEditar && (
                      <div
                        data-setor-interativo
                        onPointerDown={(e) => {
                          onSelecionarSetor(m.id)
                          iniciarDragMarcador(m.id, 'resize-area', e)
                        }}
                        className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-white border-2 rounded-sm cursor-nwse-resize"
                        style={{
                          borderColor: cor,
                          transform: `scale(${1 / camera.zoom})`,
                          transformOrigin: 'center',
                        }}
                      />
                    )}
                  </div>
                )}

                <div
                  data-setor-interativo
                  role="button"
                  tabIndex={0}
                  aria-selected={selecionado}
                  className={`absolute z-20 min-w-[172px] max-w-[220px] rounded-md border-2 bg-white px-2.5 py-2 text-[11px] leading-relaxed shadow-lg cursor-grab active:cursor-grabbing dark:bg-neutral-900 ${
                    selecionado ? 'ring-4 ring-primary/20' : ''
                  }`}
                  style={{
                    left: `${m.card_x_pct}%`,
                    top: `${m.card_y_pct}%`,
                    borderColor: cor,
                    transform: `scale(${1 / camera.zoom})`,
                    transformOrigin: 'top left',
                  }}
                  onPointerDown={(e) => {
                    onSelecionarSetor(m.id)
                    iniciarDragMarcador(m.id, 'move-card', e)
                  }}
                  onClick={() => onSelecionarSetor(m.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelecionarSetor(m.id)
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (podeEditar) setMenuContexto({ marcadorId: m.id, x: e.clientX, y: e.clientY })
                  }}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0 font-semibold uppercase tracking-wide" style={{ color: cor }}>
                      <span className="block truncate">{m.nome}</span>
                    </div>
                    {podeEditar && <button
                      type="button"
                      data-setor-interativo
                      aria-label={`Configurar ${m.nome}`}
                      className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPropriedadesCard(m.id)
                      }}
                    >
                      <Settings2 size={13} />
                    </button>}
                  </div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="rounded-full border px-1.5 py-0.5 text-[9px] font-semibold" style={{ color: cor, borderColor: `${cor}55`, backgroundColor: `${cor}12` }}>
                      {visual ? STATUS_SETORES[visual.status].label : 'Sem dados'}
                    </span>
                    {orfao && <span title="Alguma atividade vinculada não foi encontrada no cronograma atual">⚠️</span>}
                  </div>
                  {visual && (
                    <>
                      <div className="mb-1.5 flex justify-between gap-2 text-[10px]">
                        <span className="text-muted-foreground">Concl. <b className="text-foreground">{visual.concluido != null ? `${visual.concluido.toFixed(0)}%` : '—'}</b></span>
                        <span className="text-muted-foreground">Prev. <b className="text-foreground">{visual.previsto != null ? `${visual.previsto.toFixed(0)}%` : '—'}</b></span>
                      </div>
                      <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${clamp(visual.concluido ?? 0, 0, 100)}%`, backgroundColor: cor }} />
                      </div>
                    </>
                  )}
                  {eng?.nome && (
                    <div className="mb-1 flex items-center gap-1 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: eng.cor }} />
                      {selecionado ? eng.nome : eng.nome.split(' ').slice(0, 2).join(' ')}
                    </div>
                  )}
                  {selecionado && campos && Object.keys(campos).length > 0 ? (
                    ORDEM_CAMPOS.filter((c) => campos[c]).map((c) => (
                      <div key={c} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{CAMPO_LABEL[c]}</span>
                        <b>{formatarValorCampo(campos[c])}</b>
                      </div>
                    ))
                  ) : !visual ? (
                    <div className="text-muted-foreground">Botão direito → Propriedades do card</div>
                  ) : null}
                </div>
              </div>
            )
          })}

          {addDrag && (
            <div
              className="absolute border-2 border-dashed border-orange-400 bg-orange-400/15 pointer-events-none"
              style={{ left: `${addDrag.x}%`, top: `${addDrag.y}%`, width: `${addDrag.w}%`, height: `${addDrag.h}%` }}
            />
          )}
        </>
      )}

      {modo === 'recorte' && caixaRecorte && (
        <div
          className="absolute border-2 border-dashed border-orange-400 bg-orange-400/15 pointer-events-none"
          style={{ left: caixaRecorte.x, top: caixaRecorte.y, width: caixaRecorte.w, height: caixaRecorte.h }}
        />
      )}
      </div>

      {menuContexto && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white dark:bg-neutral-900 border rounded-md shadow-lg py-1 min-w-[180px] text-sm"
          style={{ left: menuContexto.x, top: menuContexto.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-muted"
            onClick={() => {
              onConfigurarCaixa(menuContexto.marcadorId)
              setMenuContexto(null)
            }}
          >
            Configurar caixa
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-muted"
            onClick={() => {
              onPropriedadesCard(menuContexto.marcadorId)
              setMenuContexto(null)
            }}
          >
            Propriedades do card
          </button>
        </div>
      )}
    </div>
  )
}
