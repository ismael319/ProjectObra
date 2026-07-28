import { CadastroPage } from "./components/CadastroPage";

export default function CadSetores() {
  return (
    <CadastroPage
      title="Setores"
      description="Setores da obra (grande estrutura)"
      table="setores"
      fields={[
        { key: "codigo", label: "Código EAP", type: "text" },
        { key: "nome", label: "Nome", type: "text", required: true },
      ]}
    />
  );
}
