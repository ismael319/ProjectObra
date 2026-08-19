import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import fgiLogo from '@/assets/fgi-logo.png'

export default function DPA() {
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Acordo de Tratamento de Dados (DPA)</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Versão 1.0 — vigente desde 29/07/2026</p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 dark:text-gray-300">
              Este instrumento regula a relação entre a <strong>SIGA SOLUÇÕES</strong> (na qualidade de Operadora) e o
              <strong> Cliente Contratante</strong> (na qualidade de Controlador) no tratamento de dados pessoais
              inseridos na plataforma, em estrita conformidade com o art. 39 da Lei Geral de Proteção de Dados
              (LGPD — Lei nº 13.709/2018). Ao criar uma conta e utilizar a plataforma, o Cliente adere automaticamente
              a este Acordo.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">1. Objeto</h2>
            <p className="text-gray-600 dark:text-gray-300">
              A SIGA SOLUÇÕES tratará dados pessoais exclusivamente em nome do Cliente e de acordo com suas instruções
              documentadas, com a finalidade estrita de viabilizar as funcionalidades contratadas da plataforma
              (gerenciamento de RDOs, cronogramas, dashboards, relatórios e gestão operacional de mão de obra).
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">2. Categorias de Dados e Titulares</h2>
            <ul className="list-disc pl-6 space-y-1 text-gray-600 dark:text-gray-300">
              <li><strong>Titulares:</strong> colaboradores (próprios ou terceirizados), prestadores de serviço, fornecedores, engenheiros, planejadores e usuários indicados pelo Cliente</li>
              <li><strong>Dados Pessoais:</strong> informações de identificação (nome, cargo/função), apontamentos de frequência, assinaturas, registros fotográficos de obras e quaisquer outros dados inseridos ativamente na plataforma pelo Cliente</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">3. Obrigações da SIGA SOLUÇÕES (Operadora)</h2>
            <ul className="list-disc pl-6 space-y-2 text-gray-600 dark:text-gray-300">
              <li><strong>Estrito Escopo:</strong> tratar os dados pessoais estritamente conforme as instruções do Cliente e para o cumprimento do contrato principal, abstendo-se de utilizá-los para fins diversos</li>
              <li><strong>Segurança da Informação:</strong> aplicar medidas técnicas e organizacionais adequadas para proteger os dados, incluindo criptografia em trânsito (TLS) e em repouso, isolamento lógico de dados, controle de acesso baseado em papéis (RBAC) e políticas de auditoria</li>
              <li><strong>Notificação de Incidentes:</strong> notificar o Cliente sobre qualquer incidente de segurança confirmado que afete comprovadamente os seus dados em até 72 (setenta e duas) horas após a ciência do evento</li>
              <li><strong>Direitos dos Titulares:</strong> auxiliar o Cliente, na medida do tecnicamente possível, no atendimento às requisições de direitos dos titulares (art. 18 da LGPD)</li>
              <li><strong>Registros:</strong> manter registro das operações de tratamento de dados realizadas em nome do Controlador, conforme o art. 37 da LGPD</li>
            </ul>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">4. Sub-processadores</h2>
            <p className="text-gray-600 dark:text-gray-300">
              O Cliente autoriza a SIGA SOLUÇÕES a engajar sub-processadores terceiros (provedores de infraestrutura de
              nuvem, banco de dados, segurança e autenticação) para a prestação dos serviços. A lista atualizada de
              sub-processadores parceiros está permanentemente disponível em{' '}
              <Link to="/legal/subprocessors" className="text-blue-600 hover:underline">/legal/subprocessors</Link>.
              Eventuais alterações substanciais serão comunicadas com antecedência mínima de 30 dias.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">5. Transferência Internacional de Dados</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Os dados pessoais serão processados em infraestrutura de nuvem dos sub-processadores listados, localizados
              nos Estados Unidos e em rede global de distribuição, o que enseja a transferência internacional de dados
              em conformidade com o art. 33 da LGPD. O Cliente declara-se ciente e autoriza referida transferência para
              fins de viabilidade técnica do SaaS.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">6. Devolução e Eliminação de Dados</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Encerrado o contrato principal por qualquer motivo, o Cliente terá o prazo improrrogável de 30 (trinta)
              dias para exportar seus dados operacionais através das funcionalidades nativas da plataforma. Decorrido
              este prazo, a SIGA SOLUÇÕES eliminará permanentemente todos os dados e cópias dos seus servidores de
              produção e backup, ressalvadas as informações estritamente necessárias para o cumprimento de obrigações
              legais ou regulamentares (como a guarda de logs de acesso por 180 dias exigida pelo Marco Civil da Internet).
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">7. Responsabilidade e Indenização</h2>
            <p className="text-gray-600 dark:text-gray-300">
              O Cliente figura como Controlador dos dados que insere na plataforma, sendo o único e exclusivo
              responsável por garantir a existência de uma base legal válida, pela veracidade, qualidade e pela
              adequação dos dados de terceiros coletados em suas obras.
            </p>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              A SIGA SOLUÇÕES responde civilmente apenas pelos danos causados em virtude do exercício da atividade de
              Operadora, estritamente nos limites do art. 42 da LGPD, e quando descumprir as obrigações contratuais
              acordadas ou as instruções lícitas do Controlador.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">8. Auditoria</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Mediante solicitação formal por escrito com antecedência mínima de 30 (trinta) dias, limitada a 1 (uma)
              requisição por ano contratual, a SIGA SOLUÇÕES disponibilizará ao Cliente evidências documentais,
              relatórios de conformidade ou certificações de seus sub-processadores que demonstrem o cumprimento das
              obrigações deste DPA.
            </p>

            <h2 className="text-xl font-bold text-gray-900 dark:text-white mt-8 mb-4">9. Contato do Encarregado (DPO)</h2>
            <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4">
              <p className="text-gray-600 dark:text-gray-300">
                Para comunicações formais, notificações sobre privacidade ou requisições relacionadas a este Acordo,
                o canal oficial de contato com o Encarregado de Proteção de Dados (DPO) da SIGA SOLUÇÕES é:{' '}
                <a href="mailto:dpo@fgidecision.com.br" className="text-blue-600 hover:underline">dpo@fgidecision.com.br</a>.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex gap-4">
                <Link to="/legal/privacy" className="text-sm text-blue-600 hover:underline">Política de Privacidade</Link>
                <Link to="/legal/terms" className="text-sm text-blue-600 hover:underline">Termos de Uso</Link>
                <Link to="/legal/subprocessors" className="text-sm text-blue-600 hover:underline">Sub-processadores</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
