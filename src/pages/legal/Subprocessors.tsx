import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import fgiLogo from '@/assets/fgi-logo.png'

const subprocessors = [
  {
    name: 'Supabase (PostgreSQL)',
    purpose: 'Banco de dados principal, autenticação e armazenamento de arquivos',
    location: 'AWS — EUA (us-east-1)',
    website: 'https://supabase.com',
  },
  {
    name: 'Google Cloud / Firebase',
    purpose: 'Armazenamento de registros de segurança do trabalho (RDR) e documentação',
    location: 'EUA (us-central1)',
    website: 'https://firebase.google.com',
  },
  {
    name: 'Vercel Inc.',
    purpose: 'Hospedagem da aplicação frontend, infraestrutura de borda e CDN',
    location: 'Rede global / AWS — EUA',
    website: 'https://vercel.com',
  },
  {
    name: 'Groq Cloud',
    purpose: 'Processamento de inteligência artificial para assistente de chat',
    location: 'EUA',
    website: 'https://groq.com',
  },
  {
    name: 'Cloudflare Inc.',
    purpose: 'CDN, WAF e mitigação de DDoS',
    location: 'Rede global / EUA',
    website: 'https://cloudflare.com',
  },
  {
    name: 'Auth0 / Supabase Auth',
    purpose: 'Autenticação e gerenciamento de identidade',
    location: 'EUA',
    website: 'https://supabase.com/auth',
  },
]

export default function Subprocessors() {
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link to="/login" className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-8 transition">
          <ArrowLeft size={18} />
          Voltar para o login
        </Link>

        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-600 rounded-xl p-2">
              <img src={fgiLogo} alt="FGI Decision" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Sub-processadores</h1>
              <p className="text-sm text-gray-500">Versão 1.0 — vigente desde 29/07/2026</p>
            </div>
          </div>

          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 mb-6">
              Esta página lista os sub-processadores contratados pela <strong>FGI Decision</strong> para viabilizar o
              funcionamento da plataforma. O uso destes parceiros pode configurar transferência internacional de dados,
              em conformidade com o art. 33 da LGPD.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left p-3 font-semibold text-gray-900 border">Sub-processador</th>
                    <th className="text-left p-3 font-semibold text-gray-900 border">Finalidade</th>
                    <th className="text-left p-3 font-semibold text-gray-900 border">Localização</th>
                  </tr>
                </thead>
                <tbody>
                  {subprocessors.map((sp) => (
                    <tr key={sp.name}>
                      <td className="p-3 border text-gray-900 font-medium">
                        {sp.website ? (
                          <a href={sp.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                            {sp.name}
                          </a>
                        ) : (
                          sp.name
                        )}
                      </td>
                      <td className="p-3 border text-gray-600">{sp.purpose}</td>
                      <td className="p-3 border text-gray-600">{sp.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">Notificação de Alterações</h2>
            <p className="text-gray-600">
              Caso a FGI Decision contrate novo sub-processador ou substitua um existente, esta página será atualizada
              com antecedência mínima de 30 dias. Clientes que desejarem ser notificados ativamente podem solicitar
              inclusão na lista via{' '}
              <a href="mailto:dpo@fgidecision.com.br" className="text-blue-600 hover:underline">dpo@fgidecision.com.br</a>.
            </p>

            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="flex gap-4">
                <Link to="/legal/privacy" className="text-sm text-blue-600 hover:underline">Política de Privacidade</Link>
                <Link to="/legal/terms" className="text-sm text-blue-600 hover:underline">Termos de Uso</Link>
                <Link to="/legal/dpa" className="text-sm text-blue-600 hover:underline">DPA</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
