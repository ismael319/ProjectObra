-- ============================================================
-- MIGRAÇÃO: Correção do RLS - Row Level Security
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- IMPORTANTE: Execute este script APÓS a migration anterior
-- (apontamento-migration.sql)
-- ============================================================

-- ============ 1. TABELA DE PERFIS DE USUÁRIO ============

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('admin','gestor','engenheiro','campo')),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ============ 2. FUNÇÃO AUXILIAR ============
-- (precisa existir antes das políticas que a referenciam)

CREATE OR REPLACE FUNCTION public.user_papel()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT papel FROM public.user_profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS "Leitura propio perfil" ON public.user_profiles;
CREATE POLICY "Leitura propio perfil" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Update propio perfil" ON public.user_profiles;
CREATE POLICY "Update propio perfil" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Admin gerencia perfis" ON public.user_profiles;
CREATE POLICY "Admin gerencia perfis" ON public.user_profiles
  FOR ALL TO authenticated
  USING (public.user_papel() = 'admin')
  WITH CHECK (public.user_papel() = 'admin');

-- ============ 3. TRIGGER: PERFIL AUTOMÁTICO NO SIGNUP ============

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, papel)
  VALUES (new.id, 'admin');
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ 4. REVOGAR ACESSO ANON ============

REVOKE ALL ON public.empresas FROM anon;
REVOKE ALL ON public.liderancas FROM anon;
REVOKE ALL ON public.setores FROM anon;
REVOKE ALL ON public.areas FROM anon;
REVOKE ALL ON public.subareas FROM anon;
REVOKE ALL ON public.atividades FROM anon;
REVOKE ALL ON public.apontamentos_diarios FROM anon;

-- ============ 5. REMOVER POLÍTICAS ANTIGAS ============

DROP POLICY IF EXISTS "Acesso público empresas" ON public.empresas;
DROP POLICY IF EXISTS "Acesso público liderancas" ON public.liderancas;
DROP POLICY IF EXISTS "Acesso público setores" ON public.setores;
DROP POLICY IF EXISTS "Acesso público areas" ON public.areas;
DROP POLICY IF EXISTS "Acesso público subareas" ON public.subareas;
DROP POLICY IF EXISTS "Acesso público atividades" ON public.atividades;
DROP POLICY IF EXISTS "Acesso público apontamentos" ON public.apontamentos_diarios;

-- ============ 6. NOVAS POLÍTICAS RLS ============

-- ---------- empresas ----------
DROP POLICY IF EXISTS "Leitura empresas" ON public.empresas;
CREATE POLICY "Leitura empresas" ON public.empresas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insert empresas" ON public.empresas;
CREATE POLICY "Insert empresas" ON public.empresas
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Update empresas" ON public.empresas;
CREATE POLICY "Update empresas" ON public.empresas
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor'))
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Delete empresas" ON public.empresas;
CREATE POLICY "Delete empresas" ON public.empresas
  FOR DELETE TO authenticated
  USING (public.user_papel() = 'admin');

-- ---------- liderancas ----------
DROP POLICY IF EXISTS "Leitura liderancas" ON public.liderancas;
CREATE POLICY "Leitura liderancas" ON public.liderancas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insert liderancas" ON public.liderancas;
CREATE POLICY "Insert liderancas" ON public.liderancas
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Update liderancas" ON public.liderancas;
CREATE POLICY "Update liderancas" ON public.liderancas
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor'))
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Delete liderancas" ON public.liderancas;
CREATE POLICY "Delete liderancas" ON public.liderancas
  FOR DELETE TO authenticated
  USING (public.user_papel() = 'admin');

-- ---------- setores ----------
DROP POLICY IF EXISTS "Leitura setores" ON public.setores;
CREATE POLICY "Leitura setores" ON public.setores
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insert setores" ON public.setores;
CREATE POLICY "Insert setores" ON public.setores
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Update setores" ON public.setores;
CREATE POLICY "Update setores" ON public.setores
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor'))
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Delete setores" ON public.setores;
CREATE POLICY "Delete setores" ON public.setores
  FOR DELETE TO authenticated
  USING (public.user_papel() = 'admin');

-- ---------- areas ----------
DROP POLICY IF EXISTS "Leitura areas" ON public.areas;
CREATE POLICY "Leitura areas" ON public.areas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insert areas" ON public.areas;
CREATE POLICY "Insert areas" ON public.areas
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Update areas" ON public.areas;
CREATE POLICY "Update areas" ON public.areas
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor'))
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Delete areas" ON public.areas;
CREATE POLICY "Delete areas" ON public.areas
  FOR DELETE TO authenticated
  USING (public.user_papel() = 'admin');

-- ---------- subareas ----------
DROP POLICY IF EXISTS "Leitura subareas" ON public.subareas;
CREATE POLICY "Leitura subareas" ON public.subareas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insert subareas" ON public.subareas;
CREATE POLICY "Insert subareas" ON public.subareas
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Update subareas" ON public.subareas;
CREATE POLICY "Update subareas" ON public.subareas
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor'))
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Delete subareas" ON public.subareas;
CREATE POLICY "Delete subareas" ON public.subareas
  FOR DELETE TO authenticated
  USING (public.user_papel() = 'admin');

-- ---------- atividades ----------
DROP POLICY IF EXISTS "Leitura atividades" ON public.atividades;
CREATE POLICY "Leitura atividades" ON public.atividades
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Insert atividades" ON public.atividades;
CREATE POLICY "Insert atividades" ON public.atividades
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Update atividades" ON public.atividades;
CREATE POLICY "Update atividades" ON public.atividades
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor'))
  WITH CHECK (public.user_papel() IN ('admin','gestor'));

DROP POLICY IF EXISTS "Delete atividades" ON public.atividades;
CREATE POLICY "Delete atividades" ON public.atividades
  FOR DELETE TO authenticated
  USING (public.user_papel() = 'admin');

-- ---------- apontamentos_diarios ----------
DROP POLICY IF EXISTS "Leitura apontamentos" ON public.apontamentos_diarios;
CREATE POLICY "Leitura apontamentos" ON public.apontamentos_diarios
  FOR SELECT TO authenticated
  USING (public.user_papel() IN ('admin','gestor','engenheiro'));

DROP POLICY IF EXISTS "Insert apontamentos" ON public.apontamentos_diarios;
CREATE POLICY "Insert apontamentos" ON public.apontamentos_diarios
  FOR INSERT TO authenticated
  WITH CHECK (public.user_papel() IN ('admin','gestor','engenheiro','campo'));

DROP POLICY IF EXISTS "Update apontamentos" ON public.apontamentos_diarios;
CREATE POLICY "Update apontamentos" ON public.apontamentos_diarios
  FOR UPDATE TO authenticated
  USING (public.user_papel() IN ('admin','gestor','engenheiro'))
  WITH CHECK (public.user_papel() IN ('admin','gestor','engenheiro'));

DROP POLICY IF EXISTS "Delete apontamentos" ON public.apontamentos_diarios;
CREATE POLICY "Delete apontamentos" ON public.apontamentos_diarios
  FOR DELETE TO authenticated
  USING (public.user_papel() IN ('admin','gestor'));

-- ============ 7. SEED: PERFIS PARA USUÁRIOS EXISTENTES ============

INSERT INTO public.user_profiles (id, papel)
SELECT id, 'admin'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.user_profiles)
ON CONFLICT (id) DO NOTHING;
