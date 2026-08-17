import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { idbGet, idbSet, idbDelete } from '@/lib/idb-kv'

const BUCKET = 'mapa-setores-plantas'

// arquivo_path é conteúdo imutável (um crop novo grava só as colunas crop_*,
// nunca troca o arquivo) — cachear o blob por ele pra sempre é seguro. Mesmo
// padrão de src/lib/mapa-avanco/mapa-db.ts.
const chaveBlobPlanta = (arquivoPath: string) => `mapa_setores_planta_blob:${arquivoPath}`

export interface MapaSetoresPlanta {
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
  criado_em: string
}

export type TipoMarcador = 'ponto' | 'area'

export interface MapaSetoresMarcador {
  id: string
  organizacao_id: string
  planta_id: string
  nome: string
  tipo: TipoMarcador
  pos_x_pct: number | null
  pos_y_pct: number | null
  area_x_pct: number | null
  area_y_pct: number | null
  area_w_pct: number | null
  area_h_pct: number | null
  card_x_pct: number
  card_y_pct: number
  /** Cronograma de onde os 4 campos do card (ver mapa_setores_campos) leem suas
   * atividades — `null` até o usuário configurar via "Propriedades do card". */
  cronograma_id: string | null
  criado_em: string
  atualizado_em: string
}

export type CampoCardRow = 'inicio' | 'termino' | 'avanco_prev' | 'avanco_concl'
export type FonteTipoRow = 'atividade' | 'coluna_personalizada'

export interface MapaSetoresCampo {
  organizacao_id: string
  marcador_id: string
  campo: CampoCardRow
  fonte_tipo: FonteTipoRow
  activity_uid: number
  custom_field_id: string | null
  criado_em: string
}

// ---------------------------------------------------------------------------
// Plantas
// ---------------------------------------------------------------------------

export function usePlantasSetores(organizacaoId: string | undefined, projetoId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_setores_plantas', organizacaoId, projetoId],
    enabled: !!organizacaoId && !!projetoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_setores_plantas')
        .select('*')
        .eq('organizacao_id', organizacaoId!)
        .eq('projeto_id', projetoId!)
        .order('criado_em', { ascending: false })
      if (error) throw error
      return (data as MapaSetoresPlanta[]) ?? []
    },
  })
}

export function usePlantaSetores(plantaId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_setores_planta', plantaId],
    enabled: !!plantaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('mapa_setores_plantas').select('*').eq('id', plantaId!).single()
      if (error) throw error
      return data as MapaSetoresPlanta
    },
  })
}

/** Imagem de fundo como object URL local (blob:) — não signed URL: export com
 * html2canvas trata URL de outra origem como suja e devolve captura em branco, e signed
 * URL expira em 1h enquanto a tela fica aberta o dia todo na obra. Cacheado em IndexedDB
 * pra não rebaixar os MB da planta a cada F5. Mesmo padrão de usePlantaUrl (mapa-db.ts). */
export function usePlantaSetoresUrl(arquivoPath: string | undefined) {
  const query = useQuery({
    queryKey: ['mapa_setores_planta_blob', arquivoPath],
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

  const url = query.data
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  return query
}

export interface NovaPlantaSetorInput {
  nome: string
  /** Já convertido: PDF vira PNG no upload (ver pdf-para-imagem.ts). */
  blob: Blob
  extensao: string
  larguraNatural: number
  alturaNatural: number
}

export function useCriarPlantaSetor(organizacaoId: string | undefined, projetoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ nome, blob, extensao, larguraNatural, alturaNatural }: NovaPlantaSetorInput) => {
      if (!organizacaoId || !projetoId) throw new Error('Selecione uma obra antes de enviar a planta.')

      const plantaId = crypto.randomUUID()
      const path = `${organizacaoId}/${plantaId}/planta.${extensao}`

      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: blob.type || 'image/png', upsert: true })
      if (erroUpload) throw erroUpload

      const { error } = await supabase.from('mapa_setores_plantas').insert({
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
        await supabase.storage.from(BUCKET).remove([path])
        throw error
      }
      return plantaId
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_setores_plantas', organizacaoId, projetoId] })
    },
  })
}

