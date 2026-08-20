import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lerArquivoComoLinhas } from "@/lib/administracao/parse-shared";
import { parseEnsaiosConcreto, type EnsaioImportado, type Problema } from "./lib/importer-ensaios";
import { importarEnsaiosConcreto, type ResumoImportacaoEnsaios } from "./lib/importer-ensaios-db";
import { extrairTabelaPdfEstrutec } from "./lib/pdf-ensaios-estrutec";
import { listarTodosEnsaiosConcreto, buildEnsaiosConcretoWorkbook, downloadEnsaiosConcretoWorkbook } from "./lib/excel-export";

type Estagio = "idle" | "processando" | "revisao" | "importando" | "concluido";

// Hub de ensaios de concreto: importação de resultados de laboratório e
// exportação do banco completo de ensaios — as duas pontas de entrada/saída
// de dados em massa do módulo de rastreabilidade.
export default function ImportarEnsaiosConcreto() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link to="/dashboard/qualidade/concreto/ensaios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Ensaios / Rastreabilidade
        </Link>
        <h1 className="text-2xl font-bold mt-1">Ensaios</h1>
        <p className="text-sm text-muted-foreground">Importação de resultados de ensaio e exportação do banco completo de ensaios.</p>
      </div>

      <Tabs defaultValue="importar" className="space-y-4">
        <TabsList>
          <TabsTrigger value="importar">Importar</TabsTrigger>
          <TabsTrigger value="exportar">Exportar</TabsTrigger>
        </TabsList>
        <TabsContent value="importar">
          <ImportarEnsaiosTab />
        </TabsContent>
        <TabsContent value="exportar">
          <ExportarEnsaios />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ExportarEnsaios() {
  const { userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;
  const [exportando, setExportando] = useState(false);

  async function handleExportar() {
    if (!organizacaoId || !projetoId) return;
    setExportando(true);
    try {
      const rows = await listarTodosEnsaiosConcreto(organizacaoId, projetoId);
      if (rows.length === 0) {
        toast.warning("Nenhum ensaio no banco pra exportar.");
        return;
      }
      const wb = await buildEnsaiosConcretoWorkbook(rows);
      await downloadEnsaiosConcretoWorkbook(wb);
      toast.success(`${rows.length} ensaio(s) exportado(s)`);
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
          Baixa em Excel TODOS os resultados de ensaio da organização, no mesmo formato aceito pelo importador (uma linha por corpo de prova).
        </p>
        <Button onClick={handleExportar} disabled={exportando || !organizacaoId || !projetoId}>
          {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar ensaios
        </Button>
      </CardContent>
    </Card>
  );
}

function ImportarEnsaiosTab() {
  const { user, userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;
  const qc = useQueryClient();

  const [estagio, setEstagio] = useState<Estagio>("idle");
  const [fileName, setFileName] = useState("");
  const [erro, setErro] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [itens, setItens] = useState<EnsaioImportado[]>([]);
  const [problemasParse, setProblemasParse] = useState<Problema[]>([]);
  const [resumo, setResumo] = useState<ResumoImportacaoEnsaios | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !organizacaoId || !projetoId) return;
    setFileName(file.name);
    setErro("");
    setEstagio("processando");

    try {
      const ehPdf = file.name.toLowerCase().endsWith(".pdf");
      const linhas = ehPdf ? (await extrairTabelaPdfEstrutec(file)).linhas : await lerArquivoComoLinhas(file);
      const parse = parseEnsaiosConcreto(linhas);
      setItens(parse.itens);
      setProblemasParse(parse.problemas);
      setEstagio("revisao");
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setEstagio("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleConfirmar() {
    if (!organizacaoId || !projetoId || itens.length === 0) return;
    setEstagio("importando");
    setErro("");
    try {
      const r = await importarEnsaiosConcreto({ organizacaoId, projetoId, userId: user?.id, itens });
      qc.invalidateQueries({ queryKey: ["vw_ensaios_concreto"] });
      qc.invalidateQueries({ queryKey: ["vw_rastreabilidade_concreto"] });
      setResumo(r);
      setEstagio("concluido");
      toast.success(`${r.ensaiosGravados} ensaio(s) importado(s).`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setEstagio("revisao");
    }
  }

  function reiniciar() {
    setEstagio("idle");
    setFileName("");
    setErro("");
    setItens([]);
    setProblemasParse([]);
    setResumo(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Envie a planilha do laboratório (uma linha por corpo de prova: Nº CARGA ou NOTA FISCAL, DATA MOLDAGEM,
        LABORATÓRIO, Nº CP, PEÇA CONCRETADA, IDADE, DATA RUPTURA, FCJ, TIPO DE RUPTURA...) — ou o PDF do relatório de
        ensaio da Estrutec direto, sem precisar converter pra planilha. Cada linha é casada contra a carga já
        lançada pela identificação + data de moldagem. Revise a prévia antes de confirmar, principalmente num PDF —
        a leitura da tabela é automática e pode errar em relatórios com layout fora do padrão.
      </p>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {erro && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-300 text-sm">
              {erro}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            onChange={handleFile}
            className="hidden"
            disabled={estagio === "processando" || estagio === "importando"}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={estagio === "processando" || estagio === "importando" || estagio === "revisao" || estagio === "concluido"}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition disabled:cursor-not-allowed"
          >
            {estagio === "processando" ? (
              <><Loader2 size={18} className="animate-spin" /> Processando {fileName}...</>
            ) : fileName ? (
              fileName.toLowerCase().endsWith(".pdf") ? (
                <><FileText size={18} className="text-red-500" /> {fileName}</>
              ) : (
                <><FileSpreadsheet size={18} className="text-blue-500" /> {fileName}</>
              )
            ) : (
              <><Upload size={18} /> Selecionar planilha (XLSX/CSV) ou PDF do relatório</>
            )}
          </button>

          {(estagio === "revisao" || estagio === "importando") && itens.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Carga/NF</TableHead>
                    <TableHead>Laboratório</TableHead>
                    <TableHead>Nº CP</TableHead>
                    <TableHead>Peça concretada</TableHead>
                    <TableHead>Moldagem</TableHead>
                    <TableHead>Ruptura</TableHead>
                    <TableHead className="text-right">Idade</TableHead>
                    <TableHead className="text-right">Fcj (MPa)</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-nowrap">{item.identificacaoCarga}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.laboratorioNome ?? "—"}</TableCell>
                      <TableCell>{item.numeroLab ?? "—"}</TableCell>
                      <TableCell className="max-w-[160px] truncate" title={item.pecaConcretada ?? undefined}>{item.pecaConcretada ?? "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.dataMoldagem}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.dataRupturaReal}</TableCell>
                      <TableCell className="text-right">{item.idadePrevistaDias}</TableCell>
                      <TableCell className="text-right">{item.resultadoMpa}</TableCell>
                      <TableCell>{item.tipoRuptura ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {(estagio === "revisao" || estagio === "importando") && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm space-y-3">
              <p className="font-medium text-gray-900 dark:text-white">{itens.length} resultado(s) prontos pra importar</p>
              {problemasParse.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-amber-700 dark:text-amber-400 font-medium">
                    {problemasParse.length} linha(s) com problema de formato (serão ignoradas)
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

          {resumo && estagio === "concluido" && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 text-sm space-y-2">
              <p className="flex items-center gap-2 font-medium text-green-800 dark:text-green-300">
                <CheckCircle2 size={16} /> Importação concluída
              </p>
              <ul className="text-green-700 dark:text-green-400 space-y-0.5">
                <li>{resumo.ensaiosGravados} ensaio(s) gravado(s)</li>
                {resumo.corposProvaCriados > 0 && <li>{resumo.corposProvaCriados} corpo(s) de prova criado(s) na hora (não tinham sido moldados pelo Lançamento)</li>}
              </ul>
              {resumo.problemas.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-red-700 dark:text-red-400 font-medium">
                    {resumo.problemas.length} linha(s) não importada(s) — carga ou laboratório não encontrado
                  </summary>
                  <div className="max-h-48 overflow-y-auto mt-2 space-y-1">
                    {resumo.problemas.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 text-red-700 dark:text-red-400">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>Linha {p.linha}: {p.descricao}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {estagio === "concluido" ? (
          <Button onClick={reiniciar}>Importar outro arquivo</Button>
        ) : (
          <>
            {estagio !== "idle" && (
              <Button variant="ghost" onClick={reiniciar} disabled={estagio === "importando"}>Cancelar</Button>
            )}
            {estagio === "revisao" && (
              <Button onClick={handleConfirmar} disabled={itens.length === 0}>
                Confirmar importação de {itens.length} resultado(s)
              </Button>
            )}
            {estagio === "importando" && (
              <Button disabled><Loader2 className="h-4 w-4 animate-spin" /> Importando...</Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
