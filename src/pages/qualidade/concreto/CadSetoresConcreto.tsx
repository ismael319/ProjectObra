import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CadastroPage } from "@/components/CadastroPage";
import { useAuth } from "@/lib/auth-context";
import { seedSetoresAreasConcretoDoApontamento } from "./lib/catalog";

// Setores do Lançamento de Concreto — catálogo próprio por organização,
// separado dos setores globais do Apontamento de efetivo (ver
// 20260807060000_concreto-setores-areas-migration.sql). O botão "Copiar do
// Apontamento" traz as opções existentes pra dentro do Concreto de uma vez
// (setores e áreas juntos); depois, cada módulo edita os próprios nomes.
export default function CadSetoresConcreto() {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const [copiando, setCopiando] = useState(false);

  async function handleCopiar() {
    if (!organizacaoId) return;
    setCopiando(true);
    try {
      await seedSetoresAreasConcretoDoApontamento(organizacaoId);
      toast.success("Setores e Áreas copiados do Apontamento.");
      qc.invalidateQueries({ queryKey: ["cadastro", "setores_concreto"] });
      qc.invalidateQueries({ queryKey: ["cadastro", "areas_concreto"] });
      qc.invalidateQueries({ queryKey: ["setores_concreto"] });
      qc.invalidateQueries({ queryKey: ["areas_concreto"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCopiando(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopiar}
          disabled={copiando || !organizacaoId}
          title="Copia os Setores e Áreas atuais do Apontamento para o catálogo do Concreto"
        >
          {copiando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Copiar do Apontamento
        </Button>
      </div>
      <CadastroPage
        title="Setores"
        description="Setores do lançamento de concreto — catálogo próprio, separado do Apontamento de efetivo"
        table="setores_concreto"
        fields={[{ key: "nome", label: "Nome", type: "text", required: true }]}
        organizacaoScoped
        timestamps={false}
        blockRefs={[
          { table: "areas_concreto", fk: "setor_concreto_id", label: "áreas" },
          { table: "destinos_carga", fk: "setor_concreto_id", label: "lançamentos de concreto" },
        ]}
        moduloKey="qualidade"
      />
    </div>
  );
}
