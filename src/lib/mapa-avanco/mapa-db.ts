import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { idbGet, idbSet, idbDelete } from '@/lib/idb-kv'
import type { MapaCelula, MapaStatus } from './calculo'

const BUCKET = 'mapa-plantas'

// Chave do blob da planta em IndexedDB (kv genérico, não o QUEUE_STORE) —
// arquivo_path é conteúdo imutável (uma planta editada vira upload NOVO com
// id novo, nunca sobrescreve o path existente — ver useCriarPlanta), então
// cachear por ele pra sempre é seguro, sem risco de mostrar imagem velha.
const chaveBlobPlanta = (arquivoPath: string) => `mapa_planta_blob:${arquivoPath}`

export interface MapaPlanta {
  id: string
  organizacao_id: string
  projeto_id: string
  nome: string
  arquivo_path: string
  largura_natural: number
  altura_natural: number
  crop_x: number
  crop_y: number
  crop_w: number
  crop_h: number
  /** Só exibição: planta de AutoCAD é colorida demais e some sob a malha. */
  filtro_visual: 'normal' | 'cinza' | 'suave' | 'cinza-suave'
  criado_em: string
}

export interface MapaGrupo {
  id: string
  organizacao_id: string
  projeto_id: string
  nome: string
  criado_em: string
}

export interface MapaGrade {
  id: string
  organizacao_id: string
  planta_id: string
  grupo_id: string | null
  nome: string
  offset_x: number
  offset_y: number
  /** Tamanho do desenho de cada elemento. */
  largura_celula: number
  altura_celula: number
  /** Distância entre elementos. Igual ao tamanho = malha contígua (piso). */
  passo_x: number
  passo_y: number
  forma: 'retangulo' | 'circulo'
  colunas: number
  linhas: number
  ordem: number
  /** O que a grade representa no mundo real (ex.: 150 m² de telhado). */
  quantidade_total: number | null
  unidade: string | null
  criado_em: string
}

export interface MapaStatusRow extends MapaStatus {
  grade_id: string
}

export interface MapaCelulaRow extends MapaCelula {
  id: string
  grade_id: string
  atualizado_em: string
}

/**
 * Um trecho da malha. Uma grade pode ter vários — é o que permite mapear as
 * estacas do perímetro de um galpão (duas fileiras longas em X, duas laterais
 * em Y) com um contador só.
 */
export interface MapaSegmento {
  id: string
  organizacao_id: string
  grade_id: string
  nome: string | null
  offset_x: number
  offset_y: number
  largura_celula: number
  altura_celula: number
  passo_x: number
  passo_y: number
  colunas: number
  linhas: number
  ordem: number
}

// ---------------------------------------------------------------------------
// Plantas
// ---------------------------------------------------------------------------

export function usePlantas(organizacaoId: string | undefined, projetoId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_plantas', organizacaoId, projetoId],
    enabled: !!organizacaoId && !!projetoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_plantas')
        .select('*')
        .eq('organizacao_id', organizacaoId!)
        .eq('projeto_id', projetoId!)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return (data as MapaPlanta[]) ?? []
    },
  })
}

/**
 * A imagem de fundo como object URL local (blob:).
 *
 * Baixa o arquivo em vez de usar signed URL por dois motivos. O primeiro é a
 * exportação: html2canvas trata imagem de outra origem como suja e devolve a
 * captura EM BRANCO, sem erro nenhum — um blob: é mesma origem e sempre
 * captura. O segundo é a validade: signed URL expira em 1h e a tela de
 * apontamento fica aberta o dia todo na obra.
 *
 * O blob em si também é cacheado em IndexedDB (não só na memória do
 * QueryClient) — sem isso, `staleTime: Infinity` só evita rebuscar enquanto
 * a query segue montada; o `gcTime` padrão (5 min) descarta tudo assim que a
 * tela fica sem observador, e fechar/reabrir ou recarregar a página baixava
 * os 2-5MB de novo toda vez. Com o IndexedDB, o primeiro acesso baixa; os
 * seguintes (mesmo depois de recarregar a página ou fechar a aba) leem local.
 */
export function usePlantaUrl(arquivoPath: string | undefined) {
  const query = useQuery({
    queryKey: ['mapa_planta_blob', arquivoPath],
    enabled: !!arquivoPath,
    staleTime: Infinity,
    queryFn: async () => {
      const cacheKey = chaveBlobPlanta(arquivoPath!)
      const cached = await idbGet<Blob>(cacheKey)
      if (cached) return URL.createObjectURL(cached)

      const { data, error } = await supabase.storage.from(BUCKET).download(arquivoPath!)
      if (error || !data) throw error ?? new Error('Não foi possível abrir a planta')
      idbSet(cacheKey, data).catch(() => {})
      return URL.createObjectURL(data)
    },
  })

  // Sem isso cada troca de planta deixaria um blob preso na memória do
  // navegador até a aba ser fechada.
  const url = query.data
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  return query
}

