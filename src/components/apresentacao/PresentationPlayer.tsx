import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Pause, SkipBack, SkipForward, X } from 'lucide-react'
import { fetchPublicoPlaylist, fetchPublicoSlides, type TipoTela } from '@/lib/apresentacao-db'
import SlideDashboardMacro from './SlideDashboardMacro'
import SlideCurvaS from './SlideCurvaS'
import SlideOcorrencias from './SlideOcorrencias'
import SlideProducaoVisual from './SlideProducaoVisual'
import SlideMapaSetores from './SlideMapaSetores'
import SlideCustomUrl from './SlideCustomUrl'

function renderSlide(tipo: TipoTela, token: string, projetoId: string | null, parametros: Record<string, unknown>) {
  switch (tipo) {
    case 'dashboard_macro':
      return <SlideDashboardMacro token={token} />
    case 'curva_s':
      return <SlideCurvaS token={token} projetoId={projetoId} />
    case 'ocorrencias':
      return <SlideOcorrencias token={token} projetoId={projetoId} />
    case 'producao_visual':
      return <SlideProducaoVisual token={token} projetoId={projetoId} />
    case 'mapa_setores':
      return <SlideMapaSetores />
    case 'custom_url':
      return <SlideCustomUrl parametros={parametros} />
  }
}

const TRANSICAO_CLASSES: Record<string, string> = {
  fade: 'transition-opacity duration-500',
  slide: 'transition-transform duration-500',
  corte: '',
}

interface Props {
  token: string
  /** true = preview autenticado (dentro do app, ver ApresentacaoPreview) —
   * mostra play/pause/avançar/voltar/sair. false/ausente = player público
   * (/apresentacao/:token), sem sessão, sem controle nenhum. */
  controlavel?: boolean
  onSair?: () => void
}

export default function PresentationPlayer({ token, controlavel = false, onSair }: Props) {
  const { data: playlist, isLoading: carregandoPlaylist } = useQuery({
    queryKey: ['apresentacao-publica-playlist', token],
    queryFn: () => fetchPublicoPlaylist(token),
    refetchInterval: 30_000,
  })
  const { data: slides = [], isLoading: carregandoSlides } = useQuery({
    queryKey: ['apresentacao-publica-slides', token],
    queryFn: () => fetchPublicoSlides(token),
    refetchInterval: 30_000,
  })

  const [indice, setIndice] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [visivel, setVisivel] = useState(true)

  const slideAtual = slides[indice]

  // Avanço automático — reinicia a cada troca de slide/pausa.
  useEffect(() => {
    if (pausado || slides.length === 0) return
    const duracaoMs = (slideAtual?.duracaoSegundos ?? 30) * 1000
    const t = setTimeout(() => {
      setVisivel(false)
      setTimeout(() => {
        setIndice((i) => {
          const proximo = i + 1
          if (proximo < slides.length) return proximo
          return playlist?.loop ? 0 : i
        })
        setVisivel(true)
      }, playlist?.transicao === 'corte' ? 0 : 250)
    }, duracaoMs)
    return () => clearTimeout(t)
    // Depende só da duração (não de slideAtual inteiro, que muda de
    // identidade a cada refetch) — senão o timer reiniciaria sozinho toda
    // vez que a query dele resolvesse de novo.
  }, [indice, pausado, slides.length, slideAtual?.duracaoSegundos])

  const avancar = () => setIndice((i) => (i + 1 < slides.length ? i + 1 : (playlist?.loop ? 0 : i)))
  const voltar = () => setIndice((i) => (i > 0 ? i - 1 : slides.length - 1))

  const transicaoClasse = useMemo(
    () => TRANSICAO_CLASSES[playlist?.transicao ?? 'fade'],
    [playlist?.transicao],
  )

  if (carregandoPlaylist || carregandoSlides) {
    return <div className="fixed inset-0 bg-gray-950" />
  }

  if (!playlist) {
    return (
      <div className="fixed inset-0 bg-gray-950 text-white flex items-center justify-center text-center p-6">
        <div>
          <p className="text-lg font-semibold">Este link não está mais disponível.</p>
          <p className="text-white/50 text-sm mt-1">O token pode ter sido revogado ou a playlist desativada.</p>
        </div>
      </div>
    )
  }

  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 bg-gray-950 text-white flex items-center justify-center">
        Esta playlist ainda não tem slides.
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-gray-950 overflow-hidden">
      <div className={`w-full h-full ${transicaoClasse} ${visivel ? 'opacity-100' : 'opacity-0'}`}>
        {slideAtual && renderSlide(slideAtual.tipoTela, token, slideAtual.projetoId, slideAtual.parametros)}
      </div>

      {controlavel && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-3 p-4 bg-gradient-to-t from-black/70 to-transparent">
          <button onClick={voltar} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
            <SkipBack size={18} />
          </button>
          <button onClick={() => setPausado((v) => !v)} className="p-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white transition">
            {pausado ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <button onClick={avancar} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
            <SkipForward size={18} />
          </button>
          {onSair && (
            <button onClick={onSair} className="ml-4 p-2 rounded-full bg-white/10 hover:bg-red-500/40 text-white transition">
              <X size={18} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
