import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type Transicao = 'fade' | 'slide' | 'corte'
export type TipoTela = 'dashboard_macro' | 'curva_s' | 'mapa_setores' | 'producao_visual' | 'ocorrencias' | 'custom_url'

export interface Playlist {
  id: string
  organizacaoId: string | null
  projetoId: string | null
  nome: string
  ativo: boolean
  loop: boolean
  transicao: Transicao
  tokenAcessoPublico: string
  tokenRevogadoEm: string | null
  criadoEm: string
}

export interface Slide {
  id: string
  playlistId: string
  ordem: number
  tipoTela: TipoTela
  projetoId: string | null
  duracaoSegundos: number
  parametros: Record<string, unknown>
}

interface PlaylistRow {
  id: string
  organizacao_id: string | null
  projeto_id: string | null
  nome: string
  ativo: boolean
  loop: boolean
  transicao: Transicao
  token_acesso_publico: string
  token_revogado_em: string | null
  criado_em: string
}

interface SlideRow {
  id: string
  playlist_id: string
  ordem: number
  tipo_tela: TipoTela
  projeto_id: string | null
  duracao_segundos: number
  parametros: Record<string, unknown>
}

function mapPlaylist(r: PlaylistRow): Playlist {
  return {
    id: r.id,
    organizacaoId: r.organizacao_id,
    projetoId: r.projeto_id,
    nome: r.nome,
    ativo: r.ativo,
    loop: r.loop,
    transicao: r.transicao,
    tokenAcessoPublico: r.token_acesso_publico,
    tokenRevogadoEm: r.token_revogado_em,
    criadoEm: r.criado_em,
  }
}

function mapSlide(r: SlideRow): Slide {
  return {
    id: r.id,
    playlistId: r.playlist_id,
    ordem: r.ordem,
    tipoTela: r.tipo_tela,
    projetoId: r.projeto_id,
    duracaoSegundos: r.duracao_segundos,
    parametros: r.parametros ?? {},
  }
}

// ============ Configuração (autenticada) ============

export function usePlaylists(organizacaoId: string | undefined) {
  return useQuery({
    queryKey: ['apresentacao_playlists', organizacaoId],
    enabled: !!organizacaoId,
    queryFn: async () => {
      // RLS já restringe a "minhas" playlists (empresa + projetos que
      // enxergo) — sem filtro explícito de organizacao_id aqui, senão as de
      // projeto (organizacao_id NULL) ficariam de fora.
      const { data, error } = await supabase
        .from('apresentacao_playlists')
        .select('*')
        .order('criado_em', { ascending: false })
      if (error) throw error
      return (data as PlaylistRow[]).map(mapPlaylist)
    },
  })
}

export function useSlides(playlistId: string | undefined) {
  return useQuery({
    queryKey: ['apresentacao_slides', playlistId],
    enabled: !!playlistId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('apresentacao_slides')
        .select('*')
        .eq('playlist_id', playlistId!)
        .order('ordem')
      if (error) throw error
      return (data as SlideRow[]).map(mapSlide)
    },
  })
}

export function useCriarPlaylist(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { nome: string; escopo: 'empresa' | 'projeto'; projetoId?: string; userId?: string }) => {
      const { data, error } = await supabase
        .from('apresentacao_playlists')
        .insert({
          nome: input.nome,
          organizacao_id: input.escopo === 'empresa' ? organizacaoId : null,
          projeto_id: input.escopo === 'projeto' ? input.projetoId : null,
          criado_por: input.userId,
        })
        .select('*')
        .single()
      if (error) throw error
      return mapPlaylist(data as PlaylistRow)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apresentacao_playlists', organizacaoId] }),
  })
}

export function useAtualizarPlaylist(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; nome?: string; ativo?: boolean; loop?: boolean; transicao?: Transicao }) => {
      const { id, ...patch } = input
      const { error } = await supabase.from('apresentacao_playlists').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apresentacao_playlists', organizacaoId] }),
  })
}

export function useExcluirPlaylist(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('apresentacao_playlists').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apresentacao_playlists', organizacaoId] }),
  })
}