export interface NovaPlantaInput {
  nome: string
  /** Já convertido: PDF vira PNG no upload (ver pdf-para-imagem.ts). */
  blob: Blob
  extensao: string
  larguraNatural: number
  alturaNatural: number
}

export function useCriarPlanta(organizacaoId: string | undefined, projetoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ nome, blob, extensao, larguraNatural, alturaNatural }: NovaPlantaInput) => {
      if (!organizacaoId || !projetoId) throw new Error('Selecione uma obra antes de enviar a planta.')

      // O id vem antes do upload porque ele faz parte do caminho no bucket, e o
      // caminho precisa começar pelo organizacao_id — é assim que a policy de
      // storage sabe de quem é o arquivo.
      const plantaId = crypto.randomUUID()
      const path = `${organizacaoId}/${plantaId}/planta.${extensao}`

      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/png', upsert: true })
      if (erroUpload) throw erroUpload

      const { error } = await supabase.from('mapa_plantas').insert({
        id: plantaId,
        organizacao_id: organizacaoId,
        projeto_id: projetoId,
        nome,
        arquivo_path: path,
        largura_natural: larguraNatural,
        altura_natural: alturaNatural,
        crop_x: 0,
        crop_y: 0,
        crop_w: larguraNatural,
        crop_h: alturaNatural,
      })
      if (error) {
        // Sem isso o arquivo ficaria órfão no bucket, ocupando espaço e sem
        // nenhuma linha apontando pra ele.
        await supabase.storage.from(BUCKET).remove([path])
        throw error
      }
      return plantaId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_plantas', organizacaoId, projetoId] })
    },
  })
}

export function useAtualizarCrop(organizacaoId: string | undefined, projetoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      plantaId,
      crop,
    }: {
      plantaId: string
      crop: { x: number; y: number; w: number; h: number }
    }) => {
      const { error } = await supabase
        .from('mapa_plantas')
        .update({ crop_x: crop.x, crop_y: crop.y, crop_w: crop.w, crop_h: crop.h })
        .eq('id', plantaId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_plantas', organizacaoId, projetoId] })
    },
  })
}

/** Aparência da planta de fundo (cinza / esmaecida) — só exibição. */
export function useAtualizarFiltroVisual(
  organizacaoId: string | undefined,
  projetoId: string | undefined,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      plantaId,
      filtro,
    }: {
      plantaId: string
      filtro: MapaPlanta['filtro_visual']
    }) => {
      const { error } = await supabase
        .from('mapa_plantas')
        .update({ filtro_visual: filtro })
        .eq('id', plantaId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_plantas', organizacaoId, projetoId] })
    },
  })
}

/** Edita um status do catálogo (cor, rótulo, peso). */
export function useAtualizarStatus(gradeId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<MapaStatusRow> & { id: string }) => {
      const { error } = await supabase.from('mapa_status').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_status', gradeId] })
      qc.invalidateQueries({ queryKey: ['mapa_status_varias'] })
    },
  })
}

export function useExcluirPlanta(organizacaoId: string | undefined, projetoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (planta: MapaPlanta) => {
      const { error } = await supabase.from('mapa_plantas').delete().eq('id', planta.id)
      if (error) throw error
      // Best-effort: a linha já foi embora (com as grades em cascata), então
      // falhar aqui só deixa um arquivo órfão, não corrompe nada — mas loga
      // pra não ficar 100% invisível. A limpeza de órfãos (UsoArmazenamentoBar/
      // useArquivosOrfaosPlantas) pega o que escapar por aqui depois.
      const { error: erroStorage } = await supabase.storage.from(BUCKET).remove([planta.arquivo_path])
      if (erroStorage) console.error('Falha ao remover arquivo da planta no Storage — ficou órfão:', planta.arquivo_path, erroStorage)
      // Cache local do blob (usePlantaUrl) não serve mais pra nada — sem
      // isso ficaria um blob de 2-5MB parado no IndexedDB do navegador pra
      // sempre, de uma planta que nem existe mais.
      await idbDelete(chaveBlobPlanta(planta.arquivo_path)).catch(() => {})
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_plantas', organizacaoId, projetoId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Grupos
// ---------------------------------------------------------------------------

export function useGrupos(organizacaoId: string | undefined, projetoId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_grupos', organizacaoId, projetoId],
    enabled: !!organizacaoId && !!projetoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_grupos')
        .select('*')
        .eq('organizacao_id', organizacaoId!)
        .eq('projeto_id', projetoId!)
        .order('nome')
      if (error) throw error
      return (data as MapaGrupo[]) ?? []
    },
  })
}

