-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Hoje "Edicao gerencia rdr_records" é uma única policy FOR ALL exigindo
-- papel = 'edicao' pra QUALQUER escrita — diferente do resto do app,
-- 'insercao_pontual' também não conseguia cadastrar um RDR (Novo Registro),
-- só 'edicao'. Separa em INSERT (edicao/insercao_pontual/visualizacao,
-- mesmo padrão já usado em apontamentos_diarios/cargas_concreto) e
-- UPDATE/DELETE (só edicao, sem mudança).
--
-- Idempotente — seguro rodar mais de uma vez.

DROP POLICY IF EXISTS "Edicao gerencia rdr_records" ON public.rdr_records;

CREATE POLICY "Insert rdr_records" ON public.rdr_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() IN ('edicao', 'insercao_pontual', 'visualizacao')));

CREATE POLICY "Update rdr_records" ON public.rdr_records
  FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()))
  WITH CHECK (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()));

CREATE POLICY "Delete rdr_records" ON public.rdr_records
  FOR DELETE TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()));

NOTIFY pgrst, 'reload schema';
