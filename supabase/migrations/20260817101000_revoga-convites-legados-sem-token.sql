-- Convites anteriores ao token seguro não podem ser consumidos pelo novo
-- trigger. Revogá-los evita que apareçam como pendentes e libera o gestor
-- para reenviar um convite com link de uso único.
UPDATE public.convites
SET revogado_em = COALESCE(revogado_em, now())
WHERE usado_em IS NULL
  AND revogado_em IS NULL
  AND token_hash IS NULL;