export function useCriarGrupo(organizacaoId: string | undefined, projetoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nome: string) => {
      const { data, error } = await supabase
        .from('mapa_grupos')
        .insert({ organizacao_id: organizacaoId, projeto_id: projetoId, nome })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_grupos', organizacaoId, projetoId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Grades e catálogo de status
// ---------------------------------------------------------------------------

export function useGrades(plantaId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_grades', plantaId],
    enabled: !!plantaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_grades')
        .select('*')
        .eq('planta_id', plantaId!)
        .order('ordem')
        .order('criado_em')
      if (error) throw error
      return (data as MapaGrade[]) ?? []
    },
  })
}

/** Todas as grades do projeto — usada pelos cards de resumo do topo. */
export function useGradesDoProjeto(organizacaoId: string | undefined, plantaIds: string[]) {
  const chave = [...plantaIds].sort().join(',')
  return useQuery({
    queryKey: ['mapa_grades_projeto', organizacaoId, chave],
    enabled: !!organizacaoId && plantaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_grades')
        .select('*')
        .in('planta_id', plantaIds)
        .order('ordem')
      if (error) throw error
      return (data as MapaGrade[]) ?? []
    },
  })
}

export function useStatusDaGrade(gradeId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_status', gradeId],
    enabled: !!gradeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_status')
        .select('*')
        .eq('grade_id', gradeId!)
        .order('ordem')
      if (error) throw error
      return (data as MapaStatusRow[]) ?? []
    },
  })
}

/** Catálogo de várias grades de uma vez — evita N consultas nos cards de resumo. */
export function useStatusDeVariasGrades(gradeIds: string[]) {
  const chave = [...gradeIds].sort().join(',')
  return useQuery({
    queryKey: ['mapa_status_varias', chave],
    enabled: gradeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('mapa_status').select('*').in('grade_id', gradeIds)
      if (error) throw error
      return (data as MapaStatusRow[]) ?? []
    },
  })
}

export interface StatusInput {
  chave: string
  label: string
  cor_hex: string
  peso: number
  conta_no_calculo: boolean
  ordem: number
}

export interface NovaGradeInput {
  plantaId: string
  grupoId: string | null
  nome: string
  offsetX: number
  offsetY: number
  larguraCelula: number
  alturaCelula: number
  passoX: number
  passoY: number
  forma: 'retangulo' | 'circulo'
  colunas: number
  linhas: number
  quantidadeTotal: number | null
  unidade: string | null
  status: StatusInput[]
}

export function useCriarGrade(organizacaoId: string | undefined, plantaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NovaGradeInput) => {
      const { data, error } = await supabase
        .from('mapa_grades')
        .insert({
          organizacao_id: organizacaoId,
          planta_id: input.plantaId,
          grupo_id: input.grupoId,
          nome: input.nome,
          offset_x: input.offsetX,
          offset_y: input.offsetY,
          largura_celula: input.larguraCelula,
          altura_celula: input.alturaCelula,
          passo_x: input.passoX,
          passo_y: input.passoY,
          forma: input.forma,
          colunas: input.colunas,
          linhas: input.linhas,
          quantidade_total: input.quantidadeTotal,
          unidade: input.unidade,
        })
        .select('id')
        .single()
      if (error) throw error

      const gradeId = (data as { id: string }).id
      const { error: erroStatus } = await supabase.from('mapa_status').insert(
        input.status.map((s) => ({ ...s, grade_id: gradeId, organizacao_id: organizacaoId })),
      )
      if (erroStatus) {
        // Grade sem catálogo não é apontável — desfaz para não deixar lixo.
        await supabase.from('mapa_grades').delete().eq('id', gradeId)
        throw erroStatus
      }

      // Toda grade nasce com uma fileira. Outras são adicionadas depois, na
      // calibração — é assim que o perímetro de estacas é montado.
      const { error: erroSegmento } = await supabase.from('mapa_segmentos').insert({
        organizacao_id: organizacaoId,
        grade_id: gradeId,
        nome: null,
        offset_x: input.offsetX,
        offset_y: input.offsetY,
        largura_celula: input.larguraCelula,
        altura_celula: input.alturaCelula,
        passo_x: input.passoX,
        passo_y: input.passoY,
        colunas: input.colunas,
        linhas: input.linhas,
        ordem: 0,
      })
      if (erroSegmento) {
        await supabase.from('mapa_grades').delete().eq('id', gradeId)
        throw erroSegmento
      }
      return gradeId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_grades', plantaId] })
      qc.invalidateQueries({ queryKey: ['mapa_grades_projeto'] })
    },
  })
}