// Revogar/regenerar passam pelas funções do banco (não UPDATE direto): são
// elas que geram o token novo — ver migration da Fase D.
export function useRevogarToken(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (playlistId: string) => {
      const { error } = await supabase.rpc('apresentacao_revogar_token', { p_playlist_id: playlistId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apresentacao_playlists', organizacaoId] }),
  })
}

export function useRegenerarToken(organizacaoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (playlistId: string): Promise<string> => {
      const { data, error } = await supabase.rpc('apresentacao_regenerar_token', { p_playlist_id: playlistId })
      if (error) throw error
      return data as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apresentacao_playlists', organizacaoId] }),
  })
}

export function useCriarSlide(playlistId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { tipoTela: TipoTela; projetoId?: string | null; duracaoSegundos?: number; ordem: number }) => {
      const { error } = await supabase.from('apresentacao_slides').insert({
        playlist_id: playlistId,
        tipo_tela: input.tipoTela,
        projeto_id: input.projetoId ?? null,
        duracao_segundos: input.duracaoSegundos ?? 30,
        ordem: input.ordem,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apresentacao_slides', playlistId] }),
  })
}

export function useAtualizarSlide(playlistId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; duracaoSegundos?: number; projetoId?: string | null; parametros?: Record<string, unknown> }) => {
      const { id, duracaoSegundos, projetoId, parametros } = input
      const patch: Record<string, unknown> = {}
      if (duracaoSegundos !== undefined) patch.duracao_segundos = duracaoSegundos
      if (projetoId !== undefined) patch.projeto_id = projetoId
      if (parametros !== undefined) patch.parametros = parametros
      const { error } = await supabase.from('apresentacao_slides').update(patch).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apresentacao_slides', playlistId] }),
  })
}

export function useExcluirSlide(playlistId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('apresentacao_slides').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apresentacao_slides', playlistId] }),
  })
}

// Reordena movendo 1 posição pra cima/baixo — troca a `ordem` dos dois
// slides vizinhos. Sem drag-and-drop (nenhuma lib disponível no projeto
// ainda) — 2 setas fazem o mesmo trabalho com bem menos código.
export function useReordenarSlide(playlistId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { slideA: Slide; slideB: Slide }) => {
      const { slideA, slideB } = input
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from('apresentacao_slides').update({ ordem: slideB.ordem }).eq('id', slideA.id),
        supabase.from('apresentacao_slides').update({ ordem: slideA.ordem }).eq('id', slideB.id),
      ])
      if (e1) throw e1
      if (e2) throw e2
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apresentacao_slides', playlistId] }),
  })
}

// ============ Acesso público (RPCs — funcionam sem sessão) ============

export interface PublicoPlaylist {
  playlistId: string
  nome: string
  loop: boolean
  transicao: Transicao
}

export interface PublicoSlide {
  slideId: string
  ordem: number
  tipoTela: TipoTela
  projetoId: string | null
  duracaoSegundos: number
  parametros: Record<string, unknown>
}

export async function fetchPublicoPlaylist(token: string): Promise<PublicoPlaylist | null> {
  const { data, error } = await supabase.rpc('apresentacao_publica_playlist', { p_token: token })
  if (error) throw error
  const row = (data as { playlist_id: string; nome: string; loop: boolean; transicao: Transicao }[] | null)?.[0]
  if (!row) return null
  return { playlistId: row.playlist_id, nome: row.nome, loop: row.loop, transicao: row.transicao }
}

export async function fetchPublicoSlides(token: string): Promise<PublicoSlide[]> {
  const { data, error } = await supabase.rpc('apresentacao_publica_slides', { p_token: token })
  if (error) throw error
  return ((data ?? []) as {
    slide_id: string; ordem: number; tipo_tela: TipoTela; projeto_id: string | null
    duracao_segundos: number; parametros: Record<string, unknown>
  }[]).map((r) => ({
    slideId: r.slide_id, ordem: r.ordem, tipoTela: r.tipo_tela, projetoId: r.projeto_id,
    duracaoSegundos: r.duracao_segundos, parametros: r.parametros ?? {},
  }))
}

