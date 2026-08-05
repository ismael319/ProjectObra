import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CadastroPage } from "@/components/CadastroPage";
import { useAuth } from "@/lib/auth-context";
import { seedEtapasConcretoPadrao } from "./lib/catalog";

// Etapas de aplicação do concreto (RADIER, PILAR, LAJE...) — catálogo próprio
// por organização, independente de Área/Setor (o Lançamento usava a cascata
// Setor→Área→Etapa do Apontamento, o que duplicava a mesma etapa por área).
export default function CadEtapas() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const [seedando, setSeedando] = useState(false);

  async function handleCarregarPadrao() {
    if (!organizacaoId) return;
    setSeedando(true);
    try {
      await seedEtapasConcretoPadrao(organizacaoId);
      toast.success("Lista padrão carregada.");
      qc.invalidateQueries({ queryKey: ["cadastro", "etapas_concreto"] });
      qc.invalidateQueries({ queryKey: ["etapas_concreto"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSeedando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleCarregarPadrao} disabled={seedando || !organizacaoId}>
          {seedando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Lista padrão
        </Button>
      </div>
      <CadastroPage
        title="Etapas"
        description="Etapas de aplicação do concreto — independentes de Setor/Área"
        table="etapas_concreto"
        fields={[{ key: "nome", label: "Nome", type: "text", required: true }]}
        organizacaoScoped
        timestamps={false}
        blockRefs={[{ table: "destinos_carga", fk: "etapa_concreto_id", label: "lançamentos de concreto" }]}
      />
    </div>
  );
}
