import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2, PowerOff, ListChecks, X, Loader2 } from "lucide-react";

// Mesmo padrão visual/de código de apontamento/components/CadastroPage.tsx,
// adaptado pras tabelas do Concreto: essas são "modernas" (organizacao_id
// próprio, sem coluna atualizado_em) em vez das tabelas globais legadas do
// Apontamento — por isso um componente próprio em vez de reusar aquele.

type TableName = "fornecedores_concreto" | "tracos_concreto";

// Coluna em cargas_concreto que referencia cada tabela — usada só pra travar
// exclusão de um registro já vinculado a alguma carga (mesmo espírito de
// APONTAMENTO_FK no Cadastro de mão de obra).
const CARGAS_CONCRETO_FK: Record<TableName, string> = {
  fornecedores_concreto: "fornecedor_id",
  tracos_concreto: "traco_id",
};

interface ComboboxOption {
  value: string;
  label: string;
  group?: string;
}

interface CadastroField {
  key: string;
  label: string;
  type: "text" | "select" | "number";
  required?: boolean;
  options?: ComboboxOption[];
}

interface CadastroPageProps {
  title: string;
  description?: string;
  table: TableName;
  fields: CadastroField[];
  extraColumns?: { key: string; label: string; render?: (row: any) => string }[];
  orderBy?: string;
}

