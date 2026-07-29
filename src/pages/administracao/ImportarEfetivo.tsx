import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileSpreadsheet, Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { lerArquivoComoLinhas } from "@/lib/administracao/parse-shared";
import { parseEfetivo, type ResultadoParseEfetivo } from "@/lib/administracao/parse-efetivo";
import { importarEfetivo, type ResumoImportacaoEfetivo } from "@/lib/administracao/db";

type Estagio = "idle" | "processando" | "pronto" | "importando" | "concluido";

export default function ImportarEfetivoPage() {
  const { user, userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const [estagio, setEstagio] = useState<Estagio>("idle");
  const [fileName, setFileName] = useState("");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoParseEfetivo | null>(null);
  const [resumo, setResumo] = useState<ResumoImportacaoEfetivo | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErro("");
    setResultado(null);
    setResumo(null);
    setEstagio("processando");

    try {
      const linhas = await lerArquivoComoLinhas(file);
      const r = parseEfetivo(linhas);
      setResultado(r);
      setEstagio("pronto");
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setEstagio("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleConfirmar() {
    if (!resultado || !organizacaoId) return;
    setEstagio("importando");
    try {
      const r = await importarEfetivo({ organizacaoId, userId: user?.id, linhas: resultado.linhas });
      setResumo(r);
      setEstagio("concluido");
      toast.success(`${r.totalLinhas} funcionário(s) importado(s).`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : String(err));
      setEstagio("pronto");
    }
  }

  function reiniciar() {
    setEstagio("idle");
    setFileName("");
    setErro("");
    setResultado(null);
    setResumo(null);
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <Link to="/dashboard/administracao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Administração
        </Link>
        <h1 className="text-2xl font-bold mt-1">Importar Controle de Efetivo</h1>
        <p className="text-sm text-muted-foreground">Envie a planilha de cadastro mestre (XLSX ou CSV). Reimportar atualiza quem já existe pela matrícula, sem duplicar.</p>
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
            disabled={estagio === "processando" || estagio === "importando"}
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

          {resultado && estagio !== "processando" && estagio !== "concluido" && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm space-y-3">
              <p className="font-medium text-gray-900 dark:text-white">
                {resultado.linhas.length} funcionário(s) prontos pra importar
                {resultado.problemas.length > 0 && ` · ${resultado.problemas.length} aviso(s)`}
              </p>
              {resultado.problemas.length > 0 && (
                <div className="max-h-64 overflow-y-auto space-y-1.5">
                  {resultado.problemas.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>Linha {p.linha}{p.campo ? ` (${p.campo})` : ""}: {p.descricao}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {resumo && estagio === "concluido" && (
            <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-4 text-sm space-y-2">
              <p className="flex items-center gap-2 font-medium text-green-800 dark:text-green-300">
                <CheckCircle2 size={16} /> Importação concluída
              </p>
              <ul className="text-green-700 dark:text-green-400 space-y-0.5">
                <li>{resumo.novos} funcionário(s) novo(s)</li>
                <li>{resumo.atualizados} funcionário(s) atualizado(s)</li>
                <li>{resumo.documentosGravados} documento(s) de vencimento gravado(s)</li>
                {resumo.catalogosCriados.length > 0 && (
                  <li>{resumo.catalogosCriados.length} valor(es) novo(s) criado(s) em Cargo/Setor/Encarregado/Grupo</li>
                )}
              </ul>
              {resumo.documentosSemTipoConhecido.length > 0 && (
                <div className="pt-2 border-t border-green-200 dark:border-green-800 text-amber-700 dark:text-amber-400 space-y-0.5">
                  {resumo.documentosSemTipoConhecido.map((d, i) => <p key={i}>{d}</p>)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {estagio === "concluido" ? (
          <Button onClick={reiniciar}>Importar outro arquivo</Button>
        ) : (
          <Button
            onClick={handleConfirmar}
            disabled={!resultado || resultado.linhas.length === 0 || estagio === "importando" || estagio === "processando"}
          >
            {estagio === "importando" ? "Importando..." : "Confirmar importação"}
          </Button>
        )}
      </div>
    </div>
  );
}
