-- ============================================================
-- MIGRAÇÃO: Módulo ativo/inativo por obra (não só por empresa inteira)
-- Execute este SQL no Supabase SQL Editor do ProjectObra
-- ============================================================
-- Hoje um módulo (engenharia, suprimentos, qualidade, segurança,
-- administração, sistema) só é contratado a nível de ORGANIZAÇÃO inteira
-- (organizacao_modulos) — toda obra da empresa compartilha o mesmo conjunto
-- de módulos. Essa migração adiciona uma exceção por obra: o Dono da
-- Plataforma pode desativar um módulo (já contratado pela empresa) só numa
-- obra específica, sem afetar as demais.
--
-- IMPORTANTE — escopo desta migração: isso troca só a NAVEGAÇÃO (menu e o
-- guard de rota RequireModulo) por obra, no mesmo nível de proteção que
-- user_modulos_visiveis (restrição por usuário) já tem hoje — "de vitrine",
-- não RESTRICTIVE POLICY. A trava de dados de verdade por módulo continua
-- sendo só a de organização (user_ve_modulo, ~140 policies em 34 migrations)
-- — replicar isso por obra é um projeto à parte, não incluído aqui.
--
-- Semântica: AUSÊNCIA de linha = módulo ativo na obra (herda o que a empresa
-- contratou). Só quem for desativado manualmente pra aquela obra ganha uma
-- linha aqui — mesmo padrão "sem restrição por padrão" de user_modulos_visiveis.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.projeto_modulos_desativados (
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  modulo_key text NOT NULL REFERENCES public.modulos(key) ON DELETE CASCADE,
  desativado_por uuid REFERENCES auth.users(id),
  desativado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (projeto_id, modulo_key)
);

ALTER TABLE public.projeto_modulos_desativados ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projeto_modulos_desativados TO authenticated;

-- Leitura: qualquer membro da própria organização do projeto — precisa pra
-- montar o menu de qualquer usuário, não só do Dono da Plataforma.
DROP POLICY IF EXISTS "Leitura projeto_modulos_desativados da organizacao" ON public.projeto_modulos_desativados;
CREATE POLICY "Leitura projeto_modulos_desativados da organizacao" ON public.projeto_modulos_desativados
  FOR SELECT TO authenticated
  USING (public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.projetos p
    WHERE p.id = projeto_modulos_desativados.projeto_id AND p.organizacao_id = public.user_organizacao()
  ));

-- Escrita: só Dono da Plataforma — mesmo modelo de organizacao_modulos hoje
-- (quem contrata/libera módulo pra empresa é sempre o Dono, nunca a própria
-- empresa cliente).
DROP POLICY IF EXISTS "Dono gerencia projeto_modulos_desativados" ON public.projeto_modulos_desativados;
CREATE POLICY "Dono gerencia projeto_modulos_desativados" ON public.projeto_modulos_desativados
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

NOTIFY pgrst, 'reload schema';
