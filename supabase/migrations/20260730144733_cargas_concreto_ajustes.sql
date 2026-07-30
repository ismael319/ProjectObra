-- ============================================================
-- MÓDULO "Qualidade" — Concreto
-- Ajustes em cargas_concreto/destinos_carga pro Lançamento em campo:
--
-- 1) ano_mes/ano_semana: faltavam na tabela — computeCarga() (lib/
--    concreto-utils.ts) já calcula os dois, no mesmo padrão de
--    apontamentos_diarios, mas não tinha onde persistir.
--
-- 2) RLS: a política de escrita original exigia papel 'edicao' pra
--    QUALQUER operação (INSERT/UPDATE/DELETE juntos num FOR ALL). Isso
--    bloquearia por completo o papel 'insercao_pontual' (usuário de
--    campo) de lançar uma carga — o mesmo papel que já pode inserir em
--    apontamentos_diarios (ver acesso-3-niveis-migration.sql). Troca o
--    FOR ALL por 3 políticas separadas, mesmo padrão usado lá: INSERT
--    libera edicao + insercao_pontual, UPDATE/DELETE continuam só
--    edicao.
-- ============================================================

-- ---------- 1) Colunas derivadas da data ----------

ALTER TABLE public.cargas_concreto ADD COLUMN IF NOT EXISTS ano_mes text;
ALTER TABLE public.cargas_concreto ADD COLUMN IF NOT EXISTS ano_semana text;

CREATE INDEX IF NOT EXISTS cargas_concreto_ano_mes_idx ON public.cargas_concreto (organizacao_id, ano_mes);
CREATE INDEX IF NOT EXISTS cargas_concreto_ano_semana_idx ON public.cargas_concreto (organizacao_id, ano_semana);

-- ---------- 2) RLS: separa INSERT (edicao + insercao_pontual) de UPDATE/DELETE (só edicao) ----------

DROP POLICY IF EXISTS "Edicao gerencia cargas_concreto" ON public.cargas_concreto;

DROP POLICY IF EXISTS "Insercao cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Insercao cargas_concreto" ON public.cargas_concreto
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() IN ('edicao', 'insercao_pontual')));

DROP POLICY IF EXISTS "Edicao atualiza cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Edicao atualiza cargas_concreto" ON public.cargas_concreto
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'));

DROP POLICY IF EXISTS "Edicao exclui cargas_concreto" ON public.cargas_concreto;
CREATE POLICY "Edicao exclui cargas_concreto" ON public.cargas_concreto
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'));

-- Mesmo split em destinos_carga — quem lança a carga em campo também
-- registra pra onde ela foi, no mesmo submit.

DROP POLICY IF EXISTS "Edicao gerencia destinos_carga" ON public.destinos_carga;

DROP POLICY IF EXISTS "Insercao destinos_carga" ON public.destinos_carga;
CREATE POLICY "Insercao destinos_carga" ON public.destinos_carga
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() IN ('edicao', 'insercao_pontual')));

DROP POLICY IF EXISTS "Edicao atualiza destinos_carga" ON public.destinos_carga;
CREATE POLICY "Edicao atualiza destinos_carga" ON public.destinos_carga
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'));

DROP POLICY IF EXISTS "Edicao exclui destinos_carga" ON public.destinos_carga;
CREATE POLICY "Edicao exclui destinos_carga" ON public.destinos_carga
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_ve_modulo('qualidade') AND public.user_papel() = 'edicao'));