export function CadastroPage({
  title,
  description,
  table,
  fields,
  extraColumns = [],
  orderBy = "nome",
}: CadastroPageProps) {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [confirm, setConfirm] = useState<{ id: string; nome: string } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["cadastro-concreto", table, organizacaoId],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("*").eq("organizacao_id", organizacaoId!);
      if (error) throw error;
      return data;
    },
    enabled: !!organizacaoId,
  });

  // Ids que não podem ser excluídos: já têm carga de concreto vinculada.
  // Calculado aqui pra já desabilitar o botão de excluir na hora, em vez de
  // só descobrir depois de tentar (e tomar o erro cru de FK vindo do banco).
  const fkField = CARGAS_CONCRETO_FK[table];

  const { data: cargasIds = [] } = useQuery({
    queryKey: ["cadastro-concreto", table, "cargas-vinculadas", organizacaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cargas_concreto")
        .select(fkField)
        .eq("organizacao_id", organizacaoId!)
        .not(fkField, "is", null);
      if (error) throw error;
      return (data as unknown as Record<string, string>[]).map((r) => r[fkField]);
    },
    enabled: !!organizacaoId,
  });

  const blockedIds = useMemo(() => new Set(cargasIds), [cargasIds]);

  const filtered = rows
    .filter((r: any) => {
      if (!search) return true;
      return JSON.stringify(r).toLowerCase().includes(search.toLowerCase());
    })
    .sort((a: any, b: any) => (a[orderBy] ?? "").localeCompare(b[orderBy] ?? ""));

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {};
      for (const f of fields) {
        const empty = f.type === "text" ? "" : null;
        payload[f.key] = form[f.key] ?? empty;
      }

      if (editing) {
        const { error } = await supabase.from(table).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        payload.organizacao_id = organizacaoId;
        payload.ativo = true;
        const { error } = await supabase.from(table).insert(payload).select().single();
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Atualizado" : "Cadastrado");
      setOpen(false);
      setEditing(null);
      setForm({});
      qc.invalidateQueries({ queryKey: ["cadastro-concreto", table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from(table).update({ ativo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cadastro-concreto", table] }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { count, error: countErr } = await supabase.from("cargas_concreto")
        .select("id", { count: "exact", head: true })
        .eq(fkField, id);
      if (countErr) throw countErr;
      if (count && count > 0) {
        throw new Error("Registro possui cargas de concreto vinculadas. Recomenda-se inativar ao invés de excluir.");
      }
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Excluído");
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["cadastro-concreto", table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Exclui vários de uma vez — pula (sem quebrar o lote) qualquer id que ainda
  // esteja bloqueado por carga vinculada, mesmo que a seleção já tenha
  // filtrado isso; é só uma segunda trava de segurança.
  const deleteBulkMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const deletable = ids.filter((id) => !blockedIds.has(id));
      for (const id of deletable) {
        const { error } = await supabase.from(table).delete().eq("id", id);
        if (error) throw error;
      }
      return { deletedCount: deletable.length, skippedCount: ids.length - deletable.length };
    },
    onSuccess: ({ deletedCount, skippedCount }) => {
      if (deletedCount > 0) toast.success(`${deletedCount} excluído(s)`);
      if (skippedCount > 0) toast.error(`${skippedCount} item(ns) com vínculos foram ignorados — inative-os em vez de excluir.`);
      qc.invalidateQueries({ queryKey: ["cadastro-concreto", table] });
      cancelSelectMode();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inactivateMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).update({ ativo: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inativado");
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["cadastro-concreto", table] });
    },
  });

  function openNew() {
    setEditing(null);
    setForm({});
    setOpen(true);
  }

  function openEdit(row: any) {
    setEditing(row);
    const f: Record<string, any> = {};
    for (const field of fields) f[field.key] = row[field.key] ?? (field.type === "text" ? "" : null);
    setForm(f);
    setOpen(true);
  }

  function cancelSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setBulkConfirmOpen(false);
  }

  function toggleSelect(row: any) {
    if (blockedIds.has(row.id)) {
      toast.error("Registro com cargas vinculadas — não pode ser selecionado para exclusão.");
      return;
    }
    const next = new Set(selectedIds);
    if (next.has(row.id)) next.delete(row.id);
    else next.add(row.id);
    setSelectedIds(next);
  }

  function handleDelete(row: any) {
    setConfirm({ id: row.id, nome: row[orderBy] ?? row.nome ?? "item" });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <Button variant="outline" onClick={cancelSelectMode}><X className="h-4 w-4" /> Cancelar seleção</Button>
          ) : (
            <Button variant="outline" onClick={() => setSelectMode(true)}><ListChecks className="h-4 w-4" /> Selecionar</Button>
          )}
          <Button onClick={openNew}><Plus className="h-4 w-4" /> Novo</Button>
        </div>
      </div>

      {selectMode && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <p className="text-sm">
              {selectedIds.size === 0
                ? "Marque na tabela quais registros excluir. Itens com cargas vinculadas não podem ser selecionados."
                : `${selectedIds.size} item(ns) selecionado(s).`}
            </p>
            {selectedIds.size > 0 && (
              <Button size="sm" variant="destructive" onClick={() => setBulkConfirmOpen(true)} disabled={deleteBulkMut.isPending}>
                {deleteBulkMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Excluir {selectedIds.size} item(ns)
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {selectMode && <TableHead className="w-[40px]" />}
                  <TableHead>Nome</TableHead>
                  {extraColumns.map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                  <TableHead className="w-[100px]">Ativo</TableHead>
                  <TableHead className="w-[100px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={3 + extraColumns.length + (selectMode ? 1 : 0)} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
                {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={3 + extraColumns.length + (selectMode ? 1 : 0)} className="text-center py-8 text-muted-foreground">Nenhum registro</TableCell></TableRow>}
                {filtered.map((row: any) => {
                  const bloqueado = blockedIds.has(row.id);
                  return (
                    <TableRow key={row.id} className={!row.ativo ? "opacity-50" : ""}>
                      {selectMode && (
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            disabled={bloqueado}
                            title={bloqueado ? "Possui cargas vinculadas — não pode ser excluído" : undefined}
                            onChange={() => toggleSelect(row)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium">{row[orderBy] ?? row.nome}</TableCell>
                      {extraColumns.map((c) => <TableCell key={c.key}>{c.render ? c.render(row) : (row[c.key] ?? "—")}</TableCell>)}
                      <TableCell>
                        <Switch checked={row.ativo} onCheckedChange={() => toggleMut.mutate({ id: row.id, ativo: !row.ativo })} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(row)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button
                            size="icon" variant="ghost" className="h-8 w-8 text-destructive disabled:opacity-30"
                            disabled={bloqueado}
                            title={bloqueado ? "Possui cargas vinculadas — inative em vez de excluir" : "Excluir"}
                            onClick={() => handleDelete(row)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Novo"} {title.replace(/s$/, "")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label} {f.required && "*"}</Label>
                {f.type === "text" ? (
                  <Input value={form[f.key] ?? ""} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} />
                ) : f.type === "number" ? (
                  <Input
                    type="number"
                    step="any"
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))}
                  />
                ) : (
                  <Combobox
                    options={f.options ?? []}
                    value={form[f.key] ?? null}
                    onChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                    placeholder={`Selecione ${f.label.toLowerCase()}`}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {title.replace(/s$/, "")}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{confirm?.nome}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && deleteMut.mutate(confirm.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </AlertDialogAction>
            <AlertDialogAction onClick={() => confirm && inactivateMut.mutate(confirm.id)}>
              <PowerOff className="h-4 w-4 mr-1" /> Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selectedIds.size} item(ns)?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir os itens selecionados? Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBulkMut.mutate([...selectedIds])}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
