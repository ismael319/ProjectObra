import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapaSetoresMarcador, MapaSetoresPlanta } from '@/lib/mapa-setores/mapa-setores-db'
import type { EngenheiroDoSetor } from '@/lib/mapa-setores/progresso'
import { resultadoDaCamada, type CamadaMapaId, type ItemLegendaCamada, type SetorComCamada } from '@/lib/mapa-setores/camadas'
import { clamp } from '@/lib/utils'
import { TooltipProvider } from '@/components/ui/tooltip'
import ToolbarEdicao from './ToolbarEdicao'
import ToolbarZoom from './ToolbarZoom'
import MarcadorPonto from './MarcadorPonto'
import MarcadorArea from './MarcadorArea'
import CardSetor from './CardSetor'
import BarraInstrucao from './BarraInstrucao'
import LegendaMapa from './LegendaMapa'
import MenuContexto from './MenuContexto'

// Interação de arraste inteira (marcador ponto/área, card solto, criação por clique ou
// retângulo) é mouse events manuais, sem lib de drag — o projeto não tem nenhuma
// (framer-motion/dnd-kit/etc). Segue a mesma técnica já usada em MapaViewport.tsx: escala
// = largura do container / largura do recorte, listeners de "soltar" no `window` (não no
// elemento) pra não perder o solto se o cursor sair da área durante o arraste.

export type ModoEdicao = 'nenhum' | 'ponto' | 'area' | 'recorte'

function calcularAlturaMaximaDoPalco() {
  if (typeof window === 'undefined') return 600
  return Math.min(760, Math.max(400, Math.round(window.innerHeight * 0.68)))
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
  engenheiroPorMarcador: Map<string, EngenheiroDoSetor>
  orfaoPorMarcador: Map<string, boolean>
  setoresVisuais: SetorComCamada[]
  camada: CamadaMapaId
  camadas: { id: CamadaMapaId; label: string; descricao: string }[]
  legenda: ItemLegendaCamada[]
  onCamadaChange: (camada: CamadaMapaId) => void
  idsVisiveis: Set<string>
  setorSelecionadoId: string | null
  versaoFoco: number
  modo: ModoEdicao
  podeEditar: boolean
  onSelecionarSetor: (id: string | null) => void
  onCriarPendente: (geometria: NovaGeometria, cardPos: { x: number; y: number }) => void
  onMoverMarcador: (id: string, campos: Partial<MapaSetoresMarcador>) => void
  onRecortar: (crop: { x: number; y: number; w: number; h: number }) => void
  onCancelarModo: () => void
  onAlternarModo: (modo: Exclude<ModoEdicao, 'nenhum'>) => void
  emTelaCheia: boolean
  onAlternarTelaCheia: () => void
  onConfigurarCaixa: (id: string) => void
  onPropriedadesCard: (id: string) => void
}

type ModoDrag = 'move-point' | 'move-area' | 'resize-area' | 'move-card'

