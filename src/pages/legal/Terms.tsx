import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import fgiLogo from '@/assets/fgi-logo.png'

export default function Terms() {
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Termos de Uso</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Versão 1.0 — vigente desde 29/07/2026</p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 dark:text-gray-300">
              Bem-vindo(a) à <strong>SIGA SOLUÇÕES</strong>. Ao criar uma conta ou utilizar esta plataforma, você
              concorda integralmente com os termos abaixo. Leia com atenção.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">1. Objeto</h2>
            <p className="text-gray-600 dark:text-gray-300">
              A SIGA SOLUÇÕES é uma plataforma SaaS (Software as a Service) de gerenciamento de portfólios de obras,
              fornecendo ferramentas para controle de cronogramas, Curva S, mão de obra, Relatórios Diários de Obra
              (RDOs), indicadores, dashboards executivos e registros de segurança do trabalho.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">2. Cadastro e Responsabilidades do Usuário</h2>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300">
              <li>Você é integralmente responsável pela veracidade, integridade e atualização dos dados informados no cadastro</li>
              <li>É terminantemente proibido compartilhar credenciais de acesso (usuário e senha) ou tentar acessar dados, projetos e informações de outras empresas clientes</li>
              <li>O uso indevido da plataforma — incluindo, mas não se limitando a práticas de scraping, ataques de força bruta, engenharia reversa ou tentativas de burlar a segurança do sistema — acarretará a suspensão imediata da conta, sem prejuízo das perdas e danos cabíveis</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">3. Disponibilidade e Manutenção</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Buscamos manter a plataforma disponível 24 horas por dia, 7 dias por semana. No entanto, não garantimos a
              ausência total de interrupções programadas para manutenção, atualizações de segurança, evolução do sistema
              ou correção de incidentes. Eventuais indisponibilidades técnicas temporárias não geram direito a
              indenizações, descontos ou abatimentos nos valores das assinaturas.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">4. Propriedade Intelectual e Uso de Dados</h2>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300">
              <li>Todos os dados, arquivos e informações inseridos na plataforma pertencem exclusivamente ao cliente</li>
              <li>O código-fonte, a marca, a identidade visual, o design e a arquitetura da plataforma pertencem estritamente à SIGA SOLUÇÕES</li>
              <li>O cliente autoriza a SIGA SOLUÇÕES a utilizar os dados inseridos de forma agregada e totalmente anonimizada para fins estatísticos, estudos de mercado e melhorias nos algoritmos da plataforma</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">5. Limitação de Responsabilidade</h2>
            <p className="text-gray-600 dark:text-gray-300">
              As decisões de engenharia, contratuais, operacionais ou financeiras tomadas com base nos relatórios,
              gráficos e indicadores gerados pelo sistema são de responsabilidade exclusiva do cliente. A SIGA SOLUÇÕES é
              uma ferramenta de apoio gerencial e não substitui a análise técnica, a responsabilidade técnica (ART/RRT)
              ou o julgamento profissional do usuário. Em nenhuma hipótese a responsabilidade financeira total da
              SIGA SOLUÇÕES por danos decorrentes do uso do software excederá o valor equivalente aos últimos 3 (três)
              meses de assinatura pagos pelo cliente.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">6. Proteção de Dados (LGPD)</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Ao inserir dados pessoais na plataforma (como nome, CPF e dados de contato de colaboradores, terceirizados
              ou fornecedores), o usuário declara que possui base legal válida e adequada para fazê-lo, figurando a
              SIGA SOLUÇÕES estritamente como operadora desses dados nos termos da Lei Geral de Proteção de Dados
              (LGPD — Lei nº 13.709/2018).
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">7. Planos, Pagamento e Inadimplência</h2>
            <p className="text-gray-600 dark:text-gray-300">
              O acesso às funcionalidades da plataforma está condicionado ao pagamento regular do plano contratado.
              O atraso no pagamento por período superior a 30 dias ensejará a suspensão imediata do acesso à plataforma
              até a regularização do débito. Os valores dos planos poderão ser reajustados anualmente com base na
              variação do IPCA/IBGE.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">8. Cancelamento e Exclusão Definitiva de Dados</h2>
            <p className="text-gray-600 dark:text-gray-300">
              O usuário pode solicitar o cancelamento da assinatura a qualquer momento. Em caso de cancelamento ou
              rescisão contratual, as informações do portfólio de obras permanecerão disponíveis para exportação pelo
              prazo improrrogável de 30 (trinta) dias a contar do término do acesso. Decorrido este prazo, a
              SIGA SOLUÇÕES realizará a exclusão permanente e irreversível de todos os dados de seus servidores de
              produção e de backup.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">9. Backups e Exportação de Arquivos</h2>
            <p className="text-gray-600 dark:text-gray-300">
              A plataforma disponibiliza ferramentas automáticas e manuais para cópia e segurança dos dados estruturados
              dos projetos. A SIGA SOLUÇÕES realiza rotinas automatizadas e periódicas de backup, mantendo um limite
              histórico de versões. Recomenda-se que o usuário realize o download e o arquivamento seguro e periódico
              de suas informações.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">10. Aplicativo Instalável (PWA) e Modo Offline</h2>
            <p className="text-gray-600 dark:text-gray-300">
              A SIGA SOLUÇÕES pode ser instalada como aplicativo (PWA) em dispositivos móveis e desktops compatíveis,
              permitindo o uso do apontador offline mesmo sem conexão de internet. Ao utilizar o aplicativo instalado
              e/ou o modo offline, o usuário declara estar ciente de que:
            </p>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300 mt-2">
              <li>Dados de projetos, colaboradores e apontamentos são armazenados localmente no dispositivo (IndexedDB / cache), permanecendo até logout, limpeza manual ou desinstalação</li>
              <li>A guarda física do dispositivo, o controle de acesso e a proteção contra perda, furto ou acesso por terceiros são de responsabilidade exclusiva do usuário</li>
              <li>Apontamentos offline são sincronizados automaticamente quando a conexão for restabelecida; em caso de edições simultâneas, prevalecerá a última sincronização recebida pelo servidor</li>
              <li>A SIGA SOLUÇÕES não se responsabiliza por divergências ou perdas decorrentes de falhas no dispositivo do usuário ou limpeza de cache</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">11. Alterações Nestes Termos</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Alterações materiais e significativas nestes Termos de Uso serão comunicadas previamente através do e-mail
              cadastrado pelo usuário e exigirão um novo aceite eletrônico no primeiro acesso à plataforma após a
              modificação.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">12. Foro</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Fica eleito o foro da comarca de [SUA CIDADE/UF] para dirimir quaisquer dúvidas, controvérsias ou
              litígios oriundos do uso da plataforma ou da interpretação destes Termos de Uso, com renúncia expressa a
              qualquer outro, por mais privilegiado que seja.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">13. Canais Oficiais de Contato</h2>
            <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
              <p className="text-sm">
                <strong className="text-gray-900 dark:text-white">Comercial e jurídico:</strong>{' '}
                <a href="mailto:contato@fgidecision.com.br" className="text-blue-600 hover:underline">contato@fgidecision.com.br</a>
                <br />
                <span className="text-gray-500 dark:text-gray-400">— propostas comerciais, contratos e notificações legais</span>
              </p>
              <p className="text-sm mt-2">
                <strong className="text-gray-900 dark:text-white">Suporte técnico:</strong>{' '}
                <a href="mailto:suporte@fgidecision.com.br" className="text-blue-600 hover:underline">suporte@fgidecision.com.br</a>
                <br />
                <span className="text-gray-500 dark:text-gray-400">— dúvidas de uso, incidentes técnicos e falhas operacionais</span>
              </p>
              <p className="text-sm mt-2">
                <strong className="text-gray-900 dark:text-white">DPO / Encarregado:</strong>{' '}
                <a href="mailto:dpo@fgidecision.com.br" className="text-blue-600 hover:underline">dpo@fgidecision.com.br</a>
                <br />
                <span className="text-gray-500 dark:text-gray-400">— direitos dos titulares (LGPD) e requisições de privacidade</span>
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-4">
                <Link to="/legal/privacy" className="text-sm text-blue-600 hover:underline">Política de Privacidade</Link>
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
