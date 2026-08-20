import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, FileSpreadsheet, Loader2, Upload, AlertTriangle, CheckCircle2, Ban } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lerArquivoComoLinhasEBruto, normalizarTexto } from "@/lib/administracao/parse-shared";
import {
  parseCargasConcreto,
  distintosComContagem,
  type CargaImportada,
  type Problema,
} from "./lib/importer";
import {
  carregarTracos,
  sugerirMapeamentoTracos,
  commitarImportacaoConcreto,
  type TracoCatalogo,
  type MapeamentoTracos,
  type ResolucaoTraco,
  type ResumoImportacaoConcreto,
} from "./lib/importer-db";
import { listarTodasCargasConcreto, buildCargasConcretoWorkbook, downloadCargasConcretoWorkbook } from "./lib/excel-export";

type Estagio = "idle" | "processando" | "revisao" | "importando" | "concluido";

type LinhaRevisaoTracoItem = { tracoNome: string; total: number; resolucao: ResolucaoTraco | null };

// Hub de dados do Concreto: importação de cargas em massa e exportação do
// banco completo de lançamentos — as duas pontas de entrada/saída de dados em
// massa do módulo, reunidas numa única tela. O arquivo importado segue
// exatamente o mesmo formato de colunas do exportado (excel-export.ts).
export default function DadosConcreto() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link to="/dashboard/qualidade/concreto/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Concreto
        </Link>
        <h1 className="text-2xl font-bold mt-1">Dados</h1>
        <p className="text-sm text-muted-foreground">Importação do histórico de concreto e exportação do banco completo de lançamentos.</p>
      </div>

      <Tabs defaultValue="importar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="importar">Importar histórico</TabsTrigger>
          <TabsTrigger value="exportar">Exportar</TabsTrigger>
        </TabsList>
        <TabsContent value="importar">
          <ImportarHistoricoConcreto />
        </TabsContent>
        <TabsContent value="exportar">
          <ExportarConcreto />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExportarConcreto() {
  const { userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;
  const [exportando, setExportando] = useState(false);

  async function handleExportar() {
    if (!organizacaoId || !projetoId) return;
    setExportando(true);
    try {
      const rows = await listarTodasCargasConcreto(organizacaoId, projetoId);
      if (rows.length === 0) {
        toast.warning("Nenhum lançamento no banco pra exportar.");
        return;
      }
      const wb = await buildCargasConcretoWorkbook(rows);
      await downloadCargasConcretoWorkbook(wb);
      toast.success(`${rows.length} lançamento(s) exportado(s)`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setExportando(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Baixa em Excel TODOS os lançamentos de concreto da organização, sem filtro de data nem paginação de tela.
        </p>
        <Button onClick={handleExportar} disabled={exportando || !organizacaoId || !projetoId}>
          {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar tudo
        </Button>
      </CardContent>
    </Card>
  );
}

function ImportarHistoricoConcreto() {
  const { user, userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;
  const qc = useQueryClient();

  const [estagio, setEstagio] = useState<Estagio>("idle");
  const [fileName, setFileName] = useState("");
  const [erro, setErro] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [cargas, setCargas] = useState<CargaImportada[]>([]);
  const [problemasParse, setProblemasParse] = useState<Problema[]>([]);
  const [totalLinhasArquivo, setTotalLinhasArquivo] = useState(0);

  const [tracos, setTracos] = useState<TracoCatalogo[]>([]);
  const [mapeamentoTracosBase, setMapeamentoTracosBase] = useState<MapeamentoTracos>(new Map());
  const [revisaoTracos, setRevisaoTracos] = useState<LinhaRevisaoTracoItem[]>([]);

  const [resumo, setResumo] = useState<ResumoImportacaoConcreto | null>(null);

  const totalDestinos = useMemo(() => cargas.reduce((s, c) => s + c.destinos.length, 0), [cargas]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !organizacaoId || !projetoId) return;
    setFileName(file.name);
    setErro("");
    setEstagio("processando");

    try {
      const { linhas: linhasArquivo, brutas: linhasBrutas } = await lerArquivoComoLinhasEBruto(file);
      const parse = parseCargasConcreto(linhasArquivo, linhasBrutas);

      const tracosDistintos = distintosComContagem(parse.cargas.map((c) => c.tracoNome));
      const tracosCarregados = await carregarTracos(organizacaoId, projetoId);
      const { sugestao: sugestaoTracos, semCorrespondencia: tracosSemCorrespondencia } = sugerirMapeamentoTracos(
        tracosDistintos.map((t) => t.valor).filter((v): v is string => v != null),
        tracosCarregados
      );

      setCargas(parse.cargas);
      setProblemasParse(parse.problemas);
      setTotalLinhasArquivo(parse.totalLinhasArquivo);
      setTracos(tracosCarregados);
      setMapeamentoTracosBase(sugestaoTracos);
      setRevisaoTracos(
        tracosSemCorrespondencia
          .map((tracoNome) => ({
            tracoNome,
            total: tracosDistintos.find((t) => t.valor === tracoNome)?.total ?? 0,
            resolucao: null as ResolucaoTraco | null,
          }))
          .sort((a, b) => b.total - a.total)
      );
      setEstagio("revisao");
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setEstagio("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setResolucaoTraco(tracoNome: string, resolucao: ResolucaoTraco) {
    setRevisaoTracos((prev) => prev.map((r) => (r.tracoNome === tracoNome ? { ...r, resolucao } : r)));
  }

  const faltaResolver = revisaoTracos.filter((r) => !r.resolucao).length;

  async function handleConfirmar() {
    if (!organizacaoId || !projetoId || faltaResolver > 0) return;
    setEstagio("importando");
    setErro("");
    try {
      const mapeamentoTracosFinal: MapeamentoTracos = new Map(mapeamentoTracosBase);
      for (const r of revisaoTracos) {
        if (r.resolucao) mapeamentoTracosFinal.set(normalizarTexto(r.tracoNome), r.resolucao);
      }

      const r = await commitarImportacaoConcreto({
        organizacaoId,
        projetoId,
        userId: user?.id,
        userNome: user?.email ?? "Importação",
        cargas,
        mapeamentoTracos: mapeamentoTracosFinal,
        tracosCatalogo: tracos,
      });

      qc.invalidateQueries({ queryKey: ["cargas-concreto"] });
      qc.invalidateQueries({ queryKey: ["fornecedores_concreto"] });
      qc.invalidateQueries({ queryKey: ["tracos_concreto"] });
      qc.invalidateQueries({ queryKey: ["etapas_concreto"] });
      qc.invalidateQueries({ queryKey: ["areas_concreto"] });
      qc.invalidateQueries({ queryKey: ["setores_concreto"] });

      setResumo(r);
      setEstagio("concluido");
      toast.success(`${r.cargasCriadas} carga(s) importada(s).`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setEstagio("revisao");
    }
  }

  function reiniciar() {
    setEstagio("idle");
    setFileName("");
    setErro("");
    setCargas([]);
    setProblemasParse([]);
    setRevisaoTracos([]);
    setResumo(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Envie um arquivo XLSX ou CSV com as mesmas colunas do "Exportar" (DATA, FORNECEDOR, ORIGEM, TRAÇO, QTD (m³), PROJETO, ETAPA...). Cada linha é uma carga inteira — uma carga com mais de um destino junta Projeto/Etapa/Observações com ";" na mesma célula. Fornecedor, Setor/Área do Concreto (Projeto) e Etapa são criados automaticamente com o nome do arquivo quando não existem — só Traço precisa já estar cadastrado.
      </p>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {!projetoId && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-amber-700 dark:text-amber-300 text-sm">
              Selecione uma obra em "Meus Projetos" antes de importar — os lançamentos importados ficam vinculados à obra atual, e só os desta obra são apagados/substituídos.
            </div>
          )}
          {erro && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {erro}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            className="hidden"
            disabled={estagio === "processando" || estagio === "importando" || !projetoId}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={estagio === "processando" || estagio === "importando" || estagio === "revisao" || estagio === "concluido" || !projetoId}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition disabled:cursor-not-allowed"
          >
            {estagio === "processando" ? (
              <><Loader2 size={18} className="animate-spin" /> Processando {fileName}...</>
            ) : fileName ? (
              <><FileSpreadsheet size={18} className="text-blue-500" /> {fileName}</>
            ) : (
              <><Upload size={18} /> Selecionar arquivo XLSX ou CSV</>
            )}
          </button>

          {(estagio === "revisao" || estagio === "importando") && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>
                Ao confirmar, <strong>TODOS os lançamentos de concreto já existentes desta obra serão apagados</strong> (inclusive os feitos manualmente) e substituídos pelo conteúdo deste arquivo — obras diferentes não são afetadas. Os cadastros de Fornecedores, Traços, Setores/Áreas do Concreto e Etapas não são apagados.
              </span>
            </div>
          )}

          {(estagio === "revisao" || estagio === "importando") && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm space-y-3">
              <p className="font-medium text-gray-900 dark:text-white">
                {cargas.length} carga(s) prontas ({totalDestinos} destino(s)) de {totalLinhasArquivo} linha(s) no arquivo
              </p>
              {problemasParse.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-amber-700 dark:text-amber-400 font-medium">
                    {problemasParse.length} linha(s) ignorada(s) (coluna obrigatória inválida ou em branco)
                  </summary>
                  <div className="max-h-48 overflow-y-auto mt-2 space-y-1">
                    {problemasParse.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>Linha {p.linha}: {p.descricao}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {estagio === "revisao" && revisaoTracos.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <p className="text-sm font-medium">
                {revisaoTracos.length} valor(es) de "TRAÇO" sem correspondência no cadastro — escolha um traço já cadastrado, ou pule essas cargas.
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {revisaoTracos.map((r) => (
                  <LinhaRevisaoTraco key={r.tracoNome} linha={r} tracos={tracos} onResolve={(res) => setResolucaoTraco(r.tracoNome, res)} />
                ))}
              </div>
            </div>
          )}

          {resumo && estagio === "concluido" && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 text-sm space-y-2">
              <p className="flex items-center gap-2 font-medium text-green-800 dark:text-green-300">
                <CheckCircle2 size={16} /> Importação concluída
              </p>
              <ul className="text-green-700 dark:text-green-400 space-y-0.5">
                {resumo.cargasRemovidas > 0 && <li>{resumo.cargasRemovidas} lançamento(s) anterior(es) removido(s)</li>}
                <li>{resumo.cargasCriadas} carga(s) criada(s)</li>
                <li>{resumo.destinosCriados} destino(s) criado(s)</li>
                {resumo.setoresCriados > 0 && <li>{resumo.setoresCriados} setor(es) novo(s) criado(s)</li>}
                {resumo.areasCriadas > 0 && <li>{resumo.areasCriadas} área(s) nova(s) criada(s)</li>}
                {resumo.etapasCriadas > 0 && <li>{resumo.etapasCriadas} etapa(s) nova(s) criada(s)</li>}
                {resumo.fornecedoresCriados > 0 && <li>{resumo.fornecedoresCriados} fornecedor(es) novo(s) criado(s)</li>}
                {resumo.cargasPuladas > 0 && <li>{resumo.cargasPuladas} carga(s) pulada(s) (traço não resolvido ou sem destino)</li>}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {estagio === "concluido" ? (
          <Button onClick={reiniciar}>Importar outro arquivo</Button>
        ) : (
          <Button
            variant={estagio === "revisao" && faltaResolver === 0 ? "destructive" : "default"}
            onClick={handleConfirmar}
            disabled={estagio !== "revisao" || cargas.length === 0 || faltaResolver > 0}
          >
            {estagio === "importando"
              ? "Importando..."
              : faltaResolver > 0
              ? `Resolva ${faltaResolver} pendência(s)`
              : "Apagar tudo e importar"}
          </Button>
        )}
      </div>
    </div>
  );
}

function LinhaRevisaoTraco({
  linha,
  tracos,
  onResolve,
}: {
  linha: LinhaRevisaoTracoItem;
  tracos: TracoCatalogo[];
  onResolve: (r: ResolucaoTraco) => void;
}) {
  const resolvido = linha.resolucao;
  const rotulo =
    resolvido?.tipo === "match"
      ? `Traço "${tracos.find((t) => t.id === resolvido.tracoId)?.nome ?? "?"}"`
      : resolvido?.tipo === "pular"
      ? "Pulando essas cargas"
      : null;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-medium">{linha.tracoNome || "(vazio)"}</p>
          <p className="text-xs text-muted-foreground">{linha.total} carga(s)</p>
        </div>
        {rotulo && <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">{rotulo}</span>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground w-24">Traço cadastrado:</span>
        <div className="w-72">
          <Combobox
            options={tracos.map((t) => ({ value: t.id, label: `${t.nome} (${t.fck_mpa} MPa)` }))}
            value={resolvido?.tipo === "match" ? resolvido.tracoId : null}
            onChange={(v) => v && onResolve({ tipo: "match", tracoId: v })}
            placeholder="Buscar traço existente"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={() => onResolve({ tipo: "pular" })}>
          <Ban className="h-3.5 w-3.5" /> Pular
        </Button>
      </div>
    </div>
  );
}
