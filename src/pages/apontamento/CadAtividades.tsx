import { CadastroPage } from "./components/CadastroPage";

export default function CadAtividades() {
  return (
    <CadastroPage
      title="Atividades"
      description="Frentes de trabalho / atividades executadas"
      table="atividades"
      fields={[
        { key: "codigo", label: "Código EAP", type: "text" },
        { key: "nome", label: "Nome", type: "text", required: true },
      ]}
    />
  );
}
