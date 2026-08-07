// Chamadas ao Supabase usadas pela importação de cargas (ImportarHistorico.tsx).
// Transformação pura fica em importer.ts — aqui só é resolução de catálogo
// (Setor/Área do Concreto / Fornecedor / Traço / Etapa) e gravação em lote.
//
// Mapeamento (confirmado com o cliente): PROJETO do arquivo é uma ÁREA do
// Concreto (não um Setor) — cada Área já pertence a um Setor do Concreto,
// então ao casar por nome herdamos o Setor dela automaticamente. ETAPA vira
// uma Etapa do catálogo próprio do Concreto (etapas_concreto) — independente
// de Área/Setor, só por organização. Setores/Áreas aqui são sempre do
// catálogo PRÓPRIO do Concreto (setores_concreto/areas_concreto), separado
// do Apontamento de efetivo (ver 20260807060000_concreto-setores-areas-
// migration.sql).

import { supabase } from "@/lib/supabase";
import { normalizarTexto } from "@/lib/administracao/parse-shared";
import { computeCarga } from "./concreto-utils";
import { TRACOS_CANONICOS, type CargaImportada } from "./importer";

const TAMANHO_LOTE = 500;

// ---------- Setores/Áreas (catálogo próprio do Concreto, por organização) ----------
// O arquivo importado só tem PROJETO (o nome da Área) — não tem Setor. Pra
// não exigir revisão manual a cada Área nova, quando o PROJETO não bate com
// nenhuma Área do Concreto já cadastrada (em qualquer Setor), o próprio nome
// do Projeto vira o Setor também (resolve-ou-cria os dois): "ALMOXARIFADO"
// sem correspondência cria o Setor do Concreto "ALMOXARIFADO" e a Área do
// Concreto "ALMOXARIFADO" dentro dele. Áreas que já existem (de qualquer
// Setor) só são casadas pelo nome, nunca duplicadas.

type AreaConcretoResolvida = { areaConcretoId: string; setorConcretoId: string };

class ResolvedorDeAreasConcreto {
  private porNomeArea = new Map<string, AreaConcretoResolvida>(); // normNome área -> {areaConcretoId, setorConcretoId}
  private porNomeSetor = new Map<string, string>(); // normNome setor -> setorConcretoId
  private organizacaoCarregada: string | null = null;
  areasCriadas = 0;
  setoresCriados = 0;

  private async carregarSeNecessario(organizacaoId: string) {
    if (this.organizacaoCarregada === organizacaoId) return;
    const [{ data: areas, error: errAreas }, { data: setores, error: errSetores }] = await Promise.all([
      supabase.from("areas_concreto").select("id,setor_concreto_id,nome").eq("organizacao_id", organizacaoId).eq("ativo", true),
      supabase.from("setores_concreto").select("id,nome").eq("organizacao_id", organizacaoId).eq("ativo", true),
    ]);
    if (errAreas) throw new Error(errAreas.message);
    if (errSetores) throw new Error(errSetores.message);
    this.porNomeArea.clear();
    this.porNomeSetor.clear();
    for (const a of (areas ?? []) as { id: string; setor_concreto_id: string; nome: string }[]) {
      this.porNomeArea.set(normalizarTexto(a.nome), { areaConcretoId: a.id, setorConcretoId: a.setor_concreto_id });
    }
    for (const s of (setores ?? []) as { id: string; nome: string }[]) {
      this.porNomeSetor.set(normalizarTexto(s.nome), s.id);
    }
    this.organizacaoCarregada = organizacaoId;
  }

