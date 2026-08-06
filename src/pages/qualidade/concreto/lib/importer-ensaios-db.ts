// Resolução contra o banco + gravação em lote da importação de resultados de
// ensaio (ImportarEnsaios.tsx). Transformação pura fica em
// importer-ensaios.ts — aqui só é achar a carga (elo Nota Fiscal/Nº Carga +
// Data de Moldagem — auxiliar, o código de rastreabilidade é o oficial, mas
// o relatório do laboratório não o conhece), achar/criar o corpo de prova, e
// gravar o ensaio.

import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "@/lib/administracao/parse-shared";
import type { EnsaioImportado, Problema } from "./importer-ensaios";

function somarDias(isoDate: string, dias: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

type CargaCatalogo = { id: string; numero_carga: string | null; nota_fiscal: string | null; data: string };
type LaboratorioCatalogo = { id: string; nome: string };
type CorpoProvaExistente = { id: string; carga_id: string; idade_prevista_dias: number; numero_lab: string | null };

export type ResumoImportacaoEnsaios = {
  ensaiosGravados: number;
  corposProvaCriados: number;
  problemas: Problema[];
};

export async function importarEnsaiosConcreto(params: {
  organizacaoId: string;
  userId?: string;
  itens: EnsaioImportado[];
}): Promise<ResumoImportacaoEnsaios> {
  const { organizacaoId, userId, itens } = params;
  const problemas: Problema[] = [];

  const [{ data: cargasData, error: errCargas }, { data: labsData, error: errLabs }, { data: cpsData, error: errCps }] = await Promise.all([
    supabase.from("cargas_concreto").select("id,numero_carga,nota_fiscal,data").eq("organizacao_id", organizacaoId),
    supabase.from("laboratorios").select("id,nome").eq("organizacao_id", organizacaoId),
    supabase.from("corpos_prova").select("id,carga_id,idade_prevista_dias,numero_lab").eq("organizacao_id", organizacaoId),
  ]);
  if (errCargas) throw new Error(errCargas.message);
  if (errLabs) throw new Error(errLabs.message);
  if (errCps) throw new Error(errCps.message);

  // Chave "identificação normalizada + data" pode bater com nota_fiscal OU
  // numero_carga — cada carga entra nas duas listas quando os dois campos
  // existem, pra aceitar o arquivo do laboratório usando qualquer um dos
  // dois números como identificador.
  const cargaPorChave = new Map<string, CargaCatalogo[]>();
  for (const c of (cargasData ?? []) as CargaCatalogo[]) {
    for (const ident of [c.numero_carga, c.nota_fiscal]) {
      if (!ident) continue;
      const chave = `${normalizarTexto(ident)}::${c.data}`;
      const lista = cargaPorChave.get(chave) ?? [];
      lista.push(c);
      cargaPorChave.set(chave, lista);
    }
  }

  const labPorNome = new Map<string, LaboratorioCatalogo>();
  for (const l of (labsData ?? []) as LaboratorioCatalogo[]) labPorNome.set(normalizarTexto(l.nome), l);

  // corpos_prova já existentes (ex.: criados pelo Lançamento, aguardando
  // resultado) — casado por carga + idade, pra não duplicar um CP que já foi
  // moldado, só completar o resultado dele.
  const cpPorCargaEIdade = new Map<string, CorpoProvaExistente>();
  for (const cp of (cpsData ?? []) as CorpoProvaExistente[]) {
    cpPorCargaEIdade.set(`${cp.carga_id}::${cp.idade_prevista_dias}`, cp);
  }

  const novosCorposProva: Record<string, unknown>[] = [];
  const ensaiosParaGravar: Record<string, unknown>[] = [];

  for (const item of itens) {
    const chaveCarga = `${normalizarTexto(item.identificacaoCarga)}::${item.dataMoldagem}`;
    const candidatas = cargaPorChave.get(chaveCarga) ?? [];
    if (candidatas.length === 0) {
      problemas.push({ linha: item.linha, descricao: `Nenhuma carga encontrada com identificação "${item.identificacaoCarga}" e data de moldagem ${item.dataMoldagem}.` });
      continue;
    }
    if (candidatas.length > 1) {
      problemas.push({ linha: item.linha, descricao: `Identificação "${item.identificacaoCarga}" + data ${item.dataMoldagem} bate com mais de uma carga — ambíguo, corrija o número antes de reimportar.` });
      continue;
    }
    const carga = candidatas[0]!;

    let laboratorioId: string | null = null;
    if (item.laboratorioNome) {
      const lab = labPorNome.get(normalizarTexto(item.laboratorioNome));
      if (!lab) {
        problemas.push({ linha: item.linha, descricao: `Laboratório "${item.laboratorioNome}" não cadastrado — cadastre em Cadastro > Laboratórios antes de reimportar.` });
        continue;
      }
      laboratorioId = lab.id;
    }

    let cp = cpPorCargaEIdade.get(`${carga.id}::${item.idadePrevistaDias}`);
    let corpoProvaId: string;
    if (cp) {
      corpoProvaId = cp.id;
    } else {
      // Sem CP pré-cadastrado pra essa idade (comum em importação de
      // histórico retroativo, de antes da rastreabilidade existir) — cria
      // na hora, já com o resultado sendo importado junto.
      corpoProvaId = crypto.randomUUID();
      const novoCp = {
        id: corpoProvaId,
        organizacao_id: organizacaoId,
        carga_id: carga.id,
        laboratorio_id: laboratorioId,
        numero_lab: item.numeroLab,
        peca_concretada: item.pecaConcretada,
        idade_prevista_dias: item.idadePrevistaDias,
        data_moldagem: item.dataMoldagem,
        data_ruptura_prevista: somarDias(item.dataMoldagem, item.idadePrevistaDias),
      };
      novosCorposProva.push(novoCp);
      cp = { id: corpoProvaId, carga_id: carga.id, idade_prevista_dias: item.idadePrevistaDias, numero_lab: item.numeroLab };
      cpPorCargaEIdade.set(`${carga.id}::${item.idadePrevistaDias}`, cp);
    }

    ensaiosParaGravar.push({
      corpo_prova_id: corpoProvaId,
      organizacao_id: organizacaoId,
      data_ruptura_real: item.dataRupturaReal,
      resultado_mpa: item.resultadoMpa,
      tipo_ruptura: item.tipoRuptura,
      temperatura_concreto: item.temperaturaConcreto,
      slump_aplicacao: item.slumpAplicacao,
      observacoes: item.observacoes,
      criado_por: userId ?? null,
    });
  }

  if (novosCorposProva.length > 0) {
    const { error } = await supabase.from("corpos_prova").insert(novosCorposProva);
    if (error) throw new Error(`Falha ao criar corpos de prova: ${error.message}`);
  }
  if (ensaiosParaGravar.length > 0) {
    const { error } = await supabase.from("ensaios_corpos_prova").upsert(ensaiosParaGravar, { onConflict: "corpo_prova_id" });
    if (error) throw new Error(`Falha ao gravar ensaios: ${error.message}`);
  }

  return { ensaiosGravados: ensaiosParaGravar.length, corposProvaCriados: novosCorposProva.length, problemas };
}
