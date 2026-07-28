import { CadastroPage } from "./components/CadastroPage";

export default function CadEmpresas() {
  return (
    <CadastroPage
      title="Empresas"
      description="Empresas executantes da obra"
      table="empresas"
      fields={[{ key: "nome", label: "Nome", type: "text", required: true }]}
    />
  );
}
