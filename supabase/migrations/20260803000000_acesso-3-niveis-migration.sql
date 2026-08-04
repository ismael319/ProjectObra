-- ============================================================
-- MIGRAÇÃO: Nível de acesso em 3 camadas (substitui admin/gestor/
-- engenheiro/campo por edicao/visualizacao/insercao_pontual)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- IMPORTANTE: Execute APÓS dashboard-visao-geral-migration.sql
-- (depende de user_papel(), user_organizacao(), is_super_admin(),
-- organizacao_piloto_id(), todas já criadas nas migrations anteriores)
-- ============================================================
-- Simplifica os 4 papéis de hoje pra 3, achatando a hierarquia
-- admin > gestor > engenheiro > campo:
--   edicao          = tudo que admin+gestor+engenheiro podiam fazer juntos
--                      (CRUD completo em cadastros, apontamentos, config)
--   visualizacao    = só leitura
--   insercao_pontual = só INSERT em apontamentos_diarios (nunca edita/
--                      apaga nada, em nenhuma tela) — era o "campo"
--
-- "Dono da Plataforma" (is_super_admin) continua exatamente como é hoje,
-- não faz parte deste papel — não é tocado aqui.
--
-- Rode em ordem, conferindo o resultado da seção 0 antes de continuar.
-- ============================================================

-- ============ 0. LEVANTAMENTO (rodar e revisar ANTES de seguir) ============
-- Não altera nada — mostra quantas contas de cada papel existem hoje e em
-- que vão virar, pra você conferir antes do UPDATE da seção 2.

SELECT
  papel,
  count(*) AS quantidade,
  CASE papel
    WHEN 'admin' THEN 'edicao'
    WHEN 'gestor' THEN 'edicao'
    WHEN 'engenheiro' THEN 'edicao'
    WHEN 'campo' THEN 'insercao_pontual'
    ELSE papel
  END AS vira
FROM public.user_profiles
GROUP BY papel
ORDER BY papel;

-- ============ 1. ALARGA OS CHECKs (união dos valores antigos + novos) ============
-- Assim nenhuma linha existente vira inválida durante o UPDATE da seção 2.

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_papel_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_papel_check
  CHECK (papel IN ('admin','gestor','engenheiro','campo','edicao','visualizacao','insercao_pontual'));

ALTER TABLE public.convites DROP CONSTRAINT IF EXISTS convites_papel_convidado_check;
ALTER TABLE public.convites ADD CONSTRAINT convites_papel_convidado_check
  CHECK (papel_convidado IN ('admin','gestor','engenheiro','campo','edicao','visualizacao','insercao_pontual'));

-- ============ 2. MIGRA OS DADOS EXISTENTES ============

UPDATE public.user_profiles SET papel = CASE papel
  WHEN 'admin' THEN 'edicao'
  WHEN 'gestor' THEN 'edicao'
  WHEN 'engenheiro' THEN 'edicao'
  WHEN 'campo' THEN 'insercao_pontual'
  ELSE papel
END
WHERE papel IN ('admin','gestor','engenheiro','campo');

-- Migra também convites já usados (mantém o histórico legível) e pendentes.
UPDATE public.convites SET papel_convidado = CASE papel_convidado
  WHEN 'admin' THEN 'edicao'
  WHEN 'gestor' THEN 'edicao'
  WHEN 'engenheiro' THEN 'edicao'
  WHEN 'campo' THEN 'insercao_pontual'
  ELSE papel_convidado
END
WHERE papel_convidado IN ('admin','gestor','engenheiro','campo');

-- ============ 3. ESTREITA OS CHECKs PROS 3 VALORES FINAIS ============

ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_papel_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_papel_check
  CHECK (papel IN ('edicao','visualizacao','insercao_pontual'));

ALTER TABLE public.convites DROP CONSTRAINT IF EXISTS convites_papel_convidado_check;
ALTER TABLE public.convites ADD CONSTRAINT convites_papel_convidado_check
  CHECK (papel_convidado IN ('edicao','visualizacao','insercao_pontual'));

-- ============ 4. POLICIES: user_profiles ============
-- Substitui as políticas que hoje distinguem admin/gestor por uma única
-- regra "edicao gerencia sua própria empresa" — sem hierarquia entre
-- quem pode conceder o quê (autoatendimento mantido, decisão do usuário).

DROP POLICY IF EXISTS "Admin gerencia perfis da propria organizacao" ON public.user_profiles;
CREATE POLICY "Edicao gerencia perfis da propria organizacao" ON public.user_profiles
  FOR ALL TO authenticated
  USING (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao())
  WITH CHECK (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao());

