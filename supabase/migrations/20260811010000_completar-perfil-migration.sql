-- Adiciona coluna 'nome' na tabela user_profiles para completar perfil no primeiro acesso
-- Usuários existentes terão o nome derivado do email (parte antes do @) como fallback

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS nome text;

-- Preenche nome para usuários existentes (parte antes do @ do email)
UPDATE public.user_profiles
SET nome = split_part(email, '@', 1)
WHERE nome IS NULL AND email IS NOT NULL;

-- RPC para atualizar nome e funcao do perfil
CREATE OR REPLACE FUNCTION public.completar_perfil(
  p_nome text,
  p_funcao text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_profiles
  SET nome = p_nome,
      funcao = p_funcao
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;
END;
$$;

-- Permite que usuários autenticados chamem a RPC
GRANT EXECUTE ON FUNCTION public.completar_perfil(text, text) TO authenticated;
