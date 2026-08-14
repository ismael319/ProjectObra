-- Importacoes historicas podem enviar codigo_rastreabilidade preenchido. A
-- versao anterior do trigger retornava sem atualizar o contador, fazendo o
-- proximo lancamento automatico tentar reutilizar um codigo ja existente.

-- Alinha os contadores legados ao maior codigo de cada organizacao/ano. O
-- padrao tambem contempla organizacoes que usam sigla antes de "CC".
WITH codigos AS (
  SELECT
    c.organizacao_id,
    (m.partes)[1]::int AS ano,
    (m.partes)[2]::int AS numero
  FROM public.cargas_concreto AS c
  CROSS JOIN LATERAL regexp_match(
    c.codigo_rastreabilidade,
    'CC-([0-9]{4})-([0-9]+)$'
  ) AS m(partes)
), maiores AS (
  SELECT organizacao_id, ano, max(numero) AS ultimo_numero
  FROM codigos
  GROUP BY organizacao_id, ano
)
INSERT INTO public.codigo_rastreabilidade_contadores (organizacao_id, ano, ultimo_numero)
SELECT organizacao_id, ano, ultimo_numero
FROM maiores
ON CONFLICT (organizacao_id, ano)
DO UPDATE SET ultimo_numero = GREATEST(
  public.codigo_rastreabilidade_contadores.ultimo_numero,
  EXCLUDED.ultimo_numero
);

CREATE OR REPLACE FUNCTION public.gerar_codigo_rastreabilidade_carga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ano int := EXTRACT(YEAR FROM NEW.data)::int;
  v_numero int;
  v_sigla text;
  v_prefixo text;
  v_codigo text;
  v_partes text[];
BEGIN
  SELECT sigla INTO v_sigla
  FROM public.organizacoes
  WHERE id = NEW.organizacao_id;

  v_prefixo := COALESCE(NULLIF(trim(v_sigla), '') || '-', '');

  -- O lock acompanha o namespace do codigo, nao apenas a organizacao. Assim,
  -- organizacoes com a mesma sigla tambem nao geram o mesmo codigo em paralelo.
  PERFORM pg_advisory_xact_lock(
    hashtext('carga-concreto:' || v_prefixo || v_ano::text)::bigint
  );

  IF NEW.codigo_rastreabilidade IS NOT NULL THEN
    -- Importacoes com codigo ja informado tambem atualizam o contador. Caso o
    -- formato seja externo, apenas preservamos o valor original sem interferir.
    v_partes := regexp_match(NEW.codigo_rastreabilidade, 'CC-([0-9]{4})-([0-9]+)$');
    IF v_partes IS NOT NULL THEN
      INSERT INTO public.codigo_rastreabilidade_contadores (organizacao_id, ano, ultimo_numero)
      VALUES (NEW.organizacao_id, v_partes[1]::int, v_partes[2]::int)
      ON CONFLICT (organizacao_id, ano)
      DO UPDATE SET ultimo_numero = GREATEST(
        public.codigo_rastreabilidade_contadores.ultimo_numero,
        EXCLUDED.ultimo_numero
      );
    END IF;
    RETURN NEW;
  END IF;

  LOOP
    INSERT INTO public.codigo_rastreabilidade_contadores (organizacao_id, ano, ultimo_numero)
    VALUES (NEW.organizacao_id, v_ano, 1)
    ON CONFLICT (organizacao_id, ano)
    DO UPDATE SET ultimo_numero = public.codigo_rastreabilidade_contadores.ultimo_numero + 1
    RETURNING ultimo_numero INTO v_numero;

    v_codigo := v_prefixo || 'CC-' || v_ano || '-' || lpad(v_numero::text, 4, '0');

    -- Protege os codigos antigos/importados que eventualmente nao tenham
    -- atualizado o contador. O proximo numero livre e usado na mesma transacao.
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.cargas_concreto
      WHERE codigo_rastreabilidade = v_codigo
    );
  END LOOP;

  NEW.codigo_rastreabilidade := v_codigo;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