export function useAtualizarCropSetor(organizacaoId: string | undefined, projetoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ plantaId, crop }: { plantaId: string; crop: { x: number; y: number; w: number; h: number } }) => {
      const { error } = await supabase
        .from('mapa_setores_plantas')
        .update({ crop_x: crop.x, crop_y: crop.y, crop_w: crop.w, crop_h: crop.h })
        .eq('id', plantaId)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['mapa_setores_plantas', organizacaoId, projetoId] })
      qc.invalidateQueries({ queryKey: ['mapa_setores_planta', vars.plantaId] })
    },
  })
}

export function useExcluirPlantaSetor(organizacaoId: string | undefined, projetoId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (planta: MapaSetoresPlanta) => {
      const { error } = await supabase.from('mapa_setores_plantas').delete().eq('id', planta.id)
      if (error) throw error
      // Best-effort: a linha (e os marcadores/vínculos em cascata) já foi embora — falhar
      // aqui só deixa o arquivo órfão no bucket, não corrompe nada.
      const { error: erroStorage } = await supabase.storage.from(BUCKET).remove([planta.arquivo_path])
      if (erroStorage) console.error('Falha ao remover arquivo da planta no Storage — ficou órfão:', planta.arquivo_path, erroStorage)
      await idbDelete(chaveBlobPlanta(planta.arquivo_path)).catch(() => {})
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_setores_plantas', organizacaoId, projetoId] })
    },
  })
}

export interface ResumoSetoresPlanta {
  total: number
  ultimaAtualizacao: string | null
}

/** Contagem de marcadores e última atualização por planta — usado na listagem para
 * mostrar quantos setores cada planta tem e quando foi mexido por último. Busca só
 * as colunas leves (planta_id, atualizado_em) e agrupa no cliente. */
export function useResumoSetores(plantaIds: string[]) {
  const chave = [...plantaIds].sort().join(',')
  return useQuery({
    queryKey: ['mapa_setores_resumo', chave],
    enabled: plantaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_setores_marcadores')
        .select('planta_id, atualizado_em')
        .in('planta_id', plantaIds)
      if (error) throw error
      const resumo = new Map<string, ResumoSetoresPlanta>()
      for (const m of (data as { planta_id: string; atualizado_em: string }[]) ?? []) {
        const atual = resumo.get(m.planta_id)
        if (!atual) {
          resumo.set(m.planta_id, { total: 1, ultimaAtualizacao: m.atualizado_em })
        } else {
          atual.total += 1
          if (m.atualizado_em > (atual.ultimaAtualizacao ?? '')) atual.ultimaAtualizacao = m.atualizado_em
        }
      }
      return resumo
    },
  })
}

// ---------------------------------------------------------------------------
// Marcadores (setores)
// ---------------------------------------------------------------------------

export function useMarcadores(plantaId: string | undefined) {
  return useQuery({
    queryKey: ['mapa_setores_marcadores', plantaId],
    enabled: !!plantaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mapa_setores_marcadores')
        .select('*')
        .eq('planta_id', plantaId!)
        .order('criado_em')
      if (error) throw error
      return (data as MapaSetoresMarcador[]) ?? []
    },
  })
}

export interface NovoMarcadorInput {
  organizacaoId: string
  plantaId: string
  nome: string
  tipo: TipoMarcador
  posXPct: number | null
  posYPct: number | null
  areaXPct: number | null
  areaYPct: number | null
  areaWPct: number | null
  areaHPct: number | null
  cardXPct: number
  cardYPct: number
}

export function useCriarMarcador(plantaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NovoMarcadorInput) => {
      const { data, error } = await supabase
        .from('mapa_setores_marcadores')
        .insert({
          organizacao_id: input.organizacaoId,
          planta_id: input.plantaId,
          nome: input.nome,
          tipo: input.tipo,
          pos_x_pct: input.posXPct,
          pos_y_pct: input.posYPct,
          area_x_pct: input.areaXPct,
          area_y_pct: input.areaYPct,
          area_w_pct: input.areaWPct,
          area_h_pct: input.areaHPct,
          card_x_pct: input.cardXPct,
          card_y_pct: input.cardYPct,
        })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_setores_marcadores', plantaId] })
    },
  })
}

/** Atualiza qualquer subconjunto de campos — usado tanto pelo form (nome) quanto pelo
 * drag/resize do marcador ou do card (posição), sempre otimista no cliente antes de
 * confirmar (ver PlantaSetores.tsx). */
