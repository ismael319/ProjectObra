-- ============================================================
-- MIGRAÇÃO: Restringe escrita em projetos/cronogramas a nível Edição
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS multi-tenant-fase1-migration.sql
-- (usa user_organizacao(), is_super_admin(), user_papel())
-- ============================================================
-- A política de projetos/projeto_cronogramas era "FOR ALL" sem checar
-- papel — qualquer usuário autenticado da empresa (Visualização, Inserção
-- Pontual) conseguia editar/apagar um projeto ou seus cronogramas direto
-- pela API do Supabase, mesmo escondendo os botões na tela ("Novo
-- Projeto"/"Editar"/"Duplicar"/"Arquivar"/"Deletar"/"Gerenciar" em Meus
-- Projetos). Troca por leitura ampla (todo mundo da empresa continua
-- abrindo/usando projetos) + escrita restrita a Edição.
-- ============================================================

DROP POLICY IF EXISTS "Acesso projetos da organizacao" ON public.projetos;

CREATE POLICY "Leitura projetos da organizacao" ON public.projetos
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR organizacao_id = public.user_organizacao());

CREATE POLICY "Edicao gerencia projetos" ON public.projetos
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'));

DROP POLICY IF EXISTS "Acesso cronogramas da organizacao" ON public.projeto_cronogramas;

CREATE POLICY "Leitura cronogramas da organizacao" ON public.projeto_cronogramas
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao())
  );

CREATE POLICY "Edicao gerencia cronogramas" ON public.projeto_cronogramas
  FOR ALL TO authenticated
  USING (
    public.is_super_admin()
    OR (
      public.user_papel() = 'edicao'
      AND EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao())
    )
  )
  WITH CHECK (
    public.is_super_admin()
    OR (
      public.user_papel() = 'edicao'
      AND EXISTS (SELECT 1 FROM public.projetos p WHERE p.id = projeto_id AND p.organizacao_id = public.user_organizacao())
    )
  );