export function useAtualizarGrade(plantaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<MapaGrade> & { id: string }) => {
      const { error } = await supabase.from('mapa_grades').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_grades', plantaId] })
      qc.invalidateQueries({ queryKey: ['mapa_grades_projeto'] })
    },
  })
}

export function useExcluirGrade(plantaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gradeId: string) => {
      const { error } = await supabase.from('mapa_grades').delete().eq('id', gradeId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_grades', plantaId] })
      qc.invalidateQueries({ queryKey: ['mapa_grades_projeto'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Segmentos (fileiras/trechos da malha)
// ---------------------------------------------------------------------------

export function useSegmentos(gradeId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_segmentos', gradeId],
    enabled: !!gradeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_segmentos')
        .select('*')
        .eq('grade_id', gradeId!)
        .order('ordem')
      if (error) throw error
      return (data as MapaSegmento[]) ?? []
    },
  })
}

/** Segmentos de várias grades — cards de resumo, numa consulta só. */
export function useSegmentosDeVariasGrades(gradeIds: string[]) {
  const chave = [...gradeIds].sort().join(',')
  return useQuery({
    queryKey: ['mapa_segmentos_varios', chave],
    enabled: gradeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('mapa_segmentos').select('*').in('grade_id', gradeIds)
      if (error) throw error
      return (data as MapaSegmento[]) ?? []
    },
  })
}

export function useCriarSegmento(gradeId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<MapaSegmento, 'id'>) => {
      const { data, error } = await supabase.from('mapa_segmentos').insert(input).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_segmentos', gradeId] })
      qc.invalidateQueries({ queryKey: ['mapa_segmentos_varios'] })
    },
  })
}

export function useAtualizarSegmento(gradeId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<MapaSegmento> & { id: string }) => {
      const { error } = await supabase.from('mapa_segmentos').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_segmentos', gradeId] })
      qc.invalidateQueries({ queryKey: ['mapa_segmentos_varios'] })
    },
  })
}

export function useExcluirSegmento(gradeId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mapa_segmentos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_segmentos', gradeId] })
      qc.invalidateQueries({ queryKey: ['mapa_segmentos_varios'] })
      qc.invalidateQueries({ queryKey: ['mapa_celulas', gradeId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Células (apontamento)
// ---------------------------------------------------------------------------

export function useCelulas(gradeId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_celulas', gradeId],
    enabled: !!gradeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_celulas')
        .select('id, grade_id, segmento_id, linha, coluna, status_id, atualizado_em')
        .eq('grade_id', gradeId!)
      if (error) throw error
      return (data as MapaCelulaRow[]) ?? []
    },
  })
}

/** Células de várias grades — cards de resumo, numa consulta só. */
export function useCelulasDeVariasGrades(gradeIds: string[]) {
  const chave = [...gradeIds].sort().join(',')
  return useQuery({
    queryKey: ['mapa_celulas_varias', chave],
    enabled: gradeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_celulas')
        .select('id, grade_id, segmento_id, linha, coluna, status_id, atualizado_em')
        .in('grade_id', gradeIds)
      if (error) throw error
      return (data as MapaCelulaRow[]) ?? []
    },
  })
}

/**
 * Marca N células de uma vez (o arraste do mouse gera várias).
 *
 * upsert com onConflict na chave natural: repintar uma célula já apontada troca
 * o status em vez de estourar o UNIQUE (grade_id, linha, coluna).
 */
export function useMarcarCelulas(gradeId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      organizacaoId,
      celulas,
      statusId,
      usuarioId,
    }: {
      organizacaoId: string
      celulas: { segmentoId: string; linha: number; coluna: number }[]
      statusId: string
      usuarioId: string | undefined
    }) => {
      if (celulas.length === 0) return
      // onConflict por segmento: linha 0/coluna 0 existe em CADA fileira, então
      // a chave natural precisa do segmento pra não colidir entre elas.
      const { error } = await supabase.from('mapa_celulas').upsert(
        celulas.map((c) => ({
          organizacao_id: organizacaoId,
          grade_id: gradeId,
          segmento_id: c.segmentoId,
          linha: c.linha,
          coluna: c.coluna,
          status_id: statusId,
          atualizado_por: usuarioId ?? null,
          atualizado_em: new Date().toISOString(),
        })),
        { onConflict: 'segmento_id,linha,coluna' },
      )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_celulas', gradeId] })
      qc.invalidateQueries({ queryKey: ['mapa_celulas_varias'] })
    },
  })
}

/** Zera o apontamento da grade: todas as células voltam ao status inicial. */
export function useZerarGrade(gradeId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('mapa_celulas').delete().eq('grade_id', gradeId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_celulas', gradeId] })
      qc.invalidateQueries({ queryKey: ['mapa_celulas_varias'] })
    },
  })
}
