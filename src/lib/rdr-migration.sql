-- ============================================================
-- MIGRAÇÃO: RDR (Registro de Desvios e Reconhecimentos) — módulo Segurança
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS modulos-plataforma-migration.sql
-- ============================================================
-- Porta a ferramenta RDR do "Projeto 1" para dentro do ProjectObra,
-- seguindo o padrão multi-tenant já usado por projetos/cargas_concreto:
--  - toda tabela carrega organizacao_id;
--  - a proteção de verdade é a RESTRICTIVE POLICY por módulo + políticas
--    FOR ALL escopadas por organização;
--  - fotos vão para um bucket PRIVADO (não mais base64 na tabela).
--
-- NÃO cria rdr_users: login e papéis vêm de user_profiles (Supabase Auth),
-- e o acesso é "qualquer usuário da organização com módulo Segurança".
-- ============================================================

-- ============ 1. TABELA rdr_records ============
-- Espelha o schema do Projeto 1 (supabase/schema.sql) + organizacao_id.
-- categorias: jsonb (array de strings)
-- fotos:      jsonb (array de {path: string, name: string}) — path aponta
--             para o bucket rdr-fotos; NÃO guarda mais base64.
-- concluido:  text ('SIM' | 'NÃO' | '') — NÃO é boolean no app
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rdr_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacao_id uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  data_ocorrido date NOT NULL,
  hora text DEFAULT '',
  autor_id uuid REFERENCES auth.users(id),
  autor_nome text NOT NULL DEFAULT '',
  local text DEFAULT '',
  categorias jsonb NOT NULL DEFAULT '[]'::jsonb,
  concluido text DEFAULT '',
  nome_colaborador text DEFAULT '',
  responsavel_setor text DEFAULT '',
  responsavel_registro text DEFAULT '',
  descricao text NOT NULL,
  sugestao_correcao text DEFAULT '',
  prazo date,
  fotos jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rdr_records TO authenticated;
GRANT ALL ON public.rdr_records TO service_role;

ALTER TABLE public.rdr_records ENABLE ROW LEVEL SECURITY;

-- ============ 2. ÍNDICES ============

CREATE INDEX IF NOT EXISTS rdr_records_organizacao_id_idx ON public.rdr_records (organizacao_id);
CREATE INDEX IF NOT EXISTS rdr_records_autor_id_idx ON public.rdr_records (autor_id);
CREATE INDEX IF NOT EXISTS rdr_records_saved_at_idx ON public.rdr_records (criado_em DESC);
CREATE INDEX IF NOT EXISTS rdr_records_data_ocorrido_idx ON public.rdr_records (data_ocorrido DESC);

-- ============ 3. POLICIES ============
-- Gate RESTRICTIVE por módulo (soma com "E" às políticas abaixo): só quem
-- tem o módulo Segurança contratado enxerga/acessa — mesmo chamando a API
-- direto. Mesmo padrão de modulos-plataforma-migration.sql.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Restringe rdr_records pelo modulo seguranca" ON public.rdr_records;
CREATE POLICY "Restringe rdr_records pelo modulo seguranca"
  ON public.rdr_records AS RESTRICTIVE FOR ALL TO public
  USING (public.user_tem_modulo('seguranca'));

-- Acesso por organização: qualquer usuário autenticado da mesma empresa.
DROP POLICY IF EXISTS "Acesso rdr_records da organizacao" ON public.rdr_records;
CREATE POLICY "Acesso rdr_records da organizacao"
  ON public.rdr_records FOR ALL TO authenticated
  USING (organizacao_id = public.user_organizacao())
  WITH CHECK (organizacao_id = public.user_organizacao());

-- ============ 4. STORAGE: bucket privado rdr-fotos ============
-- Caminhos dos objetos: "{organizacao_id}/{record_id}/{nome-gerado}.jpg".
-- Políticas escopam por organização usando a primeira parte do caminho.
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('rdr-fotos', 'rdr-fotos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "rdr-fotos leitura da organizacao" ON storage.objects;
CREATE POLICY "rdr-fotos leitura da organizacao"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rdr-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "rdr-fotos escrita da organizacao" ON storage.objects;
CREATE POLICY "rdr-fotos escrita da organizacao"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rdr-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "rdr-fotos update da organizacao" ON storage.objects;
CREATE POLICY "rdr-fotos update da organizacao"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'rdr-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text)
  WITH CHECK (bucket_id = 'rdr-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

DROP POLICY IF EXISTS "rdr-fotos delete da organizacao" ON storage.objects;
CREATE POLICY "rdr-fotos delete da organizacao"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rdr-fotos' AND (storage.foldername(name))[1] = public.user_organizacao()::text);

-- ============================================================
-- NOTA SOBRE MIGRAÇÃO DE DADOS (Projeto 1 -> ProjectObra):
-- Os registros antigos estão no projeto Supabase "hapjuixvwsotcbmpsmyx"
-- (RLS desabilitado, leitura via anon key). A migração é feita pelo script
-- scripts/migrar-rdr.mjs, que:
--   1. lê rdr_records do banco antigo;
--   2. faz upload das fotos base64 para o bucket rdr-fotos;
--   3. insere os registros no banco novo com o organizacao_id alvo.
-- autor_id antigo não corresponde a auth.users do ProjectObra — o script
-- mantém autor_nome e deixa autor_id/criado_por apontando para quem migra.
-- ============================================================
