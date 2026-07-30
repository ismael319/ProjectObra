import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, FileSpreadsheet, Loader2, Upload, AlertTriangle, CheckCircle2, Ban } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { lerArquivoComoLinhas, normalizarTexto } from "@/lib/administracao/parse-shared";
import {
  parseBDConcreto,
  agruparEmCargas,
  distintosComContagem,
  type CargaAgrupada,
  type Problema,
} from "./lib/importer";
import {
  carregarSetores,
  carregarAreas,
  sugerirMapeamentoAreas,
  commitarImportacaoConcreto,
  type SetorCatalogo,
  type AreaCatalogo,
  type MapeamentoAreas,
  type ResolucaoArea,
  type ResumoImportacaoConcreto,
} from "./lib/importer-db";

type Estagio = "idle" | "processando" | "revisao" | "importando" | "concluido";

type LinhaRevisao = { projetoRaw: string; total: number; resolucao: ResolucaoArea | null };

export default function ImportarHistoricoConcreto() {
  const { user, userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const [estagio, setEstagio] = useState<Estagio>("idle");
  const [fileName, setFileName] = useState("");
  const [erro, setErro] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [cargas, setCargas] = useState<CargaAgrupada[]>([]);
  const [problemasParse, setProblemasParse] = useState<Problema[]>([]);
  const [problemasGrupo, setProblemasGrupo] = useState<Problema[]>([]);
  const [totalLinhasArquivo, setTotalLinhasArquivo] = useState(0);

  const [setores, setSetores] = useState<SetorCatalogo[]>([]);
  const [areas, setAreas] = useState<AreaCatalogo[]>([]);
  const [mapeamentoBase, setMapeamentoBase] = useState<MapeamentoAreas>(new Map());
  const [revisao, setRevisao] = useState<LinhaRevisao[]>([]);
  const [resumo, setResumo] = useState<ResumoImportacaoConcreto | null>(null);

  const totalDestinos = useMemo(() => cargas.reduce((s, c) => s + c.destinos.length, 0), [cargas]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setErro("");
    setEstagio("processando");

    try {
      const linhasArquivo = await lerArquivoComoLinhas(file);
      const parse = parseBDConcreto(linhasArquivo);
      const { cargas: cargasAgrupadas, problemas: problemasAgrupamento } = agruparEmCargas(parse.linhas);

      const projetosDistintos = distintosComContagem(cargasAgrupadas.flatMap((c) => c.destinos.map((d) => d.projetoRaw)));
      const [setoresCarregados, areasCarregadas] = await Promise.all([carregarSetores(), carregarAreas()]);
      const { sugestao, semCorrespondencia } = sugerirMapeamentoAreas(
        projetosDistintos.map((p) => p.valor).filter((v): v is string => v != null),
        areasCarregadas
      );

      setCargas(cargasAgrupadas);
      setProblemasParse(parse.problemas);
      setProblemasGrupo(problemasAgrupamento);
      setTotalLinhasArquivo(parse.totalLinhasArquivo);
      setSetores(setoresCarregados);
      setAreas(areasCarregadas);
      setMapeamentoBase(sugestao);
      setRevisao(
        semCorrespondencia
          .map((projetoRaw) => ({
            projetoRaw,
            total: projetosDistintos.find((p) => p.valor === projetoRaw)?.total ?? 0,
            resolucao: null as ResolucaoArea | null,
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

  function setResolucao(projetoRaw: string, resolucao: ResolucaoArea) {
    setRevisao((prev) => prev.map((r) => (r.projetoRaw === projetoRaw ? { ...r, resolucao } : r)));
  }

  const faltaResolver = revisao.filter((r) => !r.resolucao).length;

  async function handleConfirmar() {
    if (!organizacaoId || faltaResolver > 0) return;
    setEstagio("importando");
    setErro("");
    try {
      const mapeamentoFinal: MapeamentoAreas = new Map(mapeamentoBase);
      for (const r of revisao) {
        if (r.resolucao) mapeamentoFinal.set(normalizarTexto(r.projetoRaw), r.resolucao);
      }

      const r = await commitarImportacaoConcreto({
        organizacaoId,
        userId: user?.id,
        userNome: user?.email ?? "Importação histórica",
        cargas,
        mapeamentoAreas: mapeamentoFinal,
      });
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
    setProblemasGrupo([]);
    setRevisao([]);
    setResumo(null);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <Link to="/dashboard/qualidade/concreto/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Concreto
        </Link>
        <h1 className="text-2xl font-bold mt-1">Importar histórico de concreto</h1>
        <p className="text-sm text-muted-foreground">
          Envie a planilha BDConcreto (XLSX ou CSV). Importação única — cada linha vira uma carga (ou parte de uma carga dividida entre destinos).
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
              <p className="font-medium text-gray-900 dark:text-white">
                {cargas.length} carga(s) prontas ({totalDestinos} destino(s)) de {totalLinhasArquivo} linha(s) no arquivo
              </p>
              {problemasParse.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-amber-700 dark:text-amber-400 font-medium">
                    {problemasParse.length} linha(s) ignorada(s) (usina/traço/data não reconhecidos)
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
              {problemasGrupo.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-amber-700 dark:text-amber-400 font-medium">
                    {problemasGrupo.length} carga(s) com divergência interna (importadas mesmo assim — revisar depois)
                  </summary>
                  <div className="max-h-48 overflow-y-auto mt-2 space-y-1">
                    {problemasGrupo.map((p, i) => (
                      <div key={i} className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>{p.descricao}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}

          {estagio === "revisao" && revisao.length > 0 && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <p className="text-sm font-medium">
                {revisao.length} valor(es) de "PROJETO" sem Área correspondente — escolha uma Área existente (em qualquer Setor), crie uma nova, ou pule essas linhas.
              </p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {revisao.map((r) => (
                  <LinhaRevisaoArea key={r.projetoRaw} linha={r} setores={setores} areas={areas} onResolve={(res) => setResolucao(r.projetoRaw, res)} />
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
                <li>{resumo.cargasCriadas} carga(s) criada(s)</li>
                <li>{resumo.destinosCriados} destino(s) criado(s)</li>
                {resumo.areasCriadas > 0 && <li>{resumo.areasCriadas} área(s) nova(s) criada(s)</li>}
                {resumo.etapasCriadas > 0 && <li>{resumo.etapasCriadas} etapa(s) nova(s) criada(s)</li>}
                {resumo.cargasPuladas > 0 && <li>{resumo.cargasPuladas} carga(s) pulada(s) (área "pular" ou traço não resolvido)</li>}
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
            disabled={estagio !== "revisao" || cargas.length === 0 || faltaResolver > 0}
          >
            {estagio === "importando"
              ? "Importando..."
              : faltaResolver > 0
              ? `Resolva ${faltaResolver} área(s) pendente(s)`
              : "Confirmar importação"}
          </Button>
        )}
      </div>
    </div>
  );
}

function LinhaRevisaoArea({
  linha,
  setores,
  areas,
  onResolve,
}: {
  linha: LinhaRevisao;
  setores: SetorCatalogo[];
  areas: AreaCatalogo[];
  onResolve: (r: ResolucaoArea) => void;
}) {
  const [novoNome, setNovoNome] = useState(linha.projetoRaw);
  const [setorNovo, setSetorNovo] = useState<string | null>(null);

  const resolvido = linha.resolucao;
  const rotulo =
    resolvido?.tipo === "match"
      ? `Área "${areas.find((a) => a.id === resolvido.areaId)?.nome ?? "?"}" (${areas.find((a) => a.id === resolvido.areaId)?.setorNome ?? "?"})`
      : resolvido?.tipo === "criar"
      ? `Nova área "${resolvido.nome}" em "${setores.find((s) => s.id === resolvido.setorId)?.nome ?? "?"}"`
      : resolvido?.tipo === "pular"
      ? "Pulando essas linhas"
      : null;

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-medium">{linha.projetoRaw || "(vazio)"}</p>
          <p className="text-xs text-muted-foreground">{linha.total} linha(s)</p>
        </div>
        {rotulo && <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5">{rotulo}</span>}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground w-24">Área existente:</span>
        <div className="w-72">
          <Combobox
            options={areas.map((a) => ({ value: a.id, label: `${a.nome} (${a.setorNome})` }))}
            value={resolvido?.tipo === "match" ? resolvido.areaId : null}
            onChange={(v) => {
              const area = areas.find((a) => a.id === v);
              if (area) onResolve({ tipo: "match", areaId: area.id, setorId: area.setor_id });
            }}
            placeholder="Buscar área existente"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground w-24">Ou criar em:</span>
        <div className="w-56">
          <Combobox
            options={setores.map((s) => ({ value: s.id, label: s.nome }))}
            value={setorNovo}
            onChange={setSetorNovo}
            placeholder="Setor pai da área nova"
          />
        </div>
        <Input className="w-56 h-9" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
        <Button
          size="sm"
          variant="outline"
          disabled={!setorNovo || !novoNome.trim()}
          onClick={() => setorNovo && onResolve({ tipo: "criar", setorId: setorNovo, nome: novoNome })}
        >
          Criar Área
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onResolve({ tipo: "pular" })}>
          <Ban className="h-3.5 w-3.5" /> Pular
        </Button>
      </div>
    </div>
  );
}
