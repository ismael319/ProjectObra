import { CadastroPage } from "@/components/CadastroPage";
import { useAuth } from "@/lib/auth-context";
import { useProjects } from "@/lib/project-store";
import { useSetoresConcreto } from "./lib/catalog";

// Áreas do Lançamento de Concreto — catálogo próprio por obra, dentro de
// cada Setor do Concreto (separado das áreas globais do Apontamento).
export default function CadAreasConcreto() {
  const { userProfile } = useAuth();
  const { currentProject } = useProjects();
  const organizacaoId = userProfile?.organizacao_id ?? undefined;
  const projetoId = currentProject?.id ?? undefined;
  const { data: setores = [] } = useSetoresConcreto(organizacaoId, projetoId, false);
  const setorMap = new Map(setores.map((s) => [s.id, s.nome]));
  return (
    <CadastroPage
      title="Áreas"
      description="Áreas dentro de cada setor do lançamento de concreto"
      table="areas_concreto"
      fields={[
        {
          key: "setor_concreto_id",
          label: "Setor",
          type: "select",
          required: true,
          options: setores.map((s) => ({ value: s.id, label: s.nome })),
        },
        { key: "nome", label: "Nome", type: "text", required: true },
      ]}
      extraColumns={[{ key: "setor_concreto_id", label: "Setor", render: (r) => setorMap.get(r.setor_concreto_id) ?? "—" }]}
      organizacaoScoped
      projetoScoped
      timestamps={false}
      blockRefs={[{ table: "destinos_carga", fk: "area_concreto_id", label: "lançamentos de concreto" }]}
      moduloKey="qualidade"
    />
  );
}