  async resolverOuCriar(organizacaoId: string, nome: string): Promise<AreaConcretoResolvida> {
    await this.carregarSeNecessario(organizacaoId);
    const chave = normalizarTexto(nome);
    const existente = this.porNomeArea.get(chave);
    if (existente) return existente;

    let setorConcretoId = this.porNomeSetor.get(chave);
    if (!setorConcretoId) {
      const { data, error } = await supabase.from("setores_concreto").insert({ organizacao_id: organizacaoId, nome }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? `Falha ao criar setor "${nome}".`);
      setorConcretoId = (data as { id: string }).id;
      this.porNomeSetor.set(chave, setorConcretoId);
      this.setoresCriados++;
    }

    const { data, error } = await supabase.from("areas_concreto").insert({ organizacao_id: organizacaoId, setor_concreto_id: setorConcretoId, nome }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? `Falha ao criar área "${nome}".`);
    const resolvida: AreaConcretoResolvida = { areaConcretoId: (data as { id: string }).id, setorConcretoId };
    this.porNomeArea.set(chave, resolvida);
    this.areasCriadas++;
    return resolvida;
  }
}

// ---------- Traços (catálogo por organização — resolvido só por NOME, nunca criado a partir do arquivo) ----------
// Traço tem dados técnicos (consumo de cimento/brita/água...) que não dá pra
// inventar só com o nome vindo do arquivo — se não bater com nada cadastrado,
// a linha fica pendente de revisão manual (mesmo esquema da Área).

export type TracoCatalogo = {
  id: string;
  nome: string;
  fck_mpa: number;
  consumo_cimento_kg_m3: number | null;
  consumo_brita00_kg_m3: number | null;
  consumo_brita01_kg_m3: number | null;
  consumo_po_brita_kg_m3: number | null;
  consumo_areia_kg_m3: number | null;
};

// Garante que os 6 traços canônicos existam na organização (baseline pra
// organização nova) — não sobrescreve nem duplica traços já cadastrados
// (inclusive customizados pelo cliente).
async function seedTracosCanonicos(organizacaoId: string): Promise<void> {
  const { data: existentes, error: errBusca } = await supabase
    .from("tracos_concreto")
    .select("nome")
    .eq("organizacao_id", organizacaoId);
  if (errBusca) throw new Error(errBusca.message);
  const nomesExistentes = new Set((existentes ?? []).map((t) => normalizarTexto((t as { nome: string }).nome)));

  for (const canonico of TRACOS_CANONICOS) {
    if (nomesExistentes.has(normalizarTexto(canonico.nome))) continue;
    const { error } = await supabase.from("tracos_concreto").insert({
      organizacao_id: organizacaoId,
      nome: canonico.nome,
      fck_mpa: canonico.fckMpa,
      consumo_cimento_kg_m3: canonico.consumo_cimento_kg_m3,
      consumo_brita00_kg_m3: canonico.consumo_brita00_kg_m3,
      consumo_brita01_kg_m3: canonico.consumo_brita01_kg_m3,
      consumo_po_brita_kg_m3: canonico.consumo_po_brita_kg_m3,
      consumo_areia_kg_m3: canonico.consumo_areia_kg_m3,
      consumo_agua_l_m3: canonico.consumo_agua_l_m3,
      consumo_aditivo1_l_m3: canonico.consumo_aditivo1_l_m3,
      consumo_aditivo2_l_m3: canonico.consumo_aditivo2_l_m3,
      preco_unitario_m3: canonico.preco_unitario_m3,
    });
    if (error) throw new Error(`Falha ao criar traço "${canonico.nome}": ${error.message}`);
  }
}

/** Semeia os traços canônicos (se faltarem) e devolve o catálogo completo da organização. */
export async function carregarTracos(organizacaoId: string): Promise<TracoCatalogo[]> {
  await seedTracosCanonicos(organizacaoId);
  const { data, error } = await supabase
    .from("tracos_concreto")
    .select("id,nome,fck_mpa,consumo_cimento_kg_m3,consumo_brita00_kg_m3,consumo_brita01_kg_m3,consumo_po_brita_kg_m3,consumo_areia_kg_m3")
    .eq("organizacao_id", organizacaoId);
  if (error) throw new Error(error.message);
  return (data ?? []) as TracoCatalogo[];
}