export function useAtualizarMarcador(plantaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...campos }: Partial<MapaSetoresMarcador> & { id: string }) => {
      const { error } = await supabase
        .from('mapa_setores_marcadores')
        .update({ ...campos, atualizado_em: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_setores_marcadores', plantaId] })
    },
  })
}

export function useExcluirMarcador(plantaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (marcadorId: string) => {
      const { error } = await supabase.from('mapa_setores_marcadores').delete().eq('id', marcadorId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_setores_marcadores', plantaId] })
      qc.invalidateQueries({ queryKey: ['mapa_setores_campos'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Campos do card (início/término/avanço prev/avanço concl) — cada um com fonte própria
// ---------------------------------------------------------------------------

export function useCamposDosMarcadores(marcadorIds: string[]) {
  const chave = [...marcadorIds].sort().join(',')
  return useQuery({
    queryKey: ['mapa_setores_campos', chave],
    enabled: marcadorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('mapa_setores_campos').select('*').in('marcador_id', marcadorIds)
      if (error) throw error
      return (data as MapaSetoresCampo[]) ?? []
    },
  })
}

export interface CampoInput {
  campo: CampoCardRow
  fonteTipo: FonteTipoRow
  activityUid: number
  customFieldId: string | null
}

/** Grava o cronograma do marcador e substitui TODOS os campos dele pela lista nova
 * (delete + insert) — no máximo 4 linhas por marcador, então diff campo a campo não
 * compensa a complexidade. */
export function useSalvarPropriedadesDoCard(plantaId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      organizacaoId,
      marcadorId,
      cronogramaId,
      campos,
    }: {
      organizacaoId: string
      marcadorId: string
      cronogramaId: string | null
      campos: CampoInput[]
    }) => {
      const { error: erroMarcador } = await supabase
        .from('mapa_setores_marcadores')
        .update({ cronograma_id: cronogramaId, atualizado_em: new Date().toISOString() })
        .eq('id', marcadorId)
      if (erroMarcador) throw erroMarcador

      const { error: erroDelete } = await supabase.from('mapa_setores_campos').delete().eq('marcador_id', marcadorId)
      if (erroDelete) throw erroDelete

      if (campos.length === 0) return

      const { error: erroInsert } = await supabase.from('mapa_setores_campos').insert(
        campos.map((c) => ({
          organizacao_id: organizacaoId,
          marcador_id: marcadorId,
          campo: c.campo,
          fonte_tipo: c.fonteTipo,
          activity_uid: c.activityUid,
          custom_field_id: c.customFieldId,
        })),
      )
      if (erroInsert) throw erroInsert
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mapa_setores_marcadores', plantaId] })
      qc.invalidateQueries({ queryKey: ['mapa_setores_campos'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Realtime — mapa recalcula sozinho quando outra pessoa edita um marcador, os
// campos do card, ou reimporta o cronograma (sem precisar de F5). Primeiro uso
// de Realtime no projeto: sem convenção prévia a seguir, canal por planta.
// ---------------------------------------------------------------------------

export function useRealtimeMapaSetores(plantaId: string | undefined, projetoId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!plantaId) return

    const channel = supabase
      .channel(`mapa-setores:${plantaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mapa_setores_marcadores', filter: `planta_id=eq.${plantaId}` },
        () => qc.invalidateQueries({ queryKey: ['mapa_setores_marcadores', plantaId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mapa_setores_campos' },
        () => qc.invalidateQueries({ queryKey: ['mapa_setores_campos'] }),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [plantaId, qc])

  // Reimportação de cronograma (projeto_cronogramas.dados) NÃO recalcula os cards
  // sozinha: os dados do cronograma vivem em project-store.tsx, que hidrata cada
  // projeto uma única vez por sessão (hydratedProjectIds) e não expõe nenhuma forma seg
  // ura de forçar um refetch de fora — mexer nisso arriscaria o sistema de gerações que
  // evita corrida entre cargas. Em vez de um refresh silencioso arriscado, só avisa: o
  // usuário decide quando recarregar a página pra ver os números atualizados.
  useEffect(() => {
    if (!projetoId) return

    const channel = supabase
      .channel(`mapa-setores-cronogramas:${projetoId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'projeto_cronogramas', filter: `projeto_id=eq.${projetoId}` },
        () => {
          toast.info('O cronograma deste projeto foi atualizado.', {
            description: 'Recarregue a página para ver os avanços do Mapa de Setores com os dados mais recentes.',
            duration: 15000,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projetoId, qc])
}
