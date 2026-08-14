-- lpad('10000', 4, '0') retorna '1000' no PostgreSQL: textos maiores que a
-- largura pedida sao truncados. Ao chegar em 10000, o gerador anterior tentava
-- reutilizar CC-AAAA-1000 e falhava na chave unica. Mantemos os quatro zeros
-- para numeros menores e preservamos integralmente numeros com cinco ou mais
-- digitos.

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

  PERFORM pg_advisory_xact_lock(
    hashtext('carga-concreto:' || v_prefixo || v_ano::text)::bigint
  );

  IF NEW.codigo_rastreabilidade IS NOT NULL THEN
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

    v_codigo := v_prefixo || 'CC-' || v_ano || '-' || CASE
      WHEN v_numero < 10000 THEN lpad(v_numero::text, 4, '0')
      ELSE v_numero::text
    END;

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
