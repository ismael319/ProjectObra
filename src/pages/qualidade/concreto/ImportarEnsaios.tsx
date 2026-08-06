import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { lerArquivoComoLinhas } from "@/lib/administracao/parse-shared";
import { parseEnsaiosConcreto, type EnsaioImportado, type Problema } from "./lib/importer-ensaios";
import { importarEnsaiosConcreto, type ResumoImportacaoEnsaios } from "./lib/importer-ensaios-db";

type Estagio = "idle" | "processando" | "revisao" | "importando" | "concluido";

// Importação em lote de resultados de ensaio — cada linha do arquivo é UM
// corpo de prova rompido. Diferente da importação de cargas (Dados >
// Importar histórico), esta é ADITIVA: não apaga nada, só resolve cada linha
// contra a carga já existente (Nº Carga/Nota Fiscal + Data de Moldagem) e
// grava (ou completa) o corpo de prova e o resultado.
export default function ImportarEnsaiosConcreto() {
  const { user, userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
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
    if (!file || !organizacaoId) return;
    setFileName(file.name);
    setErro("");
    setEstagio("processando");

    try {
      const linhas = await lerArquivoComoLinhas(file);
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
    if (!organizacaoId || itens.length === 0) return;
    setEstagio("importando");
    setErro("");
    try {
      const r = await importarEnsaiosConcreto({ organizacaoId, userId: user?.id, itens });
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
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <Link to="/dashboard/qualidade/concreto/ensaios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Ensaios / Rastreabilidade
        </Link>
        <h1 className="text-2xl font-bold mt-1">Importar resultados de ensaio</h1>
        <p className="text-sm text-muted-foreground">
          Envie a planilha do laboratório com uma linha por corpo de prova (Nº CARGA ou NOTA FISCAL, DATA MOLDAGEM,
          LABORATÓRIO, Nº CP, PEÇA CONCRETADA, IDADE, DATA RUPTURA, FCJ, TIPO DE RUPTURA...). Cada linha é casada
          contra a carga já lançada pela identificação + data de moldagem — o laboratório precisa já estar
          cadastrado em Cadastro &gt; Laboratórios.
        </p>
      </div>

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
            accept=".xlsx,.xls,.csv"
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
              <><FileSpreadsheet size={18} className="text-blue-500" /> {fileName}</>
            ) : (
              <><Upload size={18} /> Selecionar arquivo XLSX ou CSV</>
            )}
          </button>

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
