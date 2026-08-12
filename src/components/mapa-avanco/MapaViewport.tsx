import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapaGrade, MapaPlanta, MapaSegmento } from '@/lib/mapa-avanco/mapa-db'
import type { MapaStatus } from '@/lib/mapa-avanco/calculo'
import { statusInicial, chaveCelula } from '@/lib/mapa-avanco/calculo'

export type ModoMapa = 'apontar' | 'calibrar' | 'recorte' | 'marcar-extremos'

export interface PontoImagem {
  x: number
  y: number
}

export interface CelulaRef {
  gradeId: string
  segmentoId: string
  linha: number
  coluna: number
}

/**
 * Uma grade desenhada sobre a planta, com tudo que ela precisa para se
 * desenhar sozinha. Várias camadas convivem no mesmo mapa — é assim que
 * estacas, piso e dutos aparecem juntos, como na prancha do AutoCAD.
 */
export interface CamadaGrade {
  grade: MapaGrade
  segmentos: MapaSegmento[]
  status: MapaStatus[]
}

/** Aparência da planta de fundo. `suave` clareia para a malha ganhar contraste. */
const FILTROS_CSS: Record<MapaPlanta['filtro_visual'], string | undefined> = {
  normal: undefined,
  cinza: 'grayscale(1)',
  suave: 'opacity(0.45)',
  'cinza-suave': 'grayscale(1) opacity(0.45)',
}

interface Props {
  planta: MapaPlanta
  imagemUrl: string
  /** Todas as grades da planta. Todas são desenhadas. */
  camadas: CamadaGrade[]
  /** Qual grade recebe o apontamento agora. As outras ficam visíveis, não clicáveis. */
  gradeAtivaId: string | null
  /** Estado de cada célula, de todas as grades: chave -> status_id. */
  pintura: Map<string, string>
  modo: ModoMapa
  statusSelecionadoId: string | null
  podeEditar: boolean
  /** Chamado no fim do arraste, com todas as células tocadas de uma vez. */
  onPintar: (celulas: CelulaRef[]) => void
  /** Clicar numa célula de outra grade troca o foco para ela. */
  onFocarGrade?: (gradeId: string) => void
  /** Só no modo recorte, ao soltar o retângulo (coordenadas na imagem original). */
  onRecortar?: (crop: { x: number; y: number; w: number; h: number }) => void
  /** Modo marcar-extremos: cada clique devolve o ponto em coordenadas da imagem. */
  onMarcarPonto?: (ponto: PontoImagem) => void
  /** Pontos já marcados, para desenhar a mira na tela. */
  pontosMarcados?: PontoImagem[]
}

/**
 * A planta com as malhas por cima.
 *
 * A escala sai da largura disponível dividida pela largura do recorte: é isso
 * que faz o crop virar zoom automático, sem mexer na imagem. A camada da imagem
 * é deslocada em -crop.x/-crop.y para trazer a área escolhida ao canto do
 * viewport — mesma mecânica do protótipo em HTML, agora medindo o container em
 * vez de usar largura fixa, porque o apontamento acontece em tablet no campo.
 */
