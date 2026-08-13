import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Tv, Plus, Trash2, Copy, RotateCw, ShieldOff, ChevronUp, ChevronDown, Play, X, Loader2,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useProjects } from '@/lib/project-store'
import { usePresentationMode } from '@/lib/presentation-mode'
import {
  usePlaylists, useSlides, useCriarPlaylist, useAtualizarPlaylist, useExcluirPlaylist,
  useRevogarToken, useRegenerarToken, useCriarSlide, useAtualizarSlide, useExcluirSlide, useReordenarSlide,
  type Playlist, type TipoTela, type Transicao,
} from '@/lib/apresentacao-db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import PresentationPlayer from '@/components/apresentacao/PresentationPlayer'

const TIPO_LABELS: Record<TipoTela, string> = {
  dashboard_macro: 'Dashboard Macro (portfólio)',
  curva_s: 'Curva S (spotlight de 1 projeto)',
  ocorrencias: 'Ocorrências (RDR em aberto)',
  producao_visual: 'Produção Visual (hoje)',
  mapa_setores: 'Mapa de Setores (em breve)',
  custom_url: 'URL personalizada',
}

const TIPO_PRECISA_PROJETO: TipoTela[] = ['curva_s', 'ocorrencias', 'producao_visual']

function linkPublico(token: string): string {
  return `${window.location.origin}/apresentacao/${token}`
}

export default function ApresentacaoConfig() {
  const { userProfile, user } = useAuth()
  const { projects, currentProject } = useProjects()
  const organizacaoId = userProfile?.organizacao_id ?? undefined
  const { data: playlistsTodas = [], isLoading } = usePlaylists(organizacaoId)
  const criarMut = useCriarPlaylist(organizacaoId)

  // Contexto vem de COMO se chegou aqui, não de uma escolha nesta tela:
  // - de dentro de um projeto (sidebar, com currentProject setado) -> só as
  //   playlists DAQUELE projeto, apresentação é só dele (telão da obra).
  // - de "Meus Projetos" (botão que já limpa currentProject antes de navegar
  //   pra cá, ver ProjectSelection.tsx) -> só playlists de EMPRESA, resumo
  //   de todas as obras (telão fora do canteiro, matriz ou outro local).
  // Não é uma preferência que fica salva — muda a cada entrada, de acordo
  // com de onde o usuário veio.
  const contextoProjeto = currentProject ?? null
  const playlists = playlistsTodas.filter((pl) =>
    contextoProjeto ? pl.projetoId === contextoProjeto.id : pl.organizacaoId != null,
  )

  const [novoNome, setNovoNome] = useState('')
  const [expandida, setExpandida] = useState<string | null>(null)
  const [previewToken, setPreviewToken] = useState<string | null>(null)

  const podeGerenciar = userProfile?.papel === 'edicao' || userProfile?.is_super_admin === true

  const handleCriar = async () => {
    if (!novoNome.trim()) return
    try {
      await criarMut.mutateAsync({
        nome: novoNome.trim(),
        escopo: contextoProjeto ? 'projeto' : 'empresa',
        projetoId: contextoProjeto?.id,
        userId: user?.id,
      })
      setNovoNome('')
      toast.success('Playlist criada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar playlist')
    }
  }

  if (!podeGerenciar) {
    return (
      <div className="max-w-md mx-auto text-center py-16 text-gray-500 dark:text-gray-400">
        Você não tem permissão para acessar esta página.
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Tv className="text-gray-500 dark:text-gray-400" size={24} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Modo Apresentação</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {contextoProjeto ? `Só deste projeto: ${contextoProjeto.nome}` : 'Resumo de todas as obras da empresa'}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 space-y-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nova playlist — um link público, sem login, que roda os slides escolhidos em loop numa TV.
          {contextoProjeto
            ? ' Vai mostrar só dados deste projeto.'
            : ' Vai mostrar o resumo de todos os projetos da empresa.'}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input placeholder="Nome da playlist" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} className="flex-1" />
          <Button onClick={handleCriar} disabled={criarMut.isPending || !novoNome.trim()}>
            <Plus size={14} /> Criar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Loader2 className="animate-spin mx-auto text-gray-400" />
      ) : playlists.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-8">Nenhuma playlist criada ainda.</p>
      ) : (
        <div className="space-y-3">
          {playlists.map((pl) => (
            <PlaylistCard
              key={pl.id}
              playlist={pl}
              projetos={projects}
              organizacaoId={organizacaoId}
              expandida={expandida === pl.id}
              onToggleExpandir={() => setExpandida((e) => (e === pl.id ? null : pl.id))}
              onPreview={() => setPreviewToken(pl.tokenAcessoPublico)}
            />
          ))}
        </div>
      )}

      {previewToken && (
        <PreviewOverlay token={previewToken} onSair={() => setPreviewToken(null)} />
      )}
    </div>
  )
}

