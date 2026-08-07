-- ============================================================
-- MIGRAÇÃO: RDR — Preserva o autor original ao editar
-- Execute no SQL Editor do Supabase do ProjectObra
-- IMPORTANTE: rode DEPOIS de rdr-integridade-migration.sql
-- (20260803004300), que criou o trigger original.
-- ============================================================
-- Motivo: o trigger set_rdr_autor_nome rodava em BEFORE INSERT
-- OR UPDATE e sobrescrevia autor_nome com a conta logada em toda
-- edição. Quando um administrador editava um registro, o
-- responsável original (autor do registro) era perdido.
-- Com esta correção, apenas o INSERT grava a identidade da conta
-- logada; o UPDATE preserva o autor original.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_rdr_autor_nome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nome_usuario text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(NULLIF(u.raw_user_meta_data->>'nome', ''), u.email)
      INTO nome_usuario
      FROM auth.users u
      WHERE u.id = auth.uid();

    NEW.autor_nome := COALESCE(nome_usuario, NEW.autor_nome, '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rdr_autor_nome ON public.rdr_records;
CREATE TRIGGER trg_rdr_autor_nome
  BEFORE INSERT OR UPDATE ON public.rdr_records
  FOR EACH ROW EXECUTE FUNCTION public.set_rdr_autor_nome();
