import { CadastroPage } from "@/components/CadastroPage";

export default function CadSetores() {
  return (
    <CadastroPage
      title="Setores"
      description="Setores da obra (grande estrutura)"
      table="setores"
      organizacaoScoped
      projetoScoped
      fields={[
        { key: "codigo", label: "Código EAP", type: "text" },
        { key: "nome", label: "Nome", type: "text", required: true },
      ]}
      codigoPrefix="S"
      blockRefs={[
        { table: "areas", fk: "setor_id", label: "áreas" },
        { table: "apontamentos_diarios", fk: "setor_id", label: "apontamentos" },
      ]}
    />
  );
}
