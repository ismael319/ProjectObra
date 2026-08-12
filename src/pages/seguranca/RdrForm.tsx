import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, ImagePlus, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  useRdrRecord, useSalvarRecord, fazerUploadFotos, excluirFotos, obterFotoUrl,
  type FotoUpload,
} from "@/lib/rdr/rdr-db";
import { CATEGORIAS, MAX_FOTOS } from "@/lib/rdr/constants";
import { ehDesvio, type RdrFoto } from "@/lib/rdr/mappers";
import { useSetores, useAreas } from "@/pages/apontamento/lib/catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, MultiCombobox } from "@/components/ui/combobox";
import { todayISO } from "@/lib/utils";

function horaAtual(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function FotoExistente({ foto, onRemove }: { foto: RdrFoto; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    obterFotoUrl(foto.path)
      .then((u) => {
        if (ativo) setUrl(u);
      })
      .catch(() => {
        if (ativo) setErro(true);
      });
    return () => {
      ativo = false;
    };
  }, [foto.path]);

  if (erro) return null;
  return (
    <div className="relative">
      {url ? (
        <img src={url} alt={foto.name} className="h-24 w-24 rounded-md border object-cover" />
      ) : (
        <div className="h-24 w-24 animate-pulse rounded-md bg-muted" />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white shadow"
        title="Remover foto"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function comprimirImagem(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1024;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas não suportado"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function RdrForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const { data: record, isLoading: carregandoRecord } = useRdrRecord(isEdit ? id : undefined);
  const salvarMut = useSalvarRecord(organizacaoId);

  const nomePadrao = userProfile?.nome ?? user?.user_metadata?.nome ?? user?.email ?? "";

  const [data, setData] = useState(todayISO());
  const [hora, setHora] = useState(horaAtual());
  const [tipo, setTipo] = useState("Desvio");
  const [local, setLocal] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [concluido, setConcluido] = useState<string>("NÃO");
  const [concluidoEm, setConcluidoEm] = useState<string | null>(null);
  const [nomeColaborador, setNomeColaborador] = useState("");
  const [responsavelSetor, setResponsavelSetor] = useState("");
  const [responsavelRegistro, setResponsavelRegistro] = useState(nomePadrao);
  const [descricao, setDescricao] = useState("");
  const [sugestaoCorrecao, setSugestaoCorrecao] = useState("");
  const [prazo, setPrazo] = useState("");
  const [existentes, setExistentes] = useState<RdrFoto[]>([]);
  const [novasFotos, setNovasFotos] = useState<FotoUpload[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [abertoLocal, setAbertoLocal] = useState(false);

  useEffect(() => {
    if (record) {
      setData(record.data_ocorrido);
      setHora(record.hora ?? "");
      setLocal(record.local ?? "");
      setCategorias(record.categorias ?? []);
      setTipo(ehDesvio(record.categorias ?? []) ? "Desvio" : "Reconhecimento");
      setConcluido(record.concluido || "NÃO");
      setConcluidoEm(record.concluido_em ?? null);
      setNomeColaborador(record.nome_colaborador ?? "");
      setResponsavelSetor(record.responsavel_setor ?? "");
      setResponsavelRegistro(record.responsavel_registro ?? "");
      setDescricao(record.descricao);
      setSugestaoCorrecao(record.sugestao_correcao ?? "");
      setPrazo(record.prazo ?? "");
      setExistentes(record.fotos ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record]);

  useEffect(() => {
    if (data === todayISO() && !hora) setHora(horaAtual());
  }, [data, hora]);

  const { data: setores = [] } = useSetores();
  const { data: areas = [] } = useAreas();

  const opcoesEap = useMemo(() => {
    const opcoes: { value: string; label: string; group: string }[] = [];
    for (const s of setores) {
      const areasDoSetor = areas.filter((a) => a.setor_id === s.id);
      if (areasDoSetor.length === 0) {
        opcoes.push({ value: s.nome, label: s.nome, group: "" });
        continue;
      }
      for (const a of areasDoSetor) {
        opcoes.push({ value: `${s.nome} > ${a.nome}`, label: `${s.nome} > ${a.nome}`, group: s.nome });
      }
    }
    return opcoes;
  }, [setores, areas]);

  const gruposEap = useMemo(() => {
    const map = new Map<string, typeof opcoesEap>();
    for (const o of opcoesEap) {
      const key = o.group;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return [...map.entries()];
  }, [opcoesEap]);

  const ehReconhecimento = tipo === "Reconhecimento";

  const handleTipoChange = (v: string | null) => {
    const novo = v === "Reconhecimento" ? "Reconhecimento" : "Desvio";
    setTipo(novo);
    if (novo === "Reconhecimento") {
      setCategorias(["Reconhecimento"]);
    } else {
      setCategorias((prev) => prev.filter((c) => c !== "Reconhecimento"));
    }
  };

  const totalFotos = existentes.length + novasFotos.length;

  const handleArquivos = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const restantes = MAX_FOTOS - totalFotos;
    if (restantes <= 0) {
      toast.warning(`Máximo de ${MAX_FOTOS} fotos por registro`);
      return;
    }
    const lista = Array.from(files).slice(0, restantes);
    const comprimidas: FotoUpload[] = [];
    for (const f of lista) {
      try {
        comprimidas.push({ dataUrl: await comprimirImagem(f), name: f.name });
      } catch {
        toast.error("Não foi possível processar a imagem");
      }
    }
    setNovasFotos((prev) => [...prev, ...comprimidas]);
  };

  const removerNova = (idx: number) => setNovasFotos((prev) => prev.filter((_, i) => i !== idx));

  const removerExistente = (path: string) => setExistentes((prev) => prev.filter((f) => f.path !== path));

  const podeSalvar = useMemo(
    () => data && descricao.trim() && categorias.length > 0,
    [data, descricao, categorias],
  );

  const handleSalvar = async () => {
    if (!podeSalvar) {
      toast.error("Preencha data, categorias e descrição");
      return;
    }
    setSalvando(true);
    try {
      const recordId = isEdit ? id! : crypto.randomUUID();
      const uploads = await fazerUploadFotos(organizacaoId!, recordId, novasFotos);
      const fotosFinal = [...existentes, ...uploads];
      const categoriasFinal = ehReconhecimento ? ["Reconhecimento"] : categorias;
      await salvarMut.mutateAsync({
        id: isEdit ? id : undefined,
        data_ocorrido: data,
        hora,
        local,
        categorias: categoriasFinal,
        concluido,
        nome_colaborador: nomeColaborador,
        responsavel_setor: responsavelSetor,
        responsavel_registro: responsavelRegistro,
        descricao,
        sugestao_correcao: ehReconhecimento ? "" : sugestaoCorrecao,
        prazo: ehReconhecimento ? null : prazo || null,
        concluido_em: concluidoEm,
        fotos: fotosFinal,
      });
      if (isEdit) {
        const removidas = (record?.fotos ?? []).filter((f) => !existentes.some((e) => e.path === f.path));
        if (removidas.length) await excluirFotos(removidas.map((f) => f.path)).catch(() => undefined);
      }
      toast.success(isEdit ? "Registro atualizado" : "Registro salvo");
      navigate("/dashboard/seguranca/registros");
    } catch (e) {
      toast.error("Falha ao salvar registro");
      console.error(e);
    } finally {
      setSalvando(false);
    }
  };

  if (isEdit && carregandoRecord) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} title="Voltar">
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? "Editar Registro" : "Novo Registro RDR"}</h1>
          <p className="text-sm text-muted-foreground">Registro de Desvio e Reconhecimento</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Dados do registro</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Data *</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Hora</Label>
            <Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Combobox
              options={[
                { value: "Desvio", label: "Desvio" },
                { value: "Reconhecimento", label: "Reconhecimento" },
              ]}
              value={tipo}
              onChange={handleTipoChange}
              placeholder="Selecione..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Local</Label>
            <div className="flex gap-2">
              <Input
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex.: Pátio de formas"
                className="flex-1"
              />
              <Dialog open={abertoLocal} onOpenChange={setAbertoLocal}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="icon" title="Selecionar da EAP">
                    <MapPin className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Selecionar local da EAP</DialogTitle>
                    <DialogDescription>Digite para filtrar setor, área ou subárea.</DialogDescription>
                  </DialogHeader>
                  <Command>
                    <CommandInput placeholder="Buscar local..." autoFocus />
                    <CommandList>
                      <CommandEmpty>Nenhum local encontrado</CommandEmpty>
                      {gruposEap.map(([grupo, opts]) => (
                        <CommandGroup key={grupo} heading={grupo || undefined}>
                          {opts.map((o) => (
                            <CommandItem
                              key={o.value}
                              value={o.value}
                              onSelect={() => {
                                setLocal(o.value);
                                setAbertoLocal(false);
                              }}
                            >
                              <Check className={local === o.value ? "mr-2 h-4 w-4 opacity-100" : "mr-2 h-4 w-4 opacity-0"} />
                              {o.label}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                    </CommandList>
                  </Command>
                </DialogContent>
              </Dialog>
            </div>
            <p className="text-xs text-muted-foreground">
              Clique no ícone de mapa para buscar o local na EAP, ou digite manualmente.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Registrado por</Label>
            <Input value={nomePadrao} readOnly className="bg-muted text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Sempre a conta logada — preenchido automaticamente pelo sistema.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Nome do colaborador</Label>
            <Input value={nomeColaborador} onChange={(e) => setNomeColaborador(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável pelo setor</Label>
            <Input value={responsavelSetor} onChange={(e) => setResponsavelSetor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável pelo registro</Label>
            <Input value={responsavelRegistro} onChange={(e) => setResponsavelRegistro(e.target.value)} />
          </div>
          {!ehReconhecimento && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Prazo</Label>
              <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Categorias *</Label>
            {ehReconhecimento ? (
              <Input value="Reconhecimento" readOnly className="bg-muted text-muted-foreground" />
            ) : (
              <MultiCombobox
                options={CATEGORIAS.filter((c) => c !== "Reconhecimento").map((c) => ({ value: c, label: c }))}
                value={categorias}
                onChange={setCategorias}
                placeholder="Selecione as categorias..."
              />
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Status</Label>
            <Combobox
              options={[
                { value: "SIM", label: "SIM — resolvido/finalizado" },
                { value: "NÃO", label: "NÃO — pendente" },
              ]}
              value={concluido}
              onChange={(v) => {
                const novo = v ?? "NÃO";
                setConcluido(novo);
                setConcluidoEm(novo === "SIM" ? new Date().toISOString() : null);
              }}
              placeholder="Selecione..."
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Descrição *</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={4} placeholder="Descreva o desvio ou reconhecimento..." />
          </div>
          {!ehReconhecimento && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Sugestão de correção</Label>
              <Textarea value={sugestaoCorrecao} onChange={(e) => setSugestaoCorrecao(e.target.value)} rows={3} />
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label>Fotos ({totalFotos}/{MAX_FOTOS})</Label>
            <div className="flex flex-wrap gap-2">
              {existentes.map((f) => (
                <FotoExistente key={f.path} foto={f} onRemove={() => removerExistente(f.path)} />
              ))}
              {novasFotos.map((f, i) => (
                <div key={i} className="relative">
                  <img src={f.dataUrl} alt={f.name} className="h-24 w-24 rounded-md border object-cover" />
                  <button
                    type="button"
                    onClick={() => removerNova(i)}
                    className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white shadow"
                    title="Remover foto"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              {totalFotos < MAX_FOTOS && (
                <>
                  <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary">
                    <Camera size={20} />
                    <span className="text-xs">Tirar foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void handleArquivos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary">
                    <ImagePlus size={20} />
                    <span className="text-xs">Galeria</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        void handleArquivos(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancelar</Button>
        <Button onClick={() => void handleSalvar()} disabled={salvando || !podeSalvar}>
          {salvando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
          {isEdit ? "Salvar alterações" : "Salvar registro"}
        </Button>
      </div>
    </div>
  );
}
