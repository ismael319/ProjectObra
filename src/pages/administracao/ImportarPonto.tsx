import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileSpreadsheet, Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { lerArquivoComoLinhas } from "@/lib/administracao/parse-shared";
import { parsePonto, type ResultadoParsePonto } from "@/lib/administracao/parse-ponto";
import { importarPonto, type ResumoImportacaoPonto } from "@/lib/administracao/db";

type Estagio = "idle" | "processando" | "pronto" | "importando" | "concluido";

export default function ImportarPontoPage() {
  const { user, userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;

  const [estagio, setEstagio] = useState<Estagio>("idle");
  const [fileName, setFileName] = useState("");
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<ResultadoParsePonto | null>(null);
  const [resumo, setResumo] = useState<ResumoImportacaoPonto | null>(null);
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
      const r = parsePonto(linhas);
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
    if (!resultado || !organizacaoId || !projetoId) return;
    setEstagio("importando");
    try {
      const r = await importarPonto({ organizacaoId, projetoId, userId: user?.id, arquivoNome: fileName, linhas: resultado.linhas });
      setResumo(r);
      setEstagio("concluido");
      toast.success(`${r.totalLinhas} registro(s) de ponto importado(s).`);
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

  // Erro bloqueante (ex.: coluna Matrícula ausente) — o parser devolve
  // `linhas: []` e um único problema sem número de linha (linha 0) nesse caso.
  const erroBloqueante = resultado && resultado.linhas.length === 0 && resultado.problemas.length > 0
    ? resultado.problemas[0]!.descricao
    : null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <Link to="/dashboard/administracao" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Administração
        </Link>
        <h1 className="text-2xl font-bold mt-1">Importar Ponto Diário</h1>
        <p className="text-sm text-muted-foreground">Envie o relatório "Ponto Diário" exportado do Secullum (com a coluna Matrícula habilitada), pra reconciliar com o Apontamento de Campo.</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {!projetoId && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-amber-700 dark:text-amber-300 text-sm">
              Selecione uma obra em "Meus Projetos" antes de importar — o ponto só reconcilia com funcionários da obra atual.
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

          {erroBloqueante && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{erroBloqueante}</span>
            </div>
          )}

          {resultado && resultado.linhas.length > 0 && estagio !== "processando" && estagio !== "concluido" && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-sm space-y-3">
              <p className="font-medium text-gray-900 dark:text-white">
                {resultado.linhas.length} registro(s) de ponto encontrados
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
                <li>{resumo.totalLinhas} registro(s) em {resumo.diasDistintos} dia(s)</li>
                <li>{resumo.matriculasEncontradas} matrícula(s) casadas com o cadastro</li>
                {resumo.matriculasNaoEncontradas > 0 && (
                  <li className="text-amber-700 dark:text-amber-400">{resumo.matriculasNaoEncontradas} matrícula(s) não encontradas no cadastro</li>
                )}
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
            onClick={handleConfirmar}
            disabled={!resultado || !projetoId || resultado.linhas.length === 0 || estagio === "importando" || estagio === "processando"}
          >
            {estagio === "importando" ? "Importando..." : "Confirmar importação"}
          </Button>
        )}
      </div>
    </div>
  );
}