-- "Dono gerencia todos perfis" não muda (baseada em is_super_admin, não em papel).

DROP POLICY IF EXISTS "Piloto le solicitacoes orfas" ON public.user_profiles;
CREATE POLICY "Piloto le solicitacoes orfas" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    public.user_papel() = 'edicao'
    AND public.user_organizacao() = public.organizacao_piloto_id()
    AND organizacao_id IS NULL
  );

DROP POLICY IF EXISTS "Piloto decide solicitacoes orfas" ON public.user_profiles;
CREATE POLICY "Piloto decide solicitacoes orfas" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    public.user_papel() = 'edicao'
    AND public.user_organizacao() = public.organizacao_piloto_id()
    AND status_solicitacao = 'pendente' AND organizacao_id IS NULL
  )
  WITH CHECK (
    public.user_papel() = 'edicao'
    AND papel IN ('edicao','visualizacao','insercao_pontual')
    AND (
      (status_solicitacao = 'aprovado' AND organizacao_id = public.user_organizacao())
      OR (status_solicitacao = 'rejeitado' AND organizacao_id IS NULL)
    )
  );

-- ============ 5. POLICIES: convites ============

DROP POLICY IF EXISTS "Leitura convites" ON public.convites;
CREATE POLICY "Leitura convites" ON public.convites
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao()));

DROP POLICY IF EXISTS "Convite por dono ou gestor da organizacao" ON public.convites;
CREATE POLICY "Convite por dono ou edicao da organizacao" ON public.convites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao())
  );

DROP POLICY IF EXISTS "Cancelar convite pendente" ON public.convites;
CREATE POLICY "Cancelar convite pendente" ON public.convites
  FOR DELETE TO authenticated
  USING (usado_em IS NULL AND (public.is_super_admin() OR (public.user_papel() = 'edicao' AND organizacao_id = public.user_organizacao())));

-- ============ 6. POLICIES: cadastros (empresas, liderancas, setores, areas, subareas, atividades) ============
-- Leitura continua "true" em todas (não precisa recriar). Insert/Update/Delete
-- viram todos "edicao" — inclusive Delete, que hoje era só admin (ganho
-- aceito ao achatar os papéis).