export default function PalcoSetores({
  planta,
  imagemUrl,
  marcadores,
  engenheiroPorMarcador,
  orfaoPorMarcador,
  setoresVisuais,
  camada,
  camadas,
  legenda,
  onCamadaChange,
  idsVisiveis,
  setorSelecionadoId,
  versaoFoco,
  modo,
  podeEditar,
  onSelecionarSetor,
  onCriarPendente,
  onMoverMarcador,
  onRecortar,
  onCancelarModo,
  onAlternarModo,
  emTelaCheia,
  onAlternarTelaCheia,
  onConfigurarCaixa,
  onPropriedadesCard,
}: Props) {
  const [menuContexto, setMenuContexto] = useState<{ marcadorId: string; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!menuContexto) return
    const fechar = () => setMenuContexto(null)
    window.addEventListener('mousedown', fechar)
    window.addEventListener('scroll', fechar, true)
    return () => {
      window.removeEventListener('mousedown', fechar)
      window.removeEventListener('scroll', fechar, true)
    }
  }, [menuContexto])
  const containerRef = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(0)
  const [alturaMaxima, setAlturaMaxima] = useState(calcularAlturaMaximaDoPalco)
  const [camera, setCamera] = useState({ zoom: 1, x: 0, y: 0 })
  const versaoFocoAplicadaRef = useRef(0)
  const cameraDragRef = useRef<{ pointerId: number; startX: number; startY: number; cameraX: number; cameraY: number } | null>(null)
  const toquesRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distancia: number; zoom: number; mundoX: number; mundoY: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => setLargura(entry.contentRect.width))
    obs.observe(el)
    setLargura(el.getBoundingClientRect().width)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    const atualizarAltura = () => setAlturaMaxima(calcularAlturaMaximaDoPalco())
    window.addEventListener('resize', atualizarAltura)
    return () => window.removeEventListener('resize', atualizarAltura)
  }, [])

  useEffect(() => {
    setCamera({ zoom: 1, x: 0, y: 0 })
  }, [emTelaCheia])

  const crop = { x: planta.crop_x, y: planta.crop_y, w: planta.crop_w, h: planta.crop_h }
  const cropVisivel = modo === 'recorte' ? { x: 0, y: 0, w: planta.largura_natural, h: planta.altura_natural } : crop
  const larguraMaxima = cropVisivel.h > 0 ? alturaMaxima * (cropVisivel.w / cropVisivel.h) : alturaMaxima
  const escala = largura > 0 && cropVisivel.w > 0 ? largura / cropVisivel.w : 0
  const alturaViewport = cropVisivel.h * escala
  const setorVisualPorId = useMemo(() => new Map(setoresVisuais.map((setor) => [setor.id, setor])), [setoresVisuais])
  const resultadoCamadaPorSetor = useMemo(
    () => new Map(setoresVisuais.map((setor) => [setor.id, resultadoDaCamada(camada, setor)])),
    [camada, setoresVisuais],
  )

  function ajustarZoom(novoZoom: number, ponto?: { x: number; y: number }) {
    const el = containerRef.current
    if (!el) return
    const zoom = clamp(novoZoom, 1, 5)
    setCamera((atual) => {
      if (!ponto) return { zoom, x: 0, y: 0 }
      const mundoX = (ponto.x - atual.x) / atual.zoom
      const mundoY = (ponto.y - atual.y) / atual.zoom
      return { zoom, x: ponto.x - mundoX * zoom, y: ponto.y - mundoY * zoom }
    })
  }

  function ajustarAoQuadro() {
    setCamera({ zoom: 1, x: 0, y: 0 })
  }

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

  useEffect(() => {
    if (!setorSelecionadoId || versaoFoco === 0 || versaoFoco === versaoFocoAplicadaRef.current || !containerRef.current) return
    const marcador = marcadoresView.find((item) => item.id === setorSelecionadoId)
    if (!marcador) return
    const xPct = marcador.tipo === 'area'
      ? (marcador.area_x_pct ?? 0) + (marcador.area_w_pct ?? 0) / 2
      : marcador.pos_x_pct ?? 0
    const yPct = marcador.tipo === 'area'
      ? (marcador.area_y_pct ?? 0) + (marcador.area_h_pct ?? 0) / 2
      : marcador.pos_y_pct ?? 0
    const rect = containerRef.current.getBoundingClientRect()
    const zoom = marcador.tipo === 'area'
      ? clamp(70 / Math.max(marcador.area_w_pct ?? 100, marcador.area_h_pct ?? 100), 1, 3)
      : 1.8
    // Centraliza o ponto de ligação e o card, para que os dois permaneçam visíveis após localizar.
    const focoX = (xPct + marcador.card_x_pct) / 2
    const focoY = (yPct + marcador.card_y_pct) / 2
    setCamera({
      zoom,
      x: rect.width / 2 - (rect.width * focoX / 100) * zoom,
      y: rect.height / 2 - (rect.height * focoY / 100) * zoom,
    })
    versaoFocoAplicadaRef.current = versaoFoco
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
      setCamera((atual) => ({
        ...atual,
        x: drag.cameraX + e.clientX - drag.startX,
        y: drag.cameraY + e.clientY - drag.startY,
      }))
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
  }, [])

  // --- criação de novo marcador (clique = ponto, arraste = área) -------------------
  const [addDrag, setAddDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const addStartRef = useRef<{ x: number; y: number } | null>(null)

  function pctDoEvento(e: React.PointerEvent): { x: number; y: number } | null {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: clamp((((e.clientX - rect.left - camera.x) / camera.zoom) / rect.width) * 100, 0, 100),
      y: clamp((((e.clientY - rect.top - camera.y) / camera.zoom) / rect.height) * 100, 0, 100),
    }
  }

  // --- seleção do recorte ------------------------------------------------------------
  const [caixaRecorte, setCaixaRecorte] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const inicioRecorteRef = useRef<{ x: number; y: number } | null>(null)

  function onStagePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (dragRef.current) return
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
      const rect = containerRef.current!.getBoundingClientRect()
      inicioRecorteRef.current = { x: (e.clientX - rect.left - camera.x) / camera.zoom, y: (e.clientY - rect.top - camera.y) / camera.zoom }
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
    if (e.pointerType === 'touch' && toquesRef.current.has(e.pointerId)) {
      const rect = e.currentTarget.getBoundingClientRect()
      toquesRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top })
      const pontos = [...toquesRef.current.values()]
      const pinch = pinchRef.current
      if (pinch && pontos.length === 2 && pinch.distancia > 0) {
        const [a, b] = pontos
        const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const zoom = clamp(pinch.zoom * (Math.hypot(b.x - a.x, b.y - a.y) / pinch.distancia), 1, 5)
        setCamera({ zoom, x: meio.x - pinch.mundoX * zoom, y: meio.y - pinch.mundoY * zoom })
        return
      }
    }
    if (modo === 'recorte' && inicioRecorteRef.current) {
      const rect = containerRef.current!.getBoundingClientRect()
      const x = (e.clientX - rect.left - camera.x) / camera.zoom
      const y = (e.clientY - rect.top - camera.y) / camera.zoom
      setCaixaRecorte({
        x: Math.min(inicioRecorteRef.current.x, x),
        y: Math.min(inicioRecorteRef.current.y, y),
        w: Math.abs(x - inicioRecorteRef.current.x),
        h: Math.abs(y - inicioRecorteRef.current.y),
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
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const fator = e.deltaY > 0 ? 0.9 : 1.1
      ajustarZoom(camera.zoom * fator, { x: e.clientX - rect.left, y: e.clientY - rect.top })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [camera.zoom])

  const instrucaoModo = modo === 'recorte'
    ? 'Arraste sobre a planta para definir a visualização padrão.'
    : modo === 'ponto'
      ? 'Clique na planta para posicionar o setor.'
      : modo === 'area'
        ? 'Arraste sobre a planta para desenhar a área do setor.'
        : null

  return (
    <TooltipProvider delayDuration={300}>
    <div
      ref={containerRef}
      className={`min-h-[320px] overflow-hidden select-none ${
        emTelaCheia ? 'absolute left-0 right-0 top-1/2 -translate-y-1/2' : 'relative rounded-2xl border border-border/80 shadow-elevated'
      } ${
        modo === 'recorte' ? 'cursor-crosshair' : modo === 'ponto' || modo === 'area' ? 'cursor-crosshair' : ''
      }`}
      style={{
        height: alturaViewport || Math.min(400, alturaMaxima),
        width: '100%',
        maxWidth: emTelaCheia ? '100%' : larguraMaxima,
        marginInline: 'auto',
        touchAction: modo === 'nenhum' ? 'pan-y' : 'none',
        backgroundColor: 'var(--muted)',
        backgroundImage: 'repeating-conic-gradient(from 45deg, rgb(100 116 139 / 0.07) 0 25%, transparent 0 50%)',
        backgroundSize: '24px 24px',
      }}
      onPointerDown={onStagePointerDown}
      onPointerMove={onStagePointerMove}
      onPointerUp={onStagePointerUp}
      onPointerCancel={onStagePointerUp}
      onDoubleClick={() => { if (modo === 'nenhum') onAlternarTelaCheia() }}
    >
      <ToolbarEdicao modo={modo} camada={camada} camadas={camadas} podeEditar={podeEditar} onAlternarModo={onAlternarModo} onCamadaChange={onCamadaChange} />
      <ToolbarZoom zoom={camera.zoom} emTelaCheia={emTelaCheia} onZoomIn={() => ajustarZoom(camera.zoom * 1.2, { x: largura / 2, y: alturaViewport / 2 })} onZoomOut={() => ajustarZoom(camera.zoom / 1.2, { x: largura / 2, y: alturaViewport / 2 })} onFit={ajustarAoQuadro} onToggleFullScreen={onAlternarTelaCheia} />

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
                <line key={m.id} x1={anchor.x} y1={anchor.y} x2={m.card_x_pct} y2={m.card_y_pct} stroke="#64748b" strokeWidth={0.25} strokeDasharray="1.2,1" vectorEffect="non-scaling-stroke" />
              )
            })}
          </svg>

          {marcadoresView.filter((m) => idsVisiveis.has(m.id)).map((m) => {
            const eng = engenheiroPorMarcador.get(m.id)
            const visual = setorVisualPorId.get(m.id)
            const resultadoCamada = resultadoCamadaPorSetor.get(m.id)
            const cor = m.cor ?? resultadoCamada?.cor ?? eng?.cor ?? '#64748b'
            const orfao = orfaoPorMarcador.get(m.id) ?? false
            const selecionado = setorSelecionadoId === m.id
            const atenuado = setorSelecionadoId !== null && !selecionado

            return (
              <div key={m.id} className={`transition-all duration-200 ${atenuado ? 'opacity-45' : 'opacity-100'}`}>
                {m.tipo === 'ponto' ? (
                  <MarcadorPonto marcador={{ ...m, pos_x_pct: m.pos_x_pct ?? 0, pos_y_pct: m.pos_y_pct ?? 0 }} cor={cor} zoom={camera.zoom} selecionado={selecionado} onSelecionar={onSelecionarSetor} onDragStart={iniciarDragMarcador} />
                ) : (
                  <MarcadorArea
                    marcador={{ ...m, area_x_pct: m.area_x_pct ?? 0, area_y_pct: m.area_y_pct ?? 0, area_w_pct: m.area_w_pct ?? 10, area_h_pct: m.area_h_pct ?? 10 }}
                    cor={cor}
                    zoom={camera.zoom}
                    selecionado={selecionado}
                    podeEditar={podeEditar}
                    onSelecionar={onSelecionarSetor}
                    onDragStart={iniciarDragMarcador}
                  />
                )}
                <CardSetor
                  id={m.id}
                  nome={m.nome}
                  cor={cor}
                  xPct={m.card_x_pct}
                  yPct={m.card_y_pct}
                  zoom={camera.zoom}
                  selecionado={selecionado}
                  podeEditar={podeEditar}
                  resultadoCamada={resultadoCamada}
                  visual={visual}
                  eng={eng}
                  orfao={orfao}
                  onSelecionar={onSelecionarSetor}
                  onDragStart={iniciarDragMarcador}
                  onConfigurarCaixa={onConfigurarCaixa}
                  onPropriedadesCard={onPropriedadesCard}
                  onContextMenu={(id, x, y) => setMenuContexto({ marcadorId: id, x, y })}
                />
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

      {instrucaoModo && <BarraInstrucao texto={instrucaoModo} onCancelar={onCancelarModo} />}
      {modo === 'nenhum' && <LegendaMapa legenda={legenda} />}
      {modo === 'nenhum' && <div className="absolute bottom-3 right-3 z-40 hidden rounded-lg border border-border/70 bg-background/90 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur xl:block" data-setor-interativo>Ctrl/Cmd + rolagem para zoom</div>}

      {menuContexto && (
        <MenuContexto
          x={menuContexto.x}
          y={menuContexto.y}
          marcadorId={menuContexto.marcadorId}
          onConfigurarCaixa={onConfigurarCaixa}
          onPropriedadesCard={onPropriedadesCard}
          onFechar={() => setMenuContexto(null)}
        />
      )}
    </div>
    </TooltipProvider>
  )
}
