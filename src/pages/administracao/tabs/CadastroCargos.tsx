import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Plus, Pencil, Download, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { useRhCargos, useRhSetores, useRhGrupos } from "@/lib/administracao/catalog";
import {
  salvarCargo, alternarAtivoCargo, seedCargosReferenciaPadrao,
  type CargoInput, type Categoria,
} from "@/lib/administracao/db";
import type { RhCargo } from "@/lib/administracao/catalog";

const CATEGORIA_OPCOES: { value: Categoria; label: string }[] = [
  { value: "D", label: "D — Direta" },
  { value: "I", label: "I — Indireta" },
];

export default function CadastroCargos() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const { data: cargos = [], isLoading } = useRhCargos(organizacaoId);
  const { data: setores = [] } = useRhSetores(organizacaoId);
  const { data: grupos = [] } = useRhGrupos(organizacaoId);

  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<RhCargo | "novo" | null>(null);
  const [form, setForm] = useState<CargoInput>({ nome: "", setorPadraoId: null, grupoId: null, categoria: null });
  const [salvando, setSalvando] = useState(false);
  const [seedando, setSeedando] = useState(false);

  const setorNomePorId = useMemo(() => new Map(setores.map((s) => [s.id, s.nome])), [setores]);

  const filtrados = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return cargos
      .filter((c) => !b || c.nome.toLowerCase().includes(b))
      .sort((a, b2) => a.nome.localeCompare(b2.nome, "pt-BR"));
  }, [cargos, busca]);

  function abrirNovo() {
    setForm({ nome: "", setorPadraoId: null, grupoId: null, categoria: null });
    setEditando("novo");
  }

  function abrirEditar(c: RhCargo) {
    setForm({ id: c.id, nome: c.nome, setorPadraoId: c.setor_padrao_id, grupoId: c.grupo_id, categoria: c.categoria });
    setEditando(c);
  }

  async function handleSalvar() {
    if (!organizacaoId || !form.nome.trim()) {
      toast.error("Informe o nome da função.");
      return;
    }
    setSalvando(true);
    try {
      await salvarCargo({ organizacaoId, input: form });
      toast.success(editando === "novo" ? "Cargo cadastrado." : "Cargo atualizado.");
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["rh_cargos", organizacaoId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  async function handleToggleAtivo(c: RhCargo) {
    try {
      await alternarAtivoCargo(c.id, !c.ativo);
      qc.invalidateQueries({ queryKey: ["rh_cargos", organizacaoId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCarregarPadrao() {
    if (!organizacaoId) return;
    setSeedando(true);
    try {
      await seedCargosReferenciaPadrao(organizacaoId);
      toast.success("Lista padrão carregada.");
      qc.invalidateQueries({ queryKey: ["rh_cargos", organizacaoId] });
      qc.invalidateQueries({ queryKey: ["rh_setores", organizacaoId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSeedando(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar função..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCarregarPadrao} disabled={seedando}>
              {seedando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Carregar lista padrão
            </Button>
            <Button onClick={abrirNovo}><Plus size={16} /> Novo Cargo</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Função</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Categoria (MO)</TableHead>
                <TableHead className="w-[100px]">Ativo</TableHead>
                <TableHead className="w-[70px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>}
              {!isLoading && filtrados.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum cargo cadastrado — use "Carregar lista padrão" ou "Novo Cargo".</TableCell></TableRow>
              )}
              {filtrados.map((c) => (
                <TableRow key={c.id} className={!c.ativo ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>{c.setor_padrao_id ? setorNomePorId.get(c.setor_padrao_id) ?? "—" : "—"}</TableCell>
                  <TableCell>{c.categoria ?? "—"}</TableCell>
                  <TableCell>
                    <Switch checked={c.ativo} onCheckedChange={() => handleToggleAtivo(c)} />
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => abrirEditar(c)} title="Editar">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando === "novo" ? "Novo Cargo" : "Editar Cargo"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Função *</Label>
              <Input value={form.nome} onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Setor</Label>
              <Combobox
                options={setores.map((s) => ({ value: s.id, label: s.nome }))}
                value={form.setorPadraoId}
                onChange={(v) => setForm((p) => ({ ...p, setorPadraoId: v }))}
                placeholder="Selecione o setor"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Grupo</Label>
              <Combobox
                options={grupos.map((g) => ({ value: g.id, label: g.nome }))}
                value={form.grupoId}
                onChange={(v) => setForm((p) => ({ ...p, grupoId: v }))}
                placeholder="Selecione o grupo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria (MO)</Label>
              <Combobox
                options={CATEGORIA_OPCOES}
                value={form.categoria}
                onChange={(v) => setForm((p) => ({ ...p, categoria: v as Categoria | null }))}
                placeholder="Direta ou Indireta"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
