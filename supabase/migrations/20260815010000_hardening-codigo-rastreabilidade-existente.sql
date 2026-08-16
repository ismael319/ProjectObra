-- Hardening do gerador de código de rastreabilidade: fecha a brecha do fluxo
-- de importação que envia codigo_rastreabilidade pré-preenchido.
--
-- O ramo "código informado" da função anterior atualizava o contador e
-- retornava NEW sem verificar se aquele código já existia em cargas_concreto.
-- Se um importador enviasse um código já em uso, o INSERT estourava a unique
-- constraint (duplicate key). Agora, quando o código informado já existe, o
-- trigger avança para o próximo número livre (mesma lógica do ramo automático)
-- e sobrescreve NEW.codigo_rastreabilidade, evitando a violação de chave.
--
-- Observação: quando a largura ainda é 4, a tabela tem códigos com 4 dígitos
-- (ex.: CC-2026-0001); a regexp casa o número à direita de qualquer tamanho e
-- o CASE abaixo mantém o alinhamento com zeros para números < 10000.

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
      v_ano := v_partes[1]::int;
      v_numero := v_partes[2]::int;

      IF EXISTS (
        SELECT 1
        FROM public.cargas_concreto
        WHERE codigo_rastreabilidade = NEW.codigo_rastreabilidade
      ) THEN
        LOOP
          v_numero := v_numero + 1;
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
      END IF;

      INSERT INTO public.codigo_rastreabilidade_contadores (organizacao_id, ano, ultimo_numero)
      VALUES (NEW.organizacao_id, v_ano, v_numero)
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