export type ResolucaoTraco = { tipo: "match"; tracoId: string } | { tipo: "pular" };
export type MapeamentoTracos = Map<string, ResolucaoTraco>; // chave: normalizarTexto(tracoNomeRaw)

/** Casa cada nome de Traço distinto contra o cadastro da organização; o que não bater fica pra revisão manual. */
export function sugerirMapeamentoTracos(nomesDistintos: string[], tracos: TracoCatalogo[]): {
  sugestao: MapeamentoTracos;
  semCorrespondencia: string[];
} {
  const porNomeNorm = new Map(tracos.map((t) => [normalizarTexto(t.nome), t]));
  const sugestao: MapeamentoTracos = new Map();
  const semCorrespondencia: string[] = [];
  for (const nome of nomesDistintos) {
    const chave = normalizarTexto(nome);
    const traco = porNomeNorm.get(chave);
    if (traco) sugestao.set(chave, { tipo: "match", tracoId: traco.id });
    else semCorrespondencia.push(nome);
  }
  return { sugestao, semCorrespondencia };
}

// ---------- Etapas de concreto (catálogo por organização, independente de Área/Setor) ----------

type EtapaCatalogo = { id: string; nome: string };

class ResolvedorDeEtapas {
  private porChave = new Map<string, string>(); // normNome -> etapaId
  private organizacaoCarregada: string | null = null;
  criadas = 0;

  private async carregarSeNecessario(organizacaoId: string) {
    if (this.organizacaoCarregada === organizacaoId) return;
    const { data, error } = await supabase.from("etapas_concreto").select("id,nome").eq("organizacao_id", organizacaoId);
    if (error) throw new Error(error.message);
    this.porChave.clear();
    for (const e of (data ?? []) as EtapaCatalogo[]) {
      this.porChave.set(normalizarTexto(e.nome), e.id);
    }
    this.organizacaoCarregada = organizacaoId;
  }

  async resolverOuCriar(organizacaoId: string, nome: string): Promise<string> {
    await this.carregarSeNecessario(organizacaoId);
    const chave = normalizarTexto(nome);
    const existente = this.porChave.get(chave);
    if (existente) return existente;

    const { data, error } = await supabase.from("etapas_concreto").insert({ organizacao_id: organizacaoId, nome }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? `Falha ao criar etapa "${nome}".`);
    const id = (data as { id: string }).id;
    this.porChave.set(chave, id);
    this.criadas++;
    return id;
  }
}

// ---------- Fornecedores (catálogo por organização — resolvido ou criado por NOME) ----------
// Fornecedor só tem nome+tipo, então dá pra criar direto a partir do arquivo
// (diferente de Traço, que tem dados técnicos que não têm de onde vir).

type FornecedorCatalogo = { id: string; nome: string };

class ResolvedorDeFornecedores {
  private porChave = new Map<string, string>(); // normNome -> fornecedorId
  private organizacaoCarregada: string | null = null;
  criados = 0;

  private async carregarSeNecessario(organizacaoId: string) {
    if (this.organizacaoCarregada === organizacaoId) return;
    const { data, error } = await supabase.from("fornecedores_concreto").select("id,nome").eq("organizacao_id", organizacaoId);
    if (error) throw new Error(error.message);
    this.porChave.clear();
    for (const f of (data ?? []) as FornecedorCatalogo[]) {
      this.porChave.set(normalizarTexto(f.nome), f.id);
    }
    this.organizacaoCarregada = organizacaoId;
  }

  async resolverOuCriar(organizacaoId: string, nome: string, tipo: "propria" | "externa"): Promise<string> {
    await this.carregarSeNecessario(organizacaoId);
    const chave = normalizarTexto(nome);
    const existente = this.porChave.get(chave);
    if (existente) return existente;

    const { data, error } = await supabase.from("fornecedores_concreto").insert({ organizacao_id: organizacaoId, nome, tipo }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? `Falha ao criar fornecedor "${nome}".`);
    const id = (data as { id: string }).id;
    this.porChave.set(chave, id);
    this.criados++;
    return id;
  }
}

