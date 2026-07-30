import { useSetores, useAreas, useSubareas } from "@/pages/apontamento/lib/catalog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { X } from "lucide-react";

export type DestinoForm = {
  key: string; // só uso local (key de lista em React) — não vai pro banco
  setor_id: string | null;
  area_id: string | null;
  subarea_id: string | null;
  quantidade_m3_aplicada: number | null;
  observacao: string;
};

export function novoDestino(): DestinoForm {
  return {
    key: crypto.randomUUID(),
    setor_id: null,
    area_id: null,
    subarea_id: null,
    quantidade_m3_aplicada: null,
    observacao: "",
  };
}

// Cascata Setor→Área→Etapa reaproveitada do módulo de Apontamento de Mão de
// Obra (mesmos catálogos globais, referenciados via FK — não duplicados
// aqui). Cada linha de destino chama os hooks pra si mesma, por isso é um
// componente à parte em vez de um loop dentro do formulário principal.
export function DestinoRow({
  destino,
  onChange,
  onRemove,
}: {
  destino: DestinoForm;
  onChange: (d: DestinoForm) => void;
  onRemove?: () => void;
}) {
  const { data: setores = [] } = useSetores();
  const { data: areas = [] } = useAreas(destino.setor_id);
  const { data: subareas = [] } = useSubareas(destino.area_id);

  return (
    <div className="grid gap-3 sm:grid-cols-6 items-end rounded-md border p-3">
      <div className="space-y-1.5 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">Setor</Label>
        <Combobox
          options={setores.map((s) => ({ value: s.id, label: s.nome }))}
          value={destino.setor_id}
          onChange={(v) => onChange({ ...destino, setor_id: v, area_id: null, subarea_id: null })}
          placeholder="Setor"
        />
      </div>
      <div className="space-y-1.5 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">Área</Label>
        <Combobox
          options={areas.map((a) => ({ value: a.id, label: a.nome }))}
          value={destino.area_id}
          onChange={(v) => onChange({ ...destino, area_id: v, subarea_id: null })}
          placeholder={destino.setor_id ? "Área" : "Setor primeiro"}
          disabled={!destino.setor_id}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">Etapa</Label>
        <Combobox
          options={subareas.map((s) => ({ value: s.id, label: s.nome }))}
          value={destino.subarea_id}
          onChange={(v) => onChange({ ...destino, subarea_id: v })}
          placeholder={destino.area_id ? "Etapa" : "Área primeiro"}
          disabled={!destino.area_id}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">Qtd. aplicada (m³)</Label>
        <Input
          type="number"
          step="any"
          min={0}
          value={destino.quantidade_m3_aplicada ?? ""}
          onChange={(e) => onChange({ ...destino, quantidade_m3_aplicada: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-2 flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Observação</Label>
          <Input
            value={destino.observacao}
            onChange={(e) => onChange({ ...destino, observacao: e.target.value })}
          />
        </div>
        {onRemove && (
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={onRemove} title="Remover destino">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
