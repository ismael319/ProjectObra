-- Correção: as tabelas "projetos" e "projeto_cronogramas" (criadas em
-- multi-tenant-fase1-migration.sql) ficaram com RLS habilitado e política
-- "FOR ALL", mas sem o GRANT de tabela — sem isso o Postgres nega a escrita
-- ANTES de sequer avaliar a política de RLS, então INSERT/UPDATE/UPSERT falha
-- silenciosamente (mesmo problema que já pegou outras tabelas neste projeto).
-- Era por isso que os cronogramas carregados pareciam salvar, mas sumiam ao
-- recarregar: a escrita no banco nunca ia adiante, só o estado local da tela.
-- Execute esta query no Supabase SQL Editor.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projetos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_cronogramas TO authenticated;
