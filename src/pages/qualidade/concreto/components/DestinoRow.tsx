import { useAuth } from "@/lib/auth-context";
import { useEtapasConcreto, useSetoresConcreto, useAreasConcreto } from "../lib/catalog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { X } from "lucide-react";

export type DestinoForm = {
  key: string; // só uso local (key de lista em React) — não vai pro banco
  setor_concreto_id: string | null;
  area_concreto_id: string | null;
  etapa_concreto_id: string | null;
  quantidade_m3_aplicada: number | null;
  observacao: string;
};

export function novoDestino(): DestinoForm {
  return {
    key: crypto.randomUUID(),
    setor_concreto_id: null,
    area_concreto_id: null,
    etapa_concreto_id: null,
    quantidade_m3_aplicada: null,
    observacao: "",
  };
}

// Setor→Área usa o catálogo PRÓPRIO do Concreto (setores_concreto/
// areas_concreto), separado do Apontamento de efetivo — ver
// 20260807060000_concreto-setores-areas-migration.sql. Etapa é outro
// catálogo próprio por organização (etapas_concreto, ver 20260806010000).
// Cada linha de destino chama os hooks pra si mesma, por isso é um componente
// à parte em vez de um loop dentro do formulário principal.
export function DestinoRow({
  destino,
  onChange,
  onRemove,
}: {
  destino: DestinoForm;
  onChange: (d: DestinoForm) => void;
  onRemove?: () => void;
}) {
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const { data: setores = [] } = useSetoresConcreto(organizacaoId);
  const { data: areas = [] } = useAreasConcreto(destino.setor_concreto_id, organizacaoId);
  const { data: etapas = [] } = useEtapasConcreto(organizacaoId);

  return (
    <div className="grid gap-3 sm:grid-cols-6 items-end rounded-md border p-3">
      <div className="space-y-1.5 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">Setor</Label>
        <Combobox
          options={setores.map((s) => ({ value: s.id, label: s.nome }))}
          value={destino.setor_concreto_id}
          onChange={(v) => onChange({ ...destino, setor_concreto_id: v, area_concreto_id: null })}
          placeholder="Setor"
        />
      </div>
      <div className="space-y-1.5 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">Área</Label>
        <Combobox
          options={areas.map((a) => ({ value: a.id, label: a.nome }))}
          value={destino.area_concreto_id}
          onChange={(v) => onChange({ ...destino, area_concreto_id: v })}
          placeholder={destino.setor_concreto_id ? "Área" : "Setor primeiro"}
          disabled={!destino.setor_concreto_id}
        />
      </div>
      <div className="space-y-1.5 sm:col-span-1">
        <Label className="text-xs text-muted-foreground">Etapa</Label>
        <Combobox
          options={etapas.map((e) => ({ value: e.id, label: e.nome }))}
          value={destino.etapa_concreto_id}
          onChange={(v) => onChange({ ...destino, etapa_concreto_id: v })}
          placeholder="Etapa"
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
