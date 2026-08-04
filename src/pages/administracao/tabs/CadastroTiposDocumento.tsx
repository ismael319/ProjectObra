import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Plus, Pencil, Download, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTiposDocumento } from "@/lib/administracao/catalog";
import type { TipoDocumento } from "@/lib/administracao/catalog";
import { salvarTipoDocumento, alternarAtivoTipoDocumento, seedTiposDocumentoPadrao, type TipoDocumentoInput } from "@/lib/administracao/db";

interface Props {
  organizacaoId: string;
  onClose: () => void;
}

// Cadastro dos tipos de documento (ASO, NRs, Integração, Gota espessa etc.) usados
// no "Ver documentos" de cada funcionário (DocumentosFuncionarioModal) — cada tipo
// define só o prazo de validade em dias; a data de vencimento de cada funcionário é
// calculada sozinha a partir da data de emissão informada na renovação.
export default function CadastroTiposDocumento({ organizacaoId, onClose }: Props) {
  const qc = useQueryClient();
  const { data: tipos = [], isLoading } = useTiposDocumento(organizacaoId);

  const [editando, setEditando] = useState<TipoDocumento | "novo" | null>(null);
  const [form, setForm] = useState<TipoDocumentoInput>({ nome: "", validadeDias: 180 });
  const [salvando, setSalvando] = useState(false);
  const [seedando, setSeedando] = useState(false);

  const ordenados = useMemo(() => [...tipos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [tipos]);

  function invalidar() {
    qc.invalidateQueries({ queryKey: ["tipos_documento", organizacaoId] });
    qc.invalidateQueries({ queryKey: ["alertas_documentos", organizacaoId] });
  }

  function abrirNovo() {
    setForm({ nome: "", validadeDias: 180 });
    setEditando("novo");
  }

  function abrirEditar(t: TipoDocumento) {
    setForm({ id: t.id, nome: t.nome, validadeDias: t.validade_dias });
    setEditando(t);
  }

  async function handleSalvar() {
    if (!form.nome.trim() || !form.validadeDias || form.validadeDias <= 0) {
      toast.error("Informe o nome e a validade (em dias).");
      return;
    }
    setSalvando(true);
    try {
      await salvarTipoDocumento({ organizacaoId, input: form });
      toast.success(editando === "novo" ? "Tipo de documento cadastrado." : "Tipo de documento atualizado.");
      setEditando(null);
      invalidar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSalvando(false);
    }
  }

  async function handleToggleAtivo(t: TipoDocumento) {
    try {
      await alternarAtivoTipoDocumento(t.id, !t.ativo);
      invalidar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCarregarPadrao() {
    setSeedando(true);
    try {
      await seedTiposDocumentoPadrao(organizacaoId);
      toast.success("Lista padrão carregada.");
      invalidar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSeedando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Tipos de documento</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cada tipo tem uma validade (em dias) — ao renovar, o vencimento é calculado sozinho.
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleCarregarPadrao} disabled={seedando}>
              {seedando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Lista padrão
            </Button>
            <Button size="sm" onClick={abrirNovo}>
              <Plus size={14} /> Novo tipo
            </Button>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-[130px]">Validade (dias)</TableHead>
                  <TableHead className="w-[90px]">Ativo</TableHead>
                  <TableHead className="w-[60px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
                  </TableRow>
                )}
                {!isLoading && ordenados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Nenhum tipo cadastrado — use "Lista padrão" ou "Novo tipo".
                    </TableCell>
                  </TableRow>
                )}
                {ordenados.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell>{t.validade_dias}</TableCell>
                    <TableCell>
                      <Switch checked={t.ativo} onCheckedChange={() => handleToggleAtivo(t)} />
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => abrirEditar(t)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando === "novo" ? "Novo tipo de documento" : "Editar tipo de documento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex.: Gota espessa"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Validade (dias) *</Label>
              <Input
                type="number"
                min={1}
                value={form.validadeDias}
                onChange={(e) => setForm((p) => ({ ...p, validadeDias: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
