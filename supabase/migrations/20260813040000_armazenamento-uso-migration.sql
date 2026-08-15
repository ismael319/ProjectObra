-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Uso de armazenamento por empresa + achar arquivos órfãos nos buckets de
-- imagem (mapa-plantas, rdr-fotos).
--
-- Contexto: mapa-plantas guarda plantas de Gestão à Vista (2-5MB cada,
-- ~3GB acumulados). useExcluirPlanta (src/lib/mapa-avanco/mapa-db.ts) já
-- apaga a linha em mapa_plantas ANTES de tentar remover o arquivo do
-- bucket (ordem certa — nunca fica linha apontando pra arquivo que sumiu),
-- mas a remoção do storage é best-effort e falha em silêncio: se der
-- errado, o arquivo fica pra sempre no bucket sem nenhuma linha
-- referenciando ele, e não existia nenhum jeito de achar isso depois.
--
-- Ambas as funções só leem `storage.objects` (metadados — nome do arquivo e
-- tamanho), nunca escrevem nela: apagar arquivo de verdade tem que passar
-- pela API de Storage (supabase.storage.from(bucket).remove(...)), que
-- limpa o blob no backend também — um DELETE direto em storage.objects só
-- apagaria a linha de metadado e deixaria o blob órfão do jeito oposto.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

-- ============ 1. Uso agregado por empresa (pra barra de uso) ============

CREATE OR REPLACE FUNCTION public.uso_armazenamento_organizacao(p_organizacao_id uuid)
RETURNS TABLE (bucket_id text, total_bytes bigint, total_arquivos bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT (public.is_super_admin() OR p_organizacao_id = public.user_organizacao()) THEN
    RAISE EXCEPTION 'Sem permissão para consultar o armazenamento desta empresa';
  END IF;

  RETURN QUERY
  SELECT o.bucket_id, COALESCE(SUM((o.metadata->>'size')::bigint), 0)::bigint, count(*)
  FROM storage.objects o
  WHERE o.bucket_id IN ('mapa-plantas', 'rdr-fotos')
    AND (storage.foldername(o.name))[1] = p_organizacao_id::text
  GROUP BY o.bucket_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.uso_armazenamento_organizacao(uuid) TO authenticated;

-- ============ 2. Lista de arquivos de um bucket, por empresa ============
-- Usado pra cruzar com mapa_plantas.arquivo_path no cliente e achar o que
-- não tem linha nenhuma apontando pra ele (órfão) — o cruzamento em si fica
-- em JS (src/lib/mapa-avanco/mapa-db.ts), não aqui, porque a "linha viva"
-- de referência é uma tabela normal (RLS já resolve isso do lado certo).

CREATE OR REPLACE FUNCTION public.listar_arquivos_organizacao(p_organizacao_id uuid, p_bucket text)
RETURNS TABLE (name text, size bigint)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT (public.is_super_admin() OR p_organizacao_id = public.user_organizacao()) THEN
    RAISE EXCEPTION 'Sem permissão para consultar os arquivos desta empresa';
  END IF;
  IF p_bucket NOT IN ('mapa-plantas', 'rdr-fotos') THEN
    RAISE EXCEPTION 'Bucket não suportado';
  END IF;

  RETURN QUERY
  SELECT o.name, (o.metadata->>'size')::bigint
  FROM storage.objects o
  WHERE o.bucket_id = p_bucket
    AND (storage.foldername(o.name))[1] = p_organizacao_id::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_arquivos_organizacao(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
