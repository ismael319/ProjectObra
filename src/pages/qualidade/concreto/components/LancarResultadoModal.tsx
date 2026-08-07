import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { EnsaioCorpoProva } from "../lib/ensaios-catalog";

// Códigos de tipo de ruptura conforme NBR 5739 — não texto livre, pra manter
// o dado comparável entre laboratórios diferentes.
const TIPOS_RUPTURA = [
  { value: "A", label: "A — cônica" },
  { value: "B", label: "B — cônica e cisalhada" },
  { value: "C", label: "C — cisalhada" },
  { value: "D", label: "D — colunar" },
  { value: "E", label: "E — colunar e fendas laterais na base" },
  { value: "F", label: "F — fora do padrão" },
];

export function LancarResultadoModal({
  corpoProva,
  onClose,
}: {
  corpoProva: EnsaioCorpoProva | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user, userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;

  const [form, setForm] = useState({
    data_ruptura_real: "",
    resultado_mpa: "" as number | "",
    tipo_ruptura: null as string | null,
    temperatura_concreto: "" as number | "",
    slump_aplicacao: "" as number | "",
    observacoes: "",
  });

  useEffect(() => {
    if (corpoProva) {
      setForm({
        data_ruptura_real: corpoProva.data_ruptura_real ?? corpoProva.data_ruptura_prevista,
        resultado_mpa: corpoProva.resultado_mpa ?? "",
        tipo_ruptura: corpoProva.tipo_ruptura ?? null,
        temperatura_concreto: corpoProva.temperatura_concreto ?? "",
        slump_aplicacao: corpoProva.slump_aplicacao ?? "",
        observacoes: corpoProva.observacoes ?? "",
      });
    }
  }, [corpoProva]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!corpoProva) return;
      if (corpoProva.status_conformidade === "dispensado") {
        throw new Error("Este corpo de prova está dispensado — um ensaio de idade inferior já atingiu o FCK.");
      }
      if (!form.data_ruptura_real || form.resultado_mpa === "") {
        throw new Error("Informe a data de ruptura e o resultado (MPa)");
      }
      const payload = {
        corpo_prova_id: corpoProva.corpo_prova_id,
        organizacao_id: organizacaoId,
        data_ruptura_real: form.data_ruptura_real,
        resultado_mpa: Number(form.resultado_mpa),
        tipo_ruptura: form.tipo_ruptura,
        temperatura_concreto: form.temperatura_concreto === "" ? null : Number(form.temperatura_concreto),
        slump_aplicacao: form.slump_aplicacao === "" ? null : Number(form.slump_aplicacao),
        observacoes: form.observacoes || null,
        criado_por: user?.id ?? null,
      };
      // upsert (onConflict corpo_prova_id, a UNIQUE 1:1) em vez de insert puro:
      // permite reabrir um CP já rompido e corrigir o resultado lançado, sem
      // precisar de uma tela de edição separada.
      const { error } = await supabase.from("ensaios_corpos_prova").upsert(payload, { onConflict: "corpo_prova_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resultado lançado");
      qc.invalidateQueries({ queryKey: ["vw_ensaios_concreto"] });
      qc.invalidateQueries({ queryKey: ["vw_rastreabilidade_concreto"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!corpoProva} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Lançar resultado — CP {corpoProva?.idade_prevista_dias} dias
            {corpoProva?.numero_lab ? ` (nº lab. ${corpoProva.numero_lab})` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Data de ruptura *</Label>
            <Input type="date" value={form.data_ruptura_real} onChange={(e) => setForm((p) => ({ ...p, data_ruptura_real: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Resultado — Fcj (MPa) *</Label>
            <Input
              type="number"
              step="any"
              min={0}
              value={form.resultado_mpa}
              onChange={(e) => setForm((p) => ({ ...p, resultado_mpa: e.target.value === "" ? "" : Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Tipo de ruptura (NBR 5739)</Label>
            <Combobox options={TIPOS_RUPTURA} value={form.tipo_ruptura} onChange={(v) => setForm((p) => ({ ...p, tipo_ruptura: v }))} placeholder="Selecione" />
          </div>
          <div className="space-y-1.5">
            <Label>Temperatura do concreto (°C)</Label>
            <Input
              type="number"
              step="any"
              value={form.temperatura_concreto}
              onChange={(e) => setForm((p) => ({ ...p, temperatura_concreto: e.target.value === "" ? "" : Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Slump na aplicação (cm)</Label>
            <Input
              type="number"
              step="any"
              value={form.slump_aplicacao}
              onChange={(e) => setForm((p) => ({ ...p, slump_aplicacao: e.target.value === "" ? "" : Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Observações</Label>
            <Input value={form.observacoes} onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))} />
          </div>
          {corpoProva && (
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Fck de referência do traço: <strong>{corpoProva.fck_mpa} MPa</strong>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
