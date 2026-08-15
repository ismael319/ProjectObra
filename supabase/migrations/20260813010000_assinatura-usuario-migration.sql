-- Execute este SQL no Supabase SQL Editor do ProjectObra
--
-- Migration: Estilo de assinatura do usuário
--
-- Quem valida um lançamento (concreto, apontamento, programação) hoje aparece só
-- como nome e data. Passa a ter uma assinatura: o próprio nome desenhado numa
-- letra cursiva escolhida no primeiro acesso.
--
-- Guarda só a ESCOLHA do estilo, não uma imagem. Assim o nome corrigido no
-- perfil se reflete na assinatura sem ninguém precisar refazê-la, e não custa
-- nada de espaço nem de banda.
--
-- Idempotente — seguro rodar mais de uma vez.

-- ============ 1. Coluna ============

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS assinatura_estilo text;

COMMENT ON COLUMN public.user_profiles.assinatura_estilo IS
  'Estilo da assinatura exibida em validações e relatórios: dancing | vibes | caveat. NULL = usuário antigo que ainda não escolheu; a tela cai no nome em texto comum.';

-- Vale só o que a tela oferece — evita um valor digitado à mão virar uma
-- assinatura sem fonte correspondente, que apareceria na letra padrão.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_assinatura_estilo_check;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_assinatura_estilo_check
  CHECK (assinatura_estilo IS NULL OR assinatura_estilo IN ('dancing', 'vibes', 'caveat'));

-- ============ 2. completar_perfil passa a gravar o estilo ============
-- O DROP é necessário porque mudar a lista de parâmetros cria uma função NOVA
-- em vez de substituir a antiga — as duas conviveriam e o PostgREST não saberia
-- qual chamar. O parâmetro novo tem DEFAULT, então uma chamada com dois
-- argumentos (versão antiga do app ainda aberta no navegador) continua válida.

DROP FUNCTION IF EXISTS public.completar_perfil(text, text);
DROP FUNCTION IF EXISTS public.completar_perfil(text, text, text);

CREATE FUNCTION public.completar_perfil(
  p_nome text,
  p_funcao text,
  p_assinatura_estilo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_assinatura_estilo IS NOT NULL
     AND p_assinatura_estilo NOT IN ('dancing', 'vibes', 'caveat') THEN
    RAISE EXCEPTION 'Estilo de assinatura inválido: %', p_assinatura_estilo;
  END IF;

  UPDATE public.user_profiles
  SET nome = p_nome,
      funcao = p_funcao,
      -- COALESCE pra uma chamada sem o parâmetro (app antigo em cache) não
      -- apagar a assinatura de quem já escolheu.
      assinatura_estilo = COALESCE(p_assinatura_estilo, assinatura_estilo)
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.completar_perfil(text, text, text) TO authenticated;

-- ============ 3. Trocar o estilo depois, sem refazer o primeiro acesso ======

CREATE OR REPLACE FUNCTION public.atualizar_assinatura(p_assinatura_estilo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_assinatura_estilo IS NULL
     OR p_assinatura_estilo NOT IN ('dancing', 'vibes', 'caveat') THEN
    RAISE EXCEPTION 'Estilo de assinatura inválido: %', p_assinatura_estilo;
  END IF;

  UPDATE public.user_profiles
  SET assinatura_estilo = p_assinatura_estilo
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.atualizar_assinatura(text) TO authenticated;

-- ============ 4. Ler as assinaturas da própria organização ============
-- Pra desenhar a assinatura de QUEM VALIDOU, a tela precisa resolver o
-- usuario_id da confirmação em nome + estilo. Isso depende da policy de leitura
-- de user_profiles, que não dá pra garantir daqui — então expõe-se só o mínimo
-- por uma função dedicada.
--
-- A organização vem de auth.uid(), NUNCA de parâmetro do cliente: uma função
-- SECURITY DEFINER que aceitasse organizacao_id deixaria qualquer usuário
-- autenticado ler os nomes de outra empresa.

CREATE OR REPLACE FUNCTION public.assinaturas_da_organizacao()
RETURNS TABLE (
  id uuid,
  nome text,
  funcao text,
  assinatura_estilo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.nome, p.funcao, p.assinatura_estilo
  FROM public.user_profiles p
  WHERE p.organizacao_id = (
    SELECT organizacao_id FROM public.user_profiles WHERE id = auth.uid()
  )
  AND p.organizacao_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.assinaturas_da_organizacao() TO authenticated;
