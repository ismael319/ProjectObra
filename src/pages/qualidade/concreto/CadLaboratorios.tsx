import { CadastroPage } from "@/components/CadastroPage";

export default function CadLaboratorios() {
  return (
    <CadastroPage
      title="Laboratórios"
      description="Laboratórios responsáveis pelos ensaios de compressão axial dos corpos de prova"
      table="laboratorios"
      fields={[
        { key: "nome", label: "Nome", type: "text", required: true },
        { key: "cnpj", label: "CNPJ", type: "text" },
        { key: "contato", label: "Contato", type: "text" },
        { key: "telefone", label: "Telefone", type: "text" },
        { key: "email", label: "E-mail", type: "text" },
      ]}
      extraColumns={[{ key: "cnpj", label: "CNPJ" }]}
      organizacaoScoped
      projetoScoped
      timestamps={false}
      blockRefs={[{ table: "corpos_prova", fk: "laboratorio_id", label: "corpos de prova" }]}
      moduloKey="qualidade"
    />
  );
}