function PreviewOverlay({ token, onSair }: { token: string; onSair: () => void }) {
  const { setPresentationMode } = usePresentationMode()

  useEffect(() => {
    setPresentationMode(true)
    document.documentElement.requestFullscreen?.().catch(() => {})
    return () => {
      setPresentationMode(false)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <PresentationPlayer token={token} controlavel onSair={onSair} />
}

function PlaylistCard({
  playlist, projetos, organizacaoId, expandida, onToggleExpandir, onPreview,
}: {
  playlist: Playlist
  projetos: { id: string; nome: string }[]
  organizacaoId: string | undefined
  expandida: boolean
  onToggleExpandir: () => void
  onPreview: () => void
}) {
  const atualizarMut = useAtualizarPlaylist(organizacaoId)
  const excluirMut = useExcluirPlaylist(organizacaoId)
  const revogarMut = useRevogarToken(organizacaoId)
  const regenerarMut = useRegenerarToken(organizacaoId)
  const [excluirConfirm, setExcluirConfirm] = useState(false)
  const [revogarConfirm, setRevogarConfirm] = useState(false)

  const escopoLabel = playlist.projetoId
    ? (projetos.find((p) => p.id === playlist.projetoId)?.nome ?? 'Projeto')
    : 'Toda a empresa'
  const revogado = !!playlist.tokenRevogadoEm

  const copiarLink = () => {
    navigator.clipboard.writeText(linkPublico(playlist.tokenAcessoPublico)).then(
      () => toast.success('Link copiado.'),
      () => toast.error('Não foi possível copiar o link.'),
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="p-4 flex flex-wrap items-center gap-3">
        <button onClick={onToggleExpandir} className="flex items-center gap-2 flex-1 min-w-0 text-left">
          {expandida ? <ChevronUp size={16} className="shrink-0 text-gray-400" /> : <ChevronDown size={16} className="shrink-0 text-gray-400" />}
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white truncate">{playlist.nome}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{escopoLabel}</p>
          </div>
        </button>

        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Switch checked={playlist.ativo} onCheckedChange={(v) => atualizarMut.mutate({ id: playlist.id, ativo: v })} />
          Ativa
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Switch checked={playlist.loop} onCheckedChange={(v) => atualizarMut.mutate({ id: playlist.id, loop: v })} />
          Loop
        </label>
        <select
          value={playlist.transicao}
          onChange={(e) => atualizarMut.mutate({ id: playlist.id, transicao: e.target.value as Transicao })}
          className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-2 py-1 text-xs"
        >
          <option value="fade">Fade</option>
          <option value="slide">Slide</option>
          <option value="corte">Corte</option>
        </select>

        <Button size="sm" variant="outline" onClick={onPreview} title="Pré-visualizar">
          <Play size={14} /> Pré-visualizar
        </Button>
        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => setExcluirConfirm(true)}>
          <Trash2 size={14} />
        </Button>
      </div>

      <div className="px-4 pb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className={`px-2 py-1 rounded-full font-medium ${revogado ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'}`}>
          {revogado ? 'Token revogado' : 'Link ativo'}
        </span>
        <button onClick={copiarLink} disabled={revogado} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-40 disabled:no-underline">
          <Copy size={12} /> Copiar link público
        </button>
        <button
          onClick={() => regenerarMut.mutate(playlist.id, { onSuccess: () => toast.success('Novo link gerado — o antigo parou de funcionar.') })}
          className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:underline"
        >
          <RotateCw size={12} /> Regenerar link
        </button>
        {!revogado && (
          <button onClick={() => setRevogarConfirm(true)} className="flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline">
            <ShieldOff size={12} /> Revogar acesso
          </button>
        )}
      </div>

      {expandida && <SlidesManager playlistId={playlist.id} projetoDaPlaylist={playlist.projetoId} projetos={projetos} />}

      <AlertDialog open={excluirConfirm} onOpenChange={setExcluirConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir playlist "{playlist.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>O link público para de funcionar imediatamente. Não pode ser desfeito.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => excluirMut.mutate(playlist.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={revogarConfirm} onOpenChange={setRevogarConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar o link público?</AlertDialogTitle>
            <AlertDialogDescription>
              Quem tiver o link atual perde o acesso imediatamente. Gere um link novo (Regenerar) quando quiser voltar a usar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => revogarMut.mutate(playlist.id)}>Revogar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SlidesManager({
  playlistId, projetoDaPlaylist, projetos,
}: {
  playlistId: string
  projetoDaPlaylist: string | null
  projetos: { id: string; nome: string }[]
}) {
  const { data: slides = [], isLoading } = useSlides(playlistId)
  const criarSlideMut = useCriarSlide(playlistId)
  const atualizarSlideMut = useAtualizarSlide(playlistId)
  const excluirSlideMut = useExcluirSlide(playlistId)
  const reordenarMut = useReordenarSlide(playlistId)

  const [novoTipo, setNovoTipo] = useState<TipoTela>('dashboard_macro')
  const [novoProjeto, setNovoProjeto] = useState('')

  const handleAdicionar = () => {
    const precisaProjeto = TIPO_PRECISA_PROJETO.includes(novoTipo) && !projetoDaPlaylist
    if (precisaProjeto && !novoProjeto) {
      toast.error('Esse tipo de slide precisa de um projeto (a playlist é de toda a empresa).')
      return
    }
    criarSlideMut.mutate({
      tipoTela: novoTipo,
      projetoId: precisaProjeto ? novoProjeto : null,
      ordem: slides.length,
    })
  }

  return (
    <div className="border-t border-gray-100 dark:border-gray-700 p-4 space-y-3 bg-gray-50/50 dark:bg-gray-900/30">
      {isLoading ? (
        <Loader2 className="animate-spin text-gray-400" size={16} />
      ) : slides.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">Nenhum slide ainda.</p>
      ) : (
        <ul className="space-y-1.5">
          {slides.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2 text-sm">
              <div className="flex flex-col">
                <button disabled={i === 0} onClick={() => reordenarMut.mutate({ slideA: s, slideB: slides[i - 1] })} className="disabled:opacity-20">
                  <ChevronUp size={12} />
                </button>
                <button disabled={i === slides.length - 1} onClick={() => reordenarMut.mutate({ slideA: s, slideB: slides[i + 1] })} className="disabled:opacity-20">
                  <ChevronDown size={12} />
                </button>
              </div>
              <span className="flex-1 min-w-0 truncate">{TIPO_LABELS[s.tipoTela]}</span>
              {TIPO_PRECISA_PROJETO.includes(s.tipoTela) && !projetoDaPlaylist && (
                <span className="text-xs text-gray-400 truncate max-w-[140px]">
                  {projetos.find((p) => p.id === s.projetoId)?.nome ?? '(sem projeto)'}
                </span>
              )}
              {s.tipoTela === 'custom_url' && (
                <Input
                  placeholder="https://..."
                  defaultValue={typeof s.parametros.url === 'string' ? s.parametros.url : ''}
                  onBlur={(e) => atualizarSlideMut.mutate({ id: s.id, parametros: { url: e.target.value } })}
                  className="h-7 text-xs w-40"
                />
              )}
              <Input
                type="number"
                min={1}
                value={s.duracaoSegundos}
                onChange={(e) => atualizarSlideMut.mutate({ id: s.id, duracaoSegundos: Number(e.target.value) || 1 })}
                className="h-7 w-16 text-xs"
                title="Duração (segundos)"
              />
              <span className="text-[10px] text-gray-400">s</span>
              <button onClick={() => excluirSlideMut.mutate(s.id)} className="text-gray-400 hover:text-red-600">
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <select
          value={novoTipo}
          onChange={(e) => setNovoTipo(e.target.value as TipoTela)}
          className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-2 py-1.5 text-xs"
        >
          {(Object.keys(TIPO_LABELS) as TipoTela[]).map((t) => (
            <option key={t} value={t}>{TIPO_LABELS[t]}</option>
          ))}
        </select>
        {TIPO_PRECISA_PROJETO.includes(novoTipo) && !projetoDaPlaylist && (
          <select
            value={novoProjeto}
            onChange={(e) => setNovoProjeto(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg px-2 py-1.5 text-xs"
          >
            <option value="">Selecione o projeto</option>
            {projetos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        )}
        <Button size="sm" variant="outline" onClick={handleAdicionar} disabled={criarSlideMut.isPending}>
          <Plus size={12} /> Adicionar slide
        </Button>
      </div>
    </div>
  )
}
