import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapaSetoresMarcador, MapaSetoresPlanta } from '@/lib/mapa-setores/mapa-setores-db'
import { CAMPO_LABEL, formatarValorCampo, type CampoCard, type EngenheiroDoSetor, type ValorCampo } from '@/lib/mapa-setores/progresso'

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
  modo: ModoEdicao
  podeEditar: boolean
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
  modo,
  podeEditar,
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

  // --- arraste de marcador/card existente ------------------------------------------
  const dragRef = useRef<{
    id: string
    modo: ModoDrag
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
    function onMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      const rect = containerRef.current!.getBoundingClientRect()
      const dxPct = ((e.clientX - d.startClientX) / rect.width) * 100
      const dyPct = ((e.clientY - d.startClientY) / rect.height) * 100

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
    function onUp() {
      finalizarDragMarcador()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcadoresView])

  function iniciarDragMarcador(id: string, modoDrag: ModoDrag, e: React.MouseEvent) {
    if (!podeEditar || modo !== 'nenhum') return
    e.stopPropagation()
    const atual = marcadoresView.find((m) => m.id === id)
    if (!atual) return
    dragRef.current = { id, modo: modoDrag, startClientX: e.clientX, startClientY: e.clientY, start: atual }
  }

  // --- criação de novo marcador (clique = ponto, arraste = área) -------------------
  const [addDrag, setAddDrag] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const addStartRef = useRef<{ x: number; y: number } | null>(null)

  function pctDoEvento(e: React.MouseEvent): { x: number; y: number } | null {
    const el = containerRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    }
  }

  // --- seleção do recorte ------------------------------------------------------------
  const [caixaRecorte, setCaixaRecorte] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const inicioRecorteRef = useRef<{ x: number; y: number } | null>(null)

  function onStageMouseDown(e: React.MouseEvent) {
    if (dragRef.current) return
    if (modo === 'recorte') {
      const rect = containerRef.current!.getBoundingClientRect()
      inicioRecorteRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
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

  function onStageMouseMove(e: React.MouseEvent) {
    if (modo === 'recorte' && inicioRecorteRef.current) {
      const rect = containerRef.current!.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
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

  function onStageMouseUp() {
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

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden border rounded-md select-none bg-muted/30 ${
        modo === 'recorte' ? 'cursor-crosshair' : modo === 'ponto' || modo === 'area' ? 'cursor-crosshair' : ''
      }`}
      style={{ height: alturaViewport || 400 }}
      onMouseDown={onStageMouseDown}
      onMouseMove={onStageMouseMove}
      onMouseUp={onStageMouseUp}
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
            {marcadoresView.map((m) => {
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

          {marcadoresView.map((m) => {
            const campos = camposPorMarcador.get(m.id)
            const eng = engenheiroPorMarcador.get(m.id)
            const cor = eng?.cor ?? '#64748b'
            const orfao = orfaoPorMarcador.get(m.id) ?? false

            return (
              <div key={m.id}>
                {m.tipo === 'ponto' ? (
                  <div
                    className="absolute z-10"
                    style={{ left: `${m.pos_x_pct}%`, top: `${m.pos_y_pct}%`, transform: 'translate(-50%, -100%)' }}
                  >
                    <div
                      onMouseDown={(e) => iniciarDragMarcador(m.id, 'move-point', e)}
                      className="w-4 h-4 rounded-full border-2 border-white shadow cursor-grab active:cursor-grabbing"
                      style={{ backgroundColor: cor }}
                    />
                  </div>
                ) : (
                  <div
                    className="absolute z-10"
                    style={{ left: `${m.area_x_pct}%`, top: `${m.area_y_pct}%`, width: `${m.area_w_pct}%`, height: `${m.area_h_pct}%` }}
                  >
                    <div
                      onMouseDown={(e) => iniciarDragMarcador(m.id, 'move-area', e)}
                      className="absolute inset-0 rounded-sm border-2 cursor-grab active:cursor-grabbing"
                      style={{ borderColor: cor, backgroundColor: `${cor}22` }}
                    />
                    <div
                      className="absolute -left-2 -top-2 w-3.5 h-3.5 rounded-full border-2 border-white shadow pointer-events-none"
                      style={{ backgroundColor: cor }}
                    />
                    {podeEditar && (
                      <div
                        onMouseDown={(e) => iniciarDragMarcador(m.id, 'resize-area', e)}
                        className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-white border-2 rounded-sm cursor-nwse-resize"
                        style={{ borderColor: cor }}
                      />
                    )}
                  </div>
                )}

                <div
                  className="absolute z-20 min-w-[150px] bg-white dark:bg-neutral-900 border-2 rounded px-2.5 py-1.5 text-[11px] leading-relaxed shadow-lg cursor-grab active:cursor-grabbing"
                  style={{ left: `${m.card_x_pct}%`, top: `${m.card_y_pct}%`, borderColor: cor }}
                  onMouseDown={(e) => iniciarDragMarcador(m.id, 'move-card', e)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (podeEditar) setMenuContexto({ marcadorId: m.id, x: e.clientX, y: e.clientY })
                  }}
                >
                  <div className="font-semibold uppercase tracking-wide mb-1 flex items-center gap-1" style={{ color: cor }}>
                    {m.nome}
                    {orfao && <span title="Alguma atividade vinculada não foi encontrada no cronograma atual">⚠️</span>}
                  </div>
                  {eng?.nome && <div className="text-muted-foreground mb-1">{eng.nome}</div>}
                  {campos && Object.keys(campos).length > 0 ? (
                    ORDEM_CAMPOS.filter((c) => campos[c]).map((c) => (
                      <div key={c} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{CAMPO_LABEL[c]}</span>
                        <b>{formatarValorCampo(campos[c])}</b>
                      </div>
                    ))
                  ) : (
                    <div className="text-muted-foreground">Botão direito → Propriedades do card</div>
                  )}
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
