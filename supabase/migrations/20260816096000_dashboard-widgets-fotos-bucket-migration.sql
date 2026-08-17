-- ============================================================
-- MIGRAÇÃO: Bucket de fotos avulsas do dashboard (Visão Geral em canvas livre)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Suporta o widget "Foto" da Visão Geral (canvas arrastável/redimensionável):
-- imagem enviada pelo usuário, guardada em "{organizacao_id}/{arquivo}",
-- mesmo padrão de mapa-setores-plantas/mapa-plantas/rdr-fotos. Bucket
-- privado — leitura via blob baixado em runtime, não URL pública.

INSERT INTO storage.buckets (id, name, public)
VALUES ('dashboard-widgets-fotos', 'dashboard-widgets-fotos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "dashboard-widgets-fotos leitura da organizacao" ON storage.objects;
CREATE POLICY "dashboard-widgets-fotos leitura da organizacao"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dashboard-widgets-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "dashboard-widgets-fotos escrita da organizacao" ON storage.objects;
CREATE POLICY "dashboard-widgets-fotos escrita da organizacao"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dashboard-widgets-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "dashboard-widgets-fotos update da organizacao" ON storage.objects;
CREATE POLICY "dashboard-widgets-fotos update da organizacao"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'dashboard-widgets-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text)
  WITH CHECK (bucket_id = 'dashboard-widgets-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "dashboard-widgets-fotos delete da organizacao" ON storage.objects;
CREATE POLICY "dashboard-widgets-fotos delete da organizacao"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dashboard-widgets-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text);