export default function MapaViewport({
  planta,
  imagemUrl,
  camadas,
  gradeAtivaId,
  pintura,
  modo,
  statusSelecionadoId,
  podeEditar,
  onPintar,
  onFocarGrade,
  onRecortar,
  onMarcarPonto,
  pontosMarcados = [],
}: Props) {
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
  // No recorte a planta inteira precisa aparecer, senão não dá para escolher uma
  // área fora do recorte atual.
  const cropVisivel = modo === 'recorte'
    ? { x: 0, y: 0, w: planta.largura_natural, h: planta.altura_natural }
    : crop

  const escala = largura > 0 && cropVisivel.w > 0 ? largura / cropVisivel.w : 0
  const alturaViewport = cropVisivel.h * escala

  /** Converte um clique na tela para coordenadas da imagem original. */
  const pontoDoEvento = (e: React.MouseEvent): PontoImagem | null => {
    const el = containerRef.current
    if (!el || escala === 0) return null
    const rect = el.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / escala + cropVisivel.x,
      y: (e.clientY - rect.top) / escala + cropVisivel.y,
    }
  }

  // --- pintura por arraste -------------------------------------------------
  const [arrastando, setArrastando] = useState(false)
  const tocadasRef = useRef<Map<string, CelulaRef>>(new Map())
  const [previewLocal, setPreviewLocal] = useState<Map<string, string>>(new Map())

  const podePintar = modo === 'apontar' && podeEditar && !!statusSelecionadoId && !!gradeAtivaId

  const tocar = useCallback(
    (ref: CelulaRef) => {
      if (!podePintar || !statusSelecionadoId) return
      const k = chaveCelula(ref.segmentoId, ref.linha, ref.coluna)
      if (tocadasRef.current.has(k)) return
      tocadasRef.current.set(k, ref)
      setPreviewLocal((prev) => new Map(prev).set(k, statusSelecionadoId))
    },
    [podePintar, statusSelecionadoId],
  )

  const finalizarArraste = useCallback(() => {
    if (!arrastando) return
    setArrastando(false)
    const celulas = [...tocadasRef.current.values()]
    tocadasRef.current = new Map()
    if (celulas.length > 0) onPintar(celulas)
    // O preview local só some quando os dados do servidor chegam; limpar aqui
    // faria as células piscarem de volta ao estado antigo entre o clique e o
    // refetch.
  }, [arrastando, onPintar])

  useEffect(() => {
    if (!arrastando) return
    window.addEventListener('mouseup', finalizarArraste)
    window.addEventListener('touchend', finalizarArraste)
    return () => {
      window.removeEventListener('mouseup', finalizarArraste)
      window.removeEventListener('touchend', finalizarArraste)
    }
  }, [arrastando, finalizarArraste])

  // Quando o servidor confirma, o preview deixa de ser necessário.
  useEffect(() => {
    setPreviewLocal(new Map())
  }, [pintura])

  // --- seleção do recorte --------------------------------------------------
  const [caixa, setCaixa] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const inicioRef = useRef<{ x: number; y: number } | null>(null)

  const iniciarRecorte = (e: React.MouseEvent) => {
    if (modo !== 'recorte') return
    const rect = containerRef.current!.getBoundingClientRect()
    inicioRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    setCaixa({ x: inicioRef.current.x, y: inicioRef.current.y, w: 0, h: 0 })
  }

  const moverRecorte = (e: React.MouseEvent) => {
    if (modo !== 'recorte' || !inicioRef.current) return
    const rect = containerRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setCaixa({
      x: Math.min(inicioRef.current.x, x),
      y: Math.min(inicioRef.current.y, y),
      w: Math.abs(x - inicioRef.current.x),
      h: Math.abs(y - inicioRef.current.y),
    })
  }

  const soltarRecorte = () => {
    if (modo !== 'recorte' || !inicioRef.current || !caixa) return
    inicioRef.current = null
    // Arrasto minúsculo costuma ser clique acidental — ignora em vez de recortar
    // a planta a um retângulo de 3px.
    if (caixa.w < 12 || caixa.h < 12 || escala === 0) {
      setCaixa(null)
      return
    }
    onRecortar?.({
      x: caixa.x / escala,
      y: caixa.y / escala,
      w: caixa.w / escala,
      h: caixa.h / escala,
    })
    setCaixa(null)
  }

  /**
   * Todas as células de todas as camadas, já posicionadas.
   *
   * Cada segmento tem geometria própria — é o que permite a fileira do topo
   * correr em X e a lateral correr em Y. Dentro do segmento, o passo separa um
   * elemento do próximo e o tamanho é só o desenho: iguais = malha colada
   * (piso), passo maior = vão entre estacas.
   */
  const celulas = useMemo(() => {
    if (escala === 0) return []
    const lista: {
      key: string
      ref: CelulaRef
      forma: MapaGrade['forma']
      status: MapaStatus[]
      inicial: MapaStatus | null
      daGradeAtiva: boolean
      left: number; top: number; w: number; h: number
    }[] = []

    for (const camada of camadas) {
      const inicial = statusInicial(camada.status)
      const daGradeAtiva = camada.grade.id === gradeAtivaId
      for (const seg of camada.segmentos) {
        for (let linha = 0; linha < seg.linhas; linha++) {
          for (let coluna = 0; coluna < seg.colunas; coluna++) {
            lista.push({
              key: `${camada.grade.id}_${chaveCelula(seg.id, linha, coluna)}`,
              ref: { gradeId: camada.grade.id, segmentoId: seg.id, linha, coluna },
              forma: camada.grade.forma,
              status: camada.status,
              inicial,
              daGradeAtiva,
              left: (seg.offset_x + coluna * seg.passo_x) * escala,
              top: (seg.offset_y + linha * seg.passo_y) * escala,
              w: seg.largura_celula * escala,
              h: seg.altura_celula * escala,
            })
          }
        }
      }
    }
    // A grade em foco vai por último para ficar por cima das outras.
    return lista.sort((a, b) => Number(a.daGradeAtiva) - Number(b.daGradeAtiva))
  }, [camadas, gradeAtivaId, escala])

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden border rounded-md select-none ${
        modo === 'recorte' || modo === 'marcar-extremos' ? 'cursor-crosshair' : ''
      }`}
      style={{ height: alturaViewport || 320 }}
      onMouseDown={iniciarRecorte}
      onMouseMove={moverRecorte}
      onMouseUp={soltarRecorte}
      onClick={(e) => {
        if (modo !== 'marcar-extremos') return
        const p = pontoDoEvento(e)
        if (p) onMarcarPonto?.(p)
      }}
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
        <img
          src={imagemUrl}
          alt={planta.nome}
          className="block w-full h-full pointer-events-none"
          draggable={false}
          // Planta de AutoCAD vem com vermelho, ciano e magenta fortes; a malha
          // colorida por cima some no meio. Em cinza ou esmaecida o apontamento
          // fica legível — e o arquivo original não é tocado.
          style={{ filter: FILTROS_CSS[planta.filtro_visual] }}
        />
      </div>

      {modo !== 'recorte' && (
        <div
          className="absolute inset-0"
          style={{ transform: `translate(${-cropVisivel.x * escala}px, ${-cropVisivel.y * escala}px)` }}
        >
          {celulas.map((c) => {
            const chave = chaveCelula(c.ref.segmentoId, c.ref.linha, c.ref.coluna)
            const statusId = previewLocal.get(chave) ?? pintura.get(chave) ?? c.inicial?.id
            const s = statusId ? c.status.find((x) => x.id === statusId) : undefined
            const ehInicial = s?.id === c.inicial?.id
            const clicavel = podePintar && c.daGradeAtiva

            return (
              <div
                key={c.key}
                onMouseDown={() => {
                  // Clicar numa célula de outra grade traz o foco para ela, em
                  // vez de não fazer nada — assim dá para alternar direto no
                  // mapa, sem voltar às abas.
                  if (!c.daGradeAtiva) {
                    if (modo === 'apontar') onFocarGrade?.(c.ref.gradeId)
                    return
                  }
                  if (!clicavel) return
                  setArrastando(true)
                  tocar(c.ref)
                }}
                onMouseEnter={() => {
                  if (arrastando && c.daGradeAtiva) tocar(c.ref)
                }}
                className={`absolute box-border transition-opacity ${
                  clicavel ? 'cursor-pointer hover:outline hover:outline-2 hover:outline-blue-500' : ''
                } ${
                  modo === 'calibrar' && c.daGradeAtiva
                    ? 'border border-orange-400/60 bg-orange-400/10'
                    : 'border border-orange-400/20'
                }`}
                style={{
                  left: c.left,
                  top: c.top,
                  width: c.w,
                  height: c.h,
                  // Círculo para estaca, retângulo para bloco/praça.
                  borderRadius: c.forma === 'circulo' ? '50%' : undefined,
                  backgroundColor: s && !ehInicial ? `${s.cor_hex}8c` : undefined,
                  borderColor: s && !ehInicial ? s.cor_hex : undefined,
                  // Grade fora de foco fica visível mas discreta, para não
                  // competir com a que está sendo apontada.
                  opacity: c.daGradeAtiva || !gradeAtivaId ? 1 : 0.55,
                }}
                title={s?.label}
              />
            )
          })}
        </div>
      )}

      {caixa && (
        <div
          className="absolute border-2 border-dashed border-orange-400 bg-orange-400/15 pointer-events-none"
          style={{ left: caixa.x, top: caixa.y, width: caixa.w, height: caixa.h }}
        />
      )}

      {/* Miras dos pontos já marcados na calibração assistida. */}
      {modo === 'marcar-extremos' &&
        pontosMarcados.map((p, i) => (
          <div
            key={i}
            className="absolute pointer-events-none"
            style={{
              left: (p.x - cropVisivel.x) * escala,
              top: (p.y - cropVisivel.y) * escala,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="relative">
              <div className="absolute h-5 w-0.5 bg-blue-600 -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute h-0.5 w-5 bg-blue-600 -translate-x-1/2 -translate-y-1/2" />
              <span className="absolute left-3 -top-2 text-[11px] font-bold text-blue-600 bg-white/90 px-1 rounded">
                {i + 1}
              </span>
            </div>
          </div>
        ))}
    </div>
  )
}
