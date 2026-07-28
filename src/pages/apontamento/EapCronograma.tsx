import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCronogramas, useCronogramaSelecoes, useAtividades } from "./lib/catalog";
import type { CronogramaItem } from "./lib/catalog";
import { supabase } from "@/lib/supabase";
import { CronogramaSelector } from "./components/CronogramaSelector";
import { ApontamentosTabela } from "./components/ApontamentosTabela";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

function getUsuarioId(): string {
  const key = "cronograma_usuario_id";
  let id = localStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
  return id;
}

export default function EapCronogramaPage() {
  const qc = useQueryClient();
  const usuarioId = useMemo(() => getUsuarioId(), []);
  const { data: cronogramas = [] } = useCronogramas();
  const { data: selecoesSalvas = [] } = useCronogramaSelecoes(usuarioId);
  const { data: atividades = [] } = useAtividades();
  const [cronogramaId, setCronogramaId] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<CronogramaItem[]>([]);

  useEffect(() => { if (cronogramas.length > 0 && !cronogramaId) setCronogramaId(cronogramas[0].id); }, [cronogramas, cronogramaId]);

  const handleSelectionChange = useCallback((items: CronogramaItem[]) => { setSelectedItems(items); }, []);
  const handleReload = useCallback(() => { qc.invalidateQueries({ queryKey: ["cronograma_selecoes", usuarioId] }); qc.invalidateQueries({ queryKey: ["cronograma_itens", cronogramaId] }); }, [qc, usuarioId, cronogramaId]);

  const handleMapAtividade = useCallback(async (itemId: string, atividadeId: string | null) => {
    try {
      const { error } = await supabase.from("cronograma_itens").update({ atividade_id: atividadeId }).eq("id", itemId);
      if (error) throw error;
      setSelectedItems((prev) => prev.map((item) => item.id === itemId ? { ...item, atividade_id: atividadeId } : item));
      toast.success("Atividade mapeada");
    } catch (e) { toast.error((e as Error).message); }
  }, []);

  const handleToggleAtivo = useCallback(async (itemId: string, ativo: boolean) => {
    try {
      const { error } = await supabase.from("cronograma_itens").update({ ativo }).eq("id", itemId);
      if (error) throw error;
      setSelectedItems((prev) => prev.map((item) => item.id === itemId ? { ...item, ativo } : item));
      toast.success(ativo ? "Item ativado" : "Item desativado");
    } catch (e) { toast.error((e as Error).message); }
  }, []);

  const handleDelete = useCallback(async (itemId: string) => {
    try {
      const { error } = await supabase.from("cronograma_itens").delete().eq("id", itemId);
      if (error) throw error;
      setSelectedItems((prev) => prev.filter((item) => item.id !== itemId));
      toast.success("Item excluído");
    } catch (e) { toast.error((e as Error).message); }
  }, []);

  useEffect(() => {
    if (cronogramaId && selecoesSalvas.length > 0) {
      const cronogramaSelecoes = selecoesSalvas.filter((s) => s.cronograma_id === cronogramaId);
      if (cronogramaSelecoes.length > 0) toast.info(`${cronogramaSelecoes.length} seleção(ões) anterior(es) carregada(s)`);
    }
  }, [cronogramaId, selecoesSalvas]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Visualizar EAP — Cronograma</h1>
        <p className="text-sm text-muted-foreground">Selecione índices do cronograma importado para visualizar os apontamentos.</p>
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Cronogramas</Label>
        <Select value={cronogramaId ?? ""} onValueChange={(v) => setCronogramaId(v || null)}>
          <SelectTrigger className="w-full max-w-sm"><SelectValue placeholder="Selecione um cronograma" /></SelectTrigger>
          <SelectContent>
            {cronogramas.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <CronogramaSelector cronogramaId={cronogramaId} onCronogramaChange={setCronogramaId} selectedItems={selectedItems} onSelectionChange={handleSelectionChange} />
      <ApontamentosTabela items={selectedItems} atividades={atividades} onMapAtividade={handleMapAtividade} onToggleAtivo={handleToggleAtivo} onDelete={handleDelete} onReload={handleReload} />
    </div>
  );
}