export interface PublicoKpi {
  projetoId: string
  nome: string
  cliente: string | null
  statusSemaforo: 'verde' | 'amarelo' | 'vermelho' | null
  avancoFisicoPct: number | null
  avancoPlanejadoPct: number | null
  ppcUltimaSemana: number | null
  efetivoAtual: number | null
  ocorrenciasAbertas: number | null
  ocorrenciasCriticas: number | null
}

export async function fetchPublicoKpis(token: string): Promise<PublicoKpi[]> {
  const { data, error } = await supabase.rpc('apresentacao_publica_kpis', { p_token: token })
  if (error) throw error
  return ((data ?? []) as Array<{
    projeto_id: string; nome: string; cliente: string | null; status_semaforo: PublicoKpi['statusSemaforo']
    avanco_fisico_pct: number | string | null; avanco_planejado_pct: number | string | null
    ppc_ultima_semana: number | string | null; efetivo_atual: number | null
    ocorrencias_abertas: number | null; ocorrencias_criticas: number | null
  }>).map((r) => ({
    projetoId: r.projeto_id,
    nome: r.nome,
    cliente: r.cliente,
    statusSemaforo: r.status_semaforo,
    avancoFisicoPct: r.avanco_fisico_pct != null ? Number(r.avanco_fisico_pct) : null,
    avancoPlanejadoPct: r.avanco_planejado_pct != null ? Number(r.avanco_planejado_pct) : null,
    ppcUltimaSemana: r.ppc_ultima_semana != null ? Number(r.ppc_ultima_semana) : null,
    efetivoAtual: r.efetivo_atual,
    ocorrenciasAbertas: r.ocorrencias_abertas,
    ocorrenciasCriticas: r.ocorrencias_criticas,
  }))
}

export interface PublicoCurvaS {
  nome: string
  cliente: string | null
  avancoFisicoPct: number | null
  avancoPlanejadoPct: number | null
  statusSemaforo: 'verde' | 'amarelo' | 'vermelho' | null
}

export async function fetchPublicoCurvaS(token: string, projetoId: string): Promise<PublicoCurvaS | null> {
  const { data, error } = await supabase.rpc('apresentacao_publica_curva_s', { p_token: token, p_projeto_id: projetoId })
  if (error) throw error
  const row = (data as Array<{
    nome: string; cliente: string | null; avanco_fisico_pct: number | string | null
    avanco_planejado_pct: number | string | null; status_semaforo: PublicoCurvaS['statusSemaforo']
  }> | null)?.[0]
  if (!row) return null
  return {
    nome: row.nome,
    cliente: row.cliente,
    avancoFisicoPct: row.avanco_fisico_pct != null ? Number(row.avanco_fisico_pct) : null,
    avancoPlanejadoPct: row.avanco_planejado_pct != null ? Number(row.avanco_planejado_pct) : null,
    statusSemaforo: row.status_semaforo,
  }
}

export interface PublicoOcorrencia {
  local: string
  descricao: string
  dataOcorrido: string
  prazo: string | null
  concluido: string
}

export async function fetchPublicoOcorrencias(token: string, projetoId: string): Promise<PublicoOcorrencia[]> {
  const { data, error } = await supabase.rpc('apresentacao_publica_ocorrencias', { p_token: token, p_projeto_id: projetoId })
  if (error) throw error
  return ((data ?? []) as Array<{ local: string; descricao: string; data_ocorrido: string; prazo: string | null; concluido: string }>)
    .map((r) => ({ local: r.local, descricao: r.descricao, dataOcorrido: r.data_ocorrido, prazo: r.prazo, concluido: r.concluido }))
}

export interface PublicoAtividadeHoje {
  id: string
  name: string
  area: string | null
  stage: string | null
  foreman: string | null
  company: string | null
  status: string
  is_extra: boolean
  inativa: boolean
  fora_do_plano: boolean
  planned_date: string
}

export async function fetchPublicoProducaoHoje(token: string, projetoId: string): Promise<PublicoAtividadeHoje[]> {
  const { data, error } = await supabase.rpc('apresentacao_publica_producao_hoje', { p_token: token, p_projeto_id: projetoId })
  if (error) throw error
  return (data ?? []) as PublicoAtividadeHoje[]
}
