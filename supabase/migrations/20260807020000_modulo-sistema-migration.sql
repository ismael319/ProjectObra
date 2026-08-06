-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Cria o módulo "sistema" — controla quem vê e usa a tela de Gestão de
-- Usuários (hoje só checava papel='edicao' GLOBAL, sem módulo nenhum). Com
-- papel por módulo (20260807000000_papel-por-modulo-fundacao-migration.sql),
-- dá pra dar a alguém edicao SÓ em "sistema" (pra administrar usuários) sem
-- soltar edicao no resto da organização — é o motivo de este módulo existir.
--
-- Toda organização já usava Gestão de Usuários livremente antes disso
-- existir — pra não tirar acesso de ninguém, ativa "sistema" pra TODAS as
-- organizações que já existem (não é um módulo pago/opcional escondido por
-- padrão, é a gestão de usuários da própria empresa; segue ativo em
-- organizações novas até alguém desativar deliberadamente em Empresas
-- Clientes).
--
-- Políticas de escrita trocadas: só as de user_profiles/convites que hoje
-- exigem user_papel() = 'edicao' (as autoritativas, definidas em
-- 20260803000000_acesso-3-niveis-migration.sql — as versões com terminologia
-- antiga 'admin'/'gestor' em outras migrations são histórico morto,
-- CHECK(papel IN ('edicao','visualizacao','insercao_pontual')) já impede
-- esses valores de existirem). Leitura (SELECT) não muda — só quem
-- aprova/edita/convida/cancela.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. Módulo "sistema" ============

INSERT INTO public.modulos (key, nome, descricao) VALUES
  ('sistema', 'Sistema', 'Gestão de usuários e permissões da organização')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.organizacao_modulos (organizacao_id, modulo_key, ativo)
SELECT id, 'sistema', true FROM public.organizacoes
ON CONFLICT (organizacao_id, modulo_key) DO UPDATE SET ativo = true;

-- ============ 2. user_profiles ============

DROP POLICY IF EXISTS "Edicao gerencia perfis da propria organizacao" ON public.user_profiles;
CREATE POLICY "Edicao gerencia perfis da propria organizacao" ON public.user_profiles
  FOR ALL TO authenticated
  USING (public.user_papel_modulo('sistema') = 'edicao' AND organizacao_id = public.user_organizacao())
  WITH CHECK (public.user_papel_modulo('sistema') = 'edicao' AND organizacao_id = public.user_organizacao());

DROP POLICY IF EXISTS "Piloto decide solicitacoes orfas" ON public.user_profiles;
CREATE POLICY "Piloto decide solicitacoes orfas" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (
    public.user_papel_modulo('sistema') = 'edicao'
    AND public.user_organizacao() = public.organizacao_piloto_id()
    AND status_solicitacao = 'pendente' AND organizacao_id IS NULL
  )
  WITH CHECK (
    public.user_papel_modulo('sistema') = 'edicao'
    AND papel IN ('edicao','visualizacao','insercao_pontual')
    AND (
      (status_solicitacao = 'aprovado' AND organizacao_id = public.user_organizacao())
      OR (status_solicitacao = 'rejeitado' AND organizacao_id IS NULL)
    )
  );

-- ============ 3. convites ============

DROP POLICY IF EXISTS "Convite por dono ou edicao da organizacao" ON public.convites;
CREATE POLICY "Convite por dono ou edicao da organizacao" ON public.convites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR (public.user_papel_modulo('sistema') = 'edicao' AND organizacao_id = public.user_organizacao())
  );

DROP POLICY IF EXISTS "Cancelar convite pendente" ON public.convites;
CREATE POLICY "Cancelar convite pendente" ON public.convites
  FOR DELETE TO authenticated
  USING (usado_em IS NULL AND (public.is_super_admin() OR (public.user_papel_modulo('sistema') = 'edicao' AND organizacao_id = public.user_organizacao())));

NOTIFY pgrst, 'reload schema';
