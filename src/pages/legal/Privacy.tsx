import { Link } from 'react-router-dom'
import { Shield, ArrowLeft } from 'lucide-react'
import fgiLogo from '@/assets/fgi-logo.png'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link to="/login" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-8 transition">
          <ArrowLeft size={18} />
          Voltar para o login
        </Link>

        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-600 rounded-xl p-2">
              <img src={fgiLogo} alt="SIGA SOLUÇÕES" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Política de Privacidade</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Versão 1.0 — vigente desde 29/07/2026</p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 dark:text-gray-300">
              A <strong>SIGA SOLUÇÕES</strong> tem o compromisso de proteger a privacidade e os dados pessoais de seus
              usuários e clientes. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos
              suas informações, em total conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">1. Dados Coletados e Base Legal</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Para operar a plataforma e fornecer nossos serviços de gerenciamento de portfólios de obras, coletamos as
              seguintes categorias de dados, amparados pelas bases legais previstas no art. 7º da LGPD:
            </p>

            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Dados de Cadastro do Usuário</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Nome completo, e-mail corporativo, número de telefone, cargo, senha de acesso criptografada e dados da
                  empresa contratante (Razão Social, CNPJ, endereço).
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Base legal: execução de contrato (art. 7º, V)
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Dados de Navegação e Auditoria</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Endereço IP, tipo de navegador, registros de acesso (logs) de data/hora e ações realizadas dentro do
                  sistema para fins de segurança, estabilidade e prevenção a fraudes.
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Base legal: legítimo interesse (art. 7º, IX) e cumprimento de obrigação legal de guarda de logs
                  (Marco Civil da Internet, art. 15)
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Dados de Terceiros Inseridos na Plataforma</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Informações inseridas ativamente pelo cliente no preenchimento de Relatórios Diários de Obra (RDOs),
                  cronogramas e gestão de mão de obra (como nome de colaboradores, prestadores de serviços, terceirizados,
                  funções e registros de frequência).
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Base legal: tratamento como Operador, conforme instrução do Cliente Controlador (art. 39)
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Dados armazenados localmente (Modo Offline / PWA)</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Quando o usuário utiliza o aplicativo SIGA SOLUÇÕES (PWA), uma cópia funcional de dados de projetos,
                  colaboradores, apontamentos pendentes e fila de sincronização é armazenada localmente (IndexedDB / cache
                  do navegador) para permitir a operação sem conexão. Esses dados permanecem no dispositivo até o logout,
                  limpeza de dados do aplicativo/navegador ou desinstalação.
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Base legal: execução de contrato (art. 7º, V) e legítimo interesse na continuidade operacional em campo
                  (art. 7º, IX)
                </p>
              </div>
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">2. Finalidade do Tratamento de Dados</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Utilizamos os dados coletados estritamente para as seguintes finalidades:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300">
              <li>Viabilizar o acesso, autenticação e a operação regular das ferramentas da plataforma</li>
              <li>Enviar comunicações operacionais importantes sobre o sistema, alertas de prazos de obras e avisos de manutenção programada</li>
              <li>Prestar suporte técnico especializado e responder a chamados de ajuda abertos pelos usuários</li>
              <li>Garantir a segurança da informação, auditoria interna de acessos e prevenção contra incidentes</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">3. Papel na LGPD (Controlador vs. Operador)</h2>
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Como Controladora</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  A SIGA SOLUÇÕES atua como controladora estritamente em relação aos dados cadastrais dos seus usuários
                  diretos (dados necessários para a criação da conta, login e controle de acesso).
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 dark:text-white">Como Operadora</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  Em relação a todos os dados de obras, relatórios, cronogramas e dados de colaboradores inseridos pelos
                  clientes na plataforma, a SIGA SOLUÇÕES atua exclusivamente como Operadora dos dados. A responsabilidade
                  legal pela coleta, veracidade, qualidade e base legal adequada para o tratamento desses dados é
                  integralmente do Cliente (que figura como Controlador).
                </p>
              </div>
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">4. Compartilhamento e Transferência Internacional de Dados</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              A SIGA SOLUÇÕES não vende, aluga ou comercializa dados pessoais com terceiros. Para viabilizar a operação
              da plataforma com alta disponibilidade, segurança e performance, os dados são compartilhados com parceiros
              tecnológicos estratégicos:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300">
              <li><strong>Supabase (AWS - EUA)</strong>: Banco de dados principal, autenticação e armazenamento de arquivos</li>
              <li><strong>Vercel (Cloudflare + AWS - Global)</strong>: Hospedagem e infraestrutura de borda</li>
              <li><strong>Groq Cloud (EUA)</strong>: Processamento de inteligência artificial (chat assistant)</li>
            </ul>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              A lista completa e atualizada de sub-processadores está disponível em{' '}
              <Link to="/legal/subprocessors" className="text-blue-600 hover:underline">/legal/subprocessors</Link>.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">5. Segurança da Informação</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Adotamos práticas rigorosas para proteger a integridade, confidencialidade e disponibilidade dos dados:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300">
              <li><strong>Controle de Acesso</strong>: Autenticação via Supabase Auth com senhas criptografadas (bcrypt)</li>
              <li><strong>Segurança em Nível de Linha (RLS)</strong>: Políticas restritivas no PostgreSQL que isolam dados entre organizações</li>
              <li><strong>RBAC</strong>: Controle de acesso baseado em papéis (edição, visualização, inserção pontual)</li>
              <li><strong>Criptografia em Trânsito</strong>: Todo o tráfego é protegido por SSL/TLS (Vercel + Supabase)</li>
              <li><strong>Criptografia em Repouso</strong>: Dados armazenados com criptografia nos servidores dos provedores de nuvem</li>
              <li><strong>Isolamento Lógico</strong>: Mecanismos de RLS garantem que cada organização vê apenas seus próprios dados</li>
              <li><strong>Auditoria de Aprovações</strong>: Todas as decisões de aprovação/rejeição de usuários são registradas com identificação do responsável</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">6. Retenção e Exclusão de Dados</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-900">
                    <th className="text-left p-3 font-semibold text-gray-900 dark:text-white border">Categoria</th>
                    <th className="text-left p-3 font-semibold text-gray-900 dark:text-white border">Prazo</th>
                    <th className="text-left p-3 font-semibold text-gray-900 dark:text-white border">Justificativa</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Dados cadastrais e operacionais</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Enquanto a conta estiver ativa</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Execução do contrato</td>
                  </tr>
                  <tr>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Dados após encerramento da conta</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Exclusão em até 30 dias</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Período de tolerância para exportação</td>
                  </tr>
                  <tr>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Logs de auditoria e acesso</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">180 dias</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Marco Civil da Internet (art. 15)</td>
                  </tr>
                  <tr>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Backups automáticos</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Até 30 dias (máx. 3 versões)</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Continuidade operacional</td>
                  </tr>
                  <tr>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Notificações internas</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">90 dias</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Limpeza operacional</td>
                  </tr>
                  <tr>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Links temporários de exportação</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">7 dias</td>
                    <td className="p-3 border text-gray-600 dark:text-gray-300">Segurança da informação</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
              <p className="text-sm text-yellow-800">
                <strong>Nota sobre exclusão:</strong> Ao solicitar o encerramento definitivo da conta, o cliente possui
                o prazo de 30 dias para exportar seus dados. Após este período, a remoção de toda a base de dados de
                produção e backups é definitiva e irreversível, exceto pela guarda de logs exigida pelo Marco Civil da
                Internet (180 dias).
              </p>
            </div>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">7. Direitos dos Titulares</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              A qualquer momento, os usuários e titulares de dados podem solicitar à SIGA SOLUÇÕES:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300">
              <li>Confirmação da existência de tratamento e acesso aos seus dados cadastrais</li>
              <li>Correção de dados incompletos, inexatos ou desatualizados</li>
              <li>Eliminação dos dados pessoais tratados com base no consentimento ou cadastros diretos</li>
              <li>Portabilidade dos dados a outro fornecedor de serviço</li>
            </ul>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              As solicitações serão respondidas no prazo legal, mediante validação prévia da identidade do requisitante.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">8. Contato e Encarregado de Dados (DPO)</h2>
            <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
              <p className="text-gray-600 dark:text-gray-300">
                Para exercer seus direitos de titular, tirar dúvidas ou realizar requisições sobre como os dados são
                tratados na SIGA SOLUÇÕES, utilize exclusivamente os canais oficiais abaixo:
              </p>
              <div className="mt-3 space-y-2">
                <p className="text-sm">
                  <strong className="text-gray-900 dark:text-white">DPO / Encarregado:</strong>{' '}
                  <a href="mailto:dpo@fgidecision.com.br" className="text-blue-600 hover:underline">dpo@fgidecision.com.br</a>
                  <br />
                  <span className="text-gray-500 dark:text-gray-400">— direitos do titular (LGPD), requisições legais e contratos</span>
                </p>
                <p className="text-sm">
                  <strong className="text-gray-900 dark:text-white">Suporte Técnico:</strong>{' '}
                  <a href="mailto:suporte@fgidecision.com.br" className="text-blue-600 hover:underline">suporte@fgidecision.com.br</a>
                  <br />
                  <span className="text-gray-500 dark:text-gray-400">— dúvidas de uso, incidentes técnicos e auxílio na exportação de dados</span>
                </p>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <Shield size={16} />
                <span>Esta política está em conformidade com a Lei nº 13.709/2018 (LGPD)</span>
              </div>
              <div className="flex gap-4 mt-4">
                <Link to="/legal/terms" className="text-sm text-blue-600 hover:underline">Termos de Uso</Link>
                <Link to="/legal/dpa" className="text-sm text-blue-600 hover:underline">DPA</Link>
                <Link to="/legal/subprocessors" className="text-sm text-blue-600 hover:underline">Sub-processadores</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
