import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, Pencil, Trash2, FileText, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useRdrRecords, useExcluirRecord, obterFotoUrl } from "@/lib/rdr/rdr-db";
import { gerarPdfRegistro } from "@/lib/rdr/exports";
import { CATEGORIAS } from "@/lib/rdr/constants";
import { formatarData, formatarDataHora, type RdrRecord } from "@/lib/rdr/mappers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function FotoItem({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    obterFotoUrl(path)
      .then((u) => {
        if (ativo) setUrl(u);
      })
      .catch(() => {
        if (ativo) setErro(true);
      });
    return () => {
      ativo = false;
    };
  }, [path]);

  if (erro) return null;
  if (!url) return <div className="h-24 w-24 animate-pulse rounded-md bg-muted" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={name}>
      <img src={url} alt={name} className="h-24 w-24 rounded-md object-cover border" />
    </a>
  );
}

function DetalheRecord({ record, onClose }: { record: RdrRecord; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registro — {formatarData(record.data_ocorrido)}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div><span className="font-semibold">Local:</span> {record.local || "—"}</div>
          <div><span className="font-semibold">Hora:</span> {record.hora || "—"}</div>
          <div><span className="font-semibold">Registrado por:</span> {record.autor_nome || "—"}</div>
          <div><span className="font-semibold">Colaborador:</span> {record.nome_colaborador || "—"}</div>
          <div><span className="font-semibold">Responsável setor:</span> {record.responsavel_setor || "—"}</div>
          <div><span className="font-semibold">Responsável registro:</span> {record.responsavel_registro || "—"}</div>
          <div><span className="font-semibold">Prazo:</span> {record.prazo ? formatarData(record.prazo) : "—"}</div>
          <div><span className="font-semibold">Criado em:</span> {formatarDataHora(record.criado_em)}</div>
        </div>
        <div>
          <span className="font-semibold">Categorias:</span>{" "}
          <div className="mt-1 flex flex-wrap gap-1">
            {(record.categorias ?? []).map((c) => (
              <Badge key={c} variant={c === "Reconhecimento" ? "default" : "secondary"}>{c}</Badge>
            ))}
          </div>
        </div>
        <div>
          <span className="font-semibold">Status:</span>{" "}
          <Badge variant={record.concluido === "SIM" ? "default" : "destructive"}>{record.concluido || "—"}</Badge>
        </div>
        <div>
          <span className="font-semibold">Descrição:</span>
          <p className="mt-1 whitespace-pre-wrap rounded-md border p-2 text-sm">{record.descricao}</p>
        </div>
        {record.sugestao_correcao && (
          <div>
            <span className="font-semibold">Sugestão de correção:</span>
            <p className="mt-1 whitespace-pre-wrap rounded-md border p-2 text-sm">{record.sugestao_correcao}</p>
          </div>
        )}
        {(record.fotos?.length ?? 0) > 0 && (
          <div>
            <span className="font-semibold">Fotos:</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {record.fotos.map((f) => (
                <FotoItem key={f.path} path={f.path} name={f.name} />
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function RdrRegistros() {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const navigate = useNavigate();
  const location = useLocation();

  const { data: registros = [], isLoading } = useRdrRecords(organizacaoId);
  const excluirMut = useExcluirRecord(organizacaoId);

  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<string | null>((location.state as { status?: string } | null)?.status ?? null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<RdrRecord | null>(null);
  const [gerandoPdfId, setGerandoPdfId] = useState<string | null>(null);

  useEffect(() => {
    window.history.replaceState({}, "");
  }, []);

  const filtrados = useMemo(() => {
    return registros.filter((r) => {
      if (status === "aberto" && r.concluido === "SIM") return false;
      if (status === "finalizado" && r.concluido !== "SIM") return false;
      if (categoria && !(r.categorias ?? []).includes(categoria)) return false;
      if (busca) {
        const q = busca.toLowerCase();
        const alvo = [r.local, r.autor_nome, r.nome_colaborador, r.descricao, r.responsavel_setor].join(" ").toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [registros, status, categoria, busca]);

  const podeExcluir = userProfile?.papel === "edicao";

  const handleExcluir = async (r: RdrRecord) => {
    if (!window.confirm("Excluir este registro? As fotos também serão removidas.")) return;
    try {
      await excluirMut.mutateAsync(r);
      toast.success("Registro excluído");
    } catch (e) {
      toast.error("Falha ao excluir registro");
      console.error(e);
    }
  };

  const handlePdf = async (r: RdrRecord) => {
    setGerandoPdfId(r.id);
    try {
      await gerarPdfRegistro(r);
    } catch (e) {
      toast.error("Falha ao gerar PDF");
      console.error(e);
    } finally {
      setGerandoPdfId(null);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Registros RDR</h1>
          <p className="text-sm text-muted-foreground">{filtrados.length} registro(s)</p>
        </div>
        <Button onClick={() => navigate("/dashboard/seguranca/novo")}>Novo Registro</Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Local, técnico, descrição..." className="pl-8" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Combobox
                options={[
                  { value: "aberto", label: "Abertos" },
                  { value: "finalizado", label: "Finalizados" },
                ]}
                value={status}
                onChange={setStatus}
                placeholder="Todos"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Categoria</Label>
              <Combobox
                options={CATEGORIAS.map((c) => ({ value: c, label: c }))}
                value={categoria}
                onChange={setCategoria}
                placeholder="Todas"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Local</TableHead>
                <TableHead>Registrado por</TableHead>
                <TableHead>Categorias</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              )}
              {filtrados.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{formatarData(r.data_ocorrido)}</TableCell>
                  <TableCell>{r.local || "—"}</TableCell>
                  <TableCell>{r.autor_nome || "—"}</TableCell>
                  <TableCell>
                    <div className="flex max-w-52 flex-wrap gap-1">
                      {(r.categorias ?? []).map((c) => (
                        <Badge key={c} variant={c === "Reconhecimento" ? "default" : "secondary"}>{c}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.concluido === "SIM" ? "default" : "outline"}>{r.concluido || "—"}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Visualizar" onClick={() => setDetalhe(r)}>
                        <Eye size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        onClick={() => navigate(`/dashboard/seguranca/registros/${r.id}`)}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" title="PDF" onClick={() => handlePdf(r)} disabled={gerandoPdfId === r.id}>
                        {gerandoPdfId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText size={16} />}
                      </Button>
                      {podeExcluir && (
                        <Button variant="ghost" size="icon" title="Excluir" className="text-destructive" onClick={() => handleExcluir(r)}>
                          <Trash2 size={16} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {detalhe && <DetalheRecord record={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}