DROP POLICY IF EXISTS "Insert empresas" ON public.empresas;
CREATE POLICY "Insert empresas" ON public.empresas FOR INSERT TO authenticated WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Update empresas" ON public.empresas;
CREATE POLICY "Update empresas" ON public.empresas FOR UPDATE TO authenticated USING (public.user_papel() = 'edicao') WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Delete empresas" ON public.empresas;
CREATE POLICY "Delete empresas" ON public.empresas FOR DELETE TO authenticated USING (public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Insert liderancas" ON public.liderancas;
CREATE POLICY "Insert liderancas" ON public.liderancas FOR INSERT TO authenticated WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Update liderancas" ON public.liderancas;
CREATE POLICY "Update liderancas" ON public.liderancas FOR UPDATE TO authenticated USING (public.user_papel() = 'edicao') WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Delete liderancas" ON public.liderancas;
CREATE POLICY "Delete liderancas" ON public.liderancas FOR DELETE TO authenticated USING (public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Insert setores" ON public.setores;
CREATE POLICY "Insert setores" ON public.setores FOR INSERT TO authenticated WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Update setores" ON public.setores;
CREATE POLICY "Update setores" ON public.setores FOR UPDATE TO authenticated USING (public.user_papel() = 'edicao') WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Delete setores" ON public.setores;
CREATE POLICY "Delete setores" ON public.setores FOR DELETE TO authenticated USING (public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Insert areas" ON public.areas;
CREATE POLICY "Insert areas" ON public.areas FOR INSERT TO authenticated WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Update areas" ON public.areas;
CREATE POLICY "Update areas" ON public.areas FOR UPDATE TO authenticated USING (public.user_papel() = 'edicao') WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Delete areas" ON public.areas;
CREATE POLICY "Delete areas" ON public.areas FOR DELETE TO authenticated USING (public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Insert subareas" ON public.subareas;
CREATE POLICY "Insert subareas" ON public.subareas FOR INSERT TO authenticated WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Update subareas" ON public.subareas;
CREATE POLICY "Update subareas" ON public.subareas FOR UPDATE TO authenticated USING (public.user_papel() = 'edicao') WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Delete subareas" ON public.subareas;
CREATE POLICY "Delete subareas" ON public.subareas FOR DELETE TO authenticated USING (public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Insert atividades" ON public.atividades;
CREATE POLICY "Insert atividades" ON public.atividades FOR INSERT TO authenticated WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Update atividades" ON public.atividades;
CREATE POLICY "Update atividades" ON public.atividades FOR UPDATE TO authenticated USING (public.user_papel() = 'edicao') WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Delete atividades" ON public.atividades;
CREATE POLICY "Delete atividades" ON public.atividades FOR DELETE TO authenticated USING (public.user_papel() = 'edicao');

-- ============ 7. POLICIES: apontamentos_diarios ============
-- insercao_pontual só entra no Insert (nunca em Update/Delete).

DROP POLICY IF EXISTS "Leitura apontamentos" ON public.apontamentos_diarios;
CREATE POLICY "Leitura apontamentos" ON public.apontamentos_diarios
  FOR SELECT TO authenticated
  USING (public.user_papel() IN ('edicao','visualizacao','insercao_pontual'));

DROP POLICY IF EXISTS "Insert apontamentos" ON public.apontamentos_diarios;
CREATE POLICY "Insert apontamentos" ON public.apontamentos_diarios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('edicao','insercao_pontual'));

DROP POLICY IF EXISTS "Update apontamentos" ON public.apontamentos_diarios;
CREATE POLICY "Update apontamentos" ON public.apontamentos_diarios
  FOR UPDATE TO authenticated
  USING (public.user_papel() = 'edicao')
  WITH CHECK (public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Delete apontamentos" ON public.apontamentos_diarios;
CREATE POLICY "Delete apontamentos" ON public.apontamentos_diarios
  FOR DELETE TO authenticated
  USING (public.user_papel() = 'edicao');

-- ============ 8. POLICIES: weeks / activities / app_settings (Programação Semanal) ============
-- activities: insercao_pontual (era "campo") perde a capacidade de UPDATE que
-- tinha hoje — só insere, igual às outras telas (decisão consciente, ver
-- plano). Delete continua só edicao.

DROP POLICY IF EXISTS "Insert weeks" ON public.weeks;
CREATE POLICY "Insert weeks" ON public.weeks FOR INSERT TO authenticated WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Update weeks" ON public.weeks;
CREATE POLICY "Update weeks" ON public.weeks FOR UPDATE TO authenticated USING (public.user_papel() = 'edicao') WITH CHECK (public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Insert activities" ON public.activities;
CREATE POLICY "Insert activities" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('edicao','insercao_pontual'));
DROP POLICY IF EXISTS "Update activities" ON public.activities;
CREATE POLICY "Update activities" ON public.activities
  FOR UPDATE TO authenticated
  USING (public.user_papel() = 'edicao')
  WITH CHECK (public.user_papel() = 'edicao');
DROP POLICY IF EXISTS "Delete activities" ON public.activities;
CREATE POLICY "Delete activities" ON public.activities FOR DELETE TO authenticated USING (public.user_papel() = 'edicao');

DROP POLICY IF EXISTS "Admin gerencia settings" ON public.app_settings;
CREATE POLICY "Edicao gerencia settings" ON public.app_settings
  FOR ALL TO authenticated
  USING (public.user_papel() = 'edicao')
  WITH CHECK (public.user_papel() = 'edicao');

-- ============ 9. POLICIES: dashboard_visao_geral_config ============

DROP POLICY IF EXISTS "Admin ou gestor edita config dashboard" ON public.dashboard_visao_geral_config;
CREATE POLICY "Edicao edita config dashboard" ON public.dashboard_visao_geral_config
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'))
  WITH CHECK (public.is_super_admin() OR (organizacao_id = public.user_organizacao() AND public.user_papel() = 'edicao'));

-- ============ 10. TRIGGER: remove o guard de escalação a "admin" ============
-- Não existe mais hierarquia entre papéis pra proteger (edicao já é o teto
-- dentro da empresa, e a RLS acima já restringe quem chega a dar UPDATE).
-- Mantém o carimbo de auditoria e o bloqueio de autodecisão.

CREATE OR REPLACE FUNCTION public.handle_user_profile_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (new.papel IS DISTINCT FROM old.papel)
     OR (new.status_solicitacao IS DISTINCT FROM old.status_solicitacao) THEN

    new.decidido_por := auth.uid();
    new.decidido_em := now();

    IF new.id = auth.uid() THEN
      RAISE EXCEPTION 'Não é permitido decidir sobre a própria solicitação';
    END IF;
  END IF;

  RETURN new;
END;
$$;
-- O trigger on_user_profile_decision já existe (criado em
-- user-approval-migration.sql) e reaproveita esta mesma função.