// ---------- Substituição total ----------
// A importação é sempre "substitui tudo": o arquivo importado passa a ser a
// única fonte de verdade dos lançamentos da organização — qualquer carga já
// existente (lançada manualmente ou de uma importação anterior) é apagada
// antes de gravar as novas. destinos_carga cai junto via ON DELETE CASCADE
// (destinos_carga.carga_id → cargas_concreto.id). Cadastros (fornecedores/
// traços/etapas) NÃO são tocados aqui.
async function apagarLancamentosExistentes(organizacaoId: string): Promise<number> {
  const { data, error } = await supabase
    .from("cargas_concreto")
    .delete()
    .eq("organizacao_id", organizacaoId)
    .select("id");
  if (error) throw new Error(`Falha ao apagar lançamentos existentes: ${error.message}`);
  return (data ?? []).length;
}

// ---------- Commit em lote ----------

export type ResumoImportacaoConcreto = {
  cargasRemovidas: number;
  cargasCriadas: number;
  destinosCriados: number;
  cargasPuladas: number;
  areasCriadas: number;
  setoresCriados: number;
  etapasCriadas: number;
  fornecedoresCriados: number;
};

export async function commitarImportacaoConcreto(params: {
  organizacaoId: string;
  userId?: string;
  userNome?: string;
  cargas: CargaImportada[];
  mapeamentoTracos: MapeamentoTracos; // chave: normalizarTexto(tracoNome)
  tracosCatalogo: TracoCatalogo[];
}): Promise<ResumoImportacaoConcreto> {
  const { organizacaoId, userId, userNome, cargas, mapeamentoTracos, tracosCatalogo } = params;

  const tracoPorId = new Map(tracosCatalogo.map((t) => [t.id, t]));
  const resolvedorAreas = new ResolvedorDeAreasConcreto();
  const resolvedorEtapas = new ResolvedorDeEtapas();
  const resolvedorFornecedores = new ResolvedorDeFornecedores();

  type CargaRow = Record<string, unknown>;
  type DestinoRow = Record<string, unknown>;
  const cargaRows: CargaRow[] = [];
  const destinoRows: DestinoRow[] = [];
  let cargasPuladas = 0;

  for (const carga of cargas) {
    const resolucaoTraco = mapeamentoTracos.get(normalizarTexto(carga.tracoNome));
    const traco = resolucaoTraco?.tipo === "match" ? tracoPorId.get(resolucaoTraco.tracoId) : undefined;
    if (!traco) {
      cargasPuladas++;
      continue;
    }

    const destinosResolvidos: DestinoRow[] = [];
    for (const destino of carga.destinos) {
      if (!destino.projetoRaw.trim()) continue;
      const { areaConcretoId, setorConcretoId } = await resolvedorAreas.resolverOuCriar(organizacaoId, destino.projetoRaw);

      let etapaConcretoId: string | null = null;
      if (destino.etapaNorm) {
        etapaConcretoId = await resolvedorEtapas.resolverOuCriar(organizacaoId, destino.etapaNorm);
      }

      destinosResolvidos.push({
        id: crypto.randomUUID(),
        organizacao_id: organizacaoId,
        carga_id: "", // preenchido abaixo, depois que o id da carga é gerado
        setor_concreto_id: setorConcretoId,
        area_concreto_id: areaConcretoId,
        etapa_concreto_id: etapaConcretoId,
        quantidade_m3_aplicada: destino.quantidadeM3Aplicada,
        observacao: destino.observacao || null,
      });
    }

    if (destinosResolvidos.length === 0) {
      cargasPuladas++;
      continue;
    }

    const fornecedorId = await resolvedorFornecedores.resolverOuCriar(organizacaoId, carga.fornecedorNome, carga.tipoOrigem);

    // PREÇO TOTAL do arquivo só existe pra carga externa (própria não tem
    // preço) — preço unitário é derivado dele pra alimentar computeCarga, que
    // recalcula preco_total exatamente igual (quantidade_m3 * preco_unitario).
    const precoUnitario =
      carga.tipoOrigem === "externa" && carga.precoTotal != null && carga.quantidadeM3 > 0
        ? carga.precoTotal / carga.quantidadeM3
        : null;

    const computed = computeCarga({
      data: carga.data,
      tipo_origem: carga.tipoOrigem,
      traco: {
        consumo_cimento_kg_m3: traco.consumo_cimento_kg_m3,
        consumo_brita00_kg_m3: traco.consumo_brita00_kg_m3,
        consumo_brita01_kg_m3: traco.consumo_brita01_kg_m3,
        consumo_po_brita_kg_m3: traco.consumo_po_brita_kg_m3,
        consumo_areia_kg_m3: traco.consumo_areia_kg_m3,
      },
      quantidade_m3: carga.quantidadeM3,
      peso_balanca_kg: carga.pesoBalancaKg,
      preco_unitario: precoUnitario,
    });

    const cargaId = crypto.randomUUID();
    for (const d of destinosResolvidos) d.carga_id = cargaId;
    destinoRows.push(...destinosResolvidos);

    cargaRows.push({
      id: cargaId,
      organizacao_id: organizacaoId,
      ...(carga.codigoRastreabilidade ? { codigo_rastreabilidade: carga.codigoRastreabilidade } : {}),
      data: carga.data,
      fornecedor_id: fornecedorId,
      tipo_origem: carga.tipoOrigem,
      numero_carga: carga.numeroCarga,
      traco_id: traco.id,
      quantidade_m3: carga.quantidadeM3,
      peso_bruto_teorico_kg: computed.peso_bruto_teorico_kg,
      peso_balanca_kg: computed.peso_balanca_kg,
      perda_kg: computed.perda_kg,
      perda_pct: computed.perda_pct,
      preco_unitario: computed.preco_unitario,
      preco_total: computed.preco_total,
      validado: carga.validado,
      validado_em: carga.validado ? new Date().toISOString() : null,
      criado_por: userId ?? null,
      criado_por_nome: carga.lancadoPorNome || userNome || "Importação",
      ano_mes: computed.ano_mes,
      ano_semana: computed.ano_semana,
    });
  }

  // Só apaga o que já existe se realmente houver algo novo pra colocar no lugar —
  // um arquivo que resultou em 0 cargas válidas (ex.: todo traço não resolvido)
  // não deve zerar a organização à toa.
  const cargasRemovidas = cargaRows.length > 0 ? await apagarLancamentosExistentes(organizacaoId) : 0;

  for (let i = 0; i < cargaRows.length; i += TAMANHO_LOTE) {
    const lote = cargaRows.slice(i, i + TAMANHO_LOTE);
    const { error } = await supabase.from("cargas_concreto").insert(lote);
    if (error) throw new Error(`Falha ao gravar cargas (lote ${i}): ${error.message}`);
  }
  for (let i = 0; i < destinoRows.length; i += TAMANHO_LOTE) {
    const lote = destinoRows.slice(i, i + TAMANHO_LOTE);
    const { error } = await supabase.from("destinos_carga").insert(lote);
    if (error) throw new Error(`Falha ao gravar destinos (lote ${i}): ${error.message}`);
  }

  return {
    cargasRemovidas,
    cargasCriadas: cargaRows.length,
    destinosCriados: destinoRows.length,
    cargasPuladas,
    areasCriadas: resolvedorAreas.areasCriadas,
    setoresCriados: resolvedorAreas.setoresCriados,
    etapasCriadas: resolvedorEtapas.criadas,
    fornecedoresCriados: resolvedorFornecedores.criados,
  };
}
