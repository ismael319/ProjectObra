import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth-context'
import { ProjectStoreProvider } from '@/lib/project-store'
import { ProjectProvider } from '@/lib/project-context'
import { ThemeProvider } from '@/lib/theme-context'
import ProtectedRoute from '@/components/ProtectedRoute'
import SessionOnlyRoute from '@/components/SessionOnlyRoute'
import RequireModulo from '@/components/RequireModulo'
import RequirePapel from '@/components/RequirePapel'

const queryClient = new QueryClient()

const Home = lazy(() => import('@/pages/Home'))
const Login = lazy(() => import('@/pages/Login'))
const Signup = lazy(() => import('@/pages/Signup'))
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'))
const UpdatePassword = lazy(() => import('@/pages/UpdatePassword'))
const DashboardLayout = lazy(() => import('@/pages/DashboardLayout'))
const DashboardHome = lazy(() => import('@/pages/DashboardHome'))
const SCurve = lazy(() => import('@/pages/SCurve'))
const GanttChart = lazy(() => import('@/pages/GanttChart'))
const HistogramaMO = lazy(() => import('@/pages/histograma-mo/HistogramaMO'))
const DailyProgramming = lazy(() => import('@/pages/DailyProgramming'))
const Occurrences = lazy(() => import('@/pages/Occurrences'))
const ProjectSelection = lazy(() => import('@/pages/ProjectSelection'))
const Activities = lazy(() => import('@/pages/Activities'))
const Profile = lazy(() => import('@/pages/Profile'))
const ExportarDados = lazy(() => import('@/pages/ExportarDados'))
const ExcluirConta = lazy(() => import('@/pages/ExcluirConta'))
const PendingApproval = lazy(() => import('@/pages/PendingApproval'))
const UserApprovalManagement = lazy(() => import('@/pages/UserApprovalManagement'))
const PlatformAdmin = lazy(() => import('@/pages/admin/PlatformAdmin'))
const SiengeAlertas = lazy(() => import('@/pages/SiengeAlertas'))
const AdministracaoHome = lazy(() => import('@/pages/administracao/AdministracaoHome'))
const SecurityMonitoring = lazy(() => import('@/pages/admin/SecurityMonitoring'))

// Legal pages
const Privacy = lazy(() => import('@/pages/legal/Privacy'))
const Terms = lazy(() => import('@/pages/legal/Terms'))
const DPA = lazy(() => import('@/pages/legal/DPA'))
const Subprocessors = lazy(() => import('@/pages/legal/Subprocessors'))
const AceitarTermos = lazy(() => import('@/pages/AceitarTermos'))
const ImportarEfetivo = lazy(() => import('@/pages/administracao/ImportarEfetivo'))
const ImportarPonto = lazy(() => import('@/pages/administracao/ImportarPonto'))

// Qualidade
const ConcretoCadastro = lazy(() => import('@/pages/qualidade/concreto/Cadastro'))
const ConcretoLancamento = lazy(() => import('@/pages/qualidade/concreto/Lancamento'))
const ConcretoDashboard = lazy(() => import('@/pages/qualidade/concreto/Dashboard'))
const ConcretoImportarHistorico = lazy(() => import('@/pages/qualidade/concreto/ImportarHistorico'))
const ConcretoConsulta = lazy(() => import('@/pages/qualidade/concreto/Consulta'))
const ConcretoEnsaios = lazy(() => import('@/pages/qualidade/concreto/Ensaios'))
const ConcretoImportarEnsaios = lazy(() => import('@/pages/qualidade/concreto/ImportarEnsaios'))

// Segurança / RDR
const RdrHome = lazy(() => import('@/pages/seguranca/RdrHome'))
const RdrDashboard = lazy(() => import('@/pages/seguranca/RdrDashboard'))
const RdrForm = lazy(() => import('@/pages/seguranca/RdrForm'))
const RdrRegistros = lazy(() => import('@/pages/seguranca/RdrRegistros'))

// Apontamento pages
const ApontamentoLancamento = lazy(() => import('@/pages/apontamento/Lancamento'))
const ApontamentoValidacao = lazy(() => import('@/pages/apontamento/Validacao'))
const ApontamentoConsulta = lazy(() => import('@/pages/apontamento/Consulta'))
const ApontamentoDashboard = lazy(() => import('@/pages/apontamento/Dashboard'))
const ApontamentoEvolucao = lazy(() => import('@/pages/apontamento/Evolucao'))
const ApontamentoExportar = lazy(() => import('@/pages/apontamento/Exportar'))
const ApontamentoCadastro = lazy(() => import('@/pages/apontamento/Cadastro'))
const ApontamentoEap = lazy(() => import('@/pages/apontamento/EAP'))
const ApontamentoEapCronograma = lazy(() => import('@/pages/apontamento/EapCronograma'))
const ApontamentoImportarXml = lazy(() => import('@/pages/apontamento/ImportarXML'))
const ApontamentoImportarEap = lazy(() => import('@/pages/apontamento/ImportarEAP'))
const MapaChuvas = lazy(() => import('@/pages/apontamento/MapaChuvas'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <ProjectStoreProvider>
            <ProjectProvider>
              <Toaster richColors position="top-right" />
              <BrowserRouter>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/signup" element={<Signup />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/update-password" element={<UpdatePassword />} />

                    <Route path="/legal/privacy" element={<Privacy />} />
                    <Route path="/legal/terms" element={<Terms />} />
                    <Route path="/legal/dpa" element={<DPA />} />
                    <Route path="/legal/subprocessors" element={<Subprocessors />} />

                    <Route
                      path="/aceitar-termos"
                      element={
                        <SessionOnlyRoute>
                          <AceitarTermos />
                        </SessionOnlyRoute>
                      }
                    />

                    <Route
                      path="/aguardando-aprovacao"
                      element={
                        <SessionOnlyRoute>
                          <PendingApproval />
                        </SessionOnlyRoute>
                      }
                    />

                    <Route
                      path="/"
                      element={
                        <ProtectedRoute>
                          <Home />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/projects"
                      element={
                        <ProtectedRoute>
                          <ProjectSelection />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute>
                          <PlatformAdmin />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <Profile />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile/dados"
                      element={
                        <ProtectedRoute>
                          <ExportarDados />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile/excluir"
                      element={
                        <ProtectedRoute>
                          <ExcluirConta />
                        </ProtectedRoute>
                      }
                    />

                    <Route
                      path="/dashboard"
                      element={
                        <ProtectedRoute>
                          <DashboardLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<DashboardHome />} />
                      <Route path="activities" element={<Activities />} />
                      <Route path="planning" element={<RequireModulo modulo="engenharia"><SCurve /></RequireModulo>} />
                      <Route path="gantt" element={<RequireModulo modulo="engenharia"><GanttChart /></RequireModulo>} />
                      <Route path="histograma-mo" element={<RequireModulo modulo="engenharia"><HistogramaMO /></RequireModulo>} />
                      <Route path="daily" element={<RequireModulo modulo="engenharia"><DailyProgramming /></RequireModulo>} />
                      <Route path="occurrences" element={<RequireModulo modulo="engenharia"><Occurrences /></RequireModulo>} />
                      <Route path="people" element={<RequireModulo modulo="engenharia"><ApontamentoDashboard /></RequireModulo>} />
                      <Route path="people/lancamento" element={<RequireModulo modulo="engenharia"><ApontamentoLancamento /></RequireModulo>} />
                      <Route path="people/validacao" element={<RequireModulo modulo="engenharia"><ApontamentoValidacao /></RequireModulo>} />
                      <Route path="people/consulta" element={<RequireModulo modulo="engenharia"><ApontamentoConsulta /></RequireModulo>} />
                      <Route path="people/resumo" element={<RequireModulo modulo="engenharia"><ApontamentoDashboard /></RequireModulo>} />
                      <Route path="people/evolucao" element={<RequireModulo modulo="engenharia"><ApontamentoEvolucao /></RequireModulo>} />
                      <Route path="people/exportar" element={<RequireModulo modulo="engenharia"><ApontamentoExportar /></RequireModulo>} />
                      <Route path="people/cadastro" element={<RequireModulo modulo="engenharia"><ApontamentoCadastro /></RequireModulo>} />
                      <Route path="people/eap" element={<RequireModulo modulo="engenharia"><ApontamentoEap /></RequireModulo>} />
                      <Route path="people/cronograma" element={<RequireModulo modulo="engenharia"><ApontamentoEapCronograma /></RequireModulo>} />
                      <Route path="people/importar-xml" element={<RequireModulo modulo="engenharia"><ApontamentoImportarXml /></RequireModulo>} />
                      <Route path="people/importar-eap" element={<RequireModulo modulo="engenharia"><ApontamentoImportarEap /></RequireModulo>} />
                      <Route path="mapa-chuvas" element={<RequireModulo modulo="engenharia"><MapaChuvas /></RequireModulo>} />
                      <Route path="suprimentos" element={<RequireModulo modulo="suprimentos"><SiengeAlertas /></RequireModulo>} />
                      <Route path="administracao" element={<RequireModulo modulo="administracao"><AdministracaoHome /></RequireModulo>} />
                      <Route path="administracao/importar-efetivo" element={<RequireModulo modulo="administracao"><ImportarEfetivo /></RequireModulo>} />
                      <Route path="administracao/importar-ponto" element={<RequireModulo modulo="administracao"><ImportarPonto /></RequireModulo>} />
                      <Route path="qualidade/concreto/cadastro" element={<RequireModulo modulo="qualidade"><ConcretoCadastro /></RequireModulo>} />
                      <Route path="qualidade/concreto/lancamento" element={<RequireModulo modulo="qualidade"><ConcretoLancamento /></RequireModulo>} />
                      <Route path="qualidade/concreto/dashboard" element={<RequireModulo modulo="qualidade"><ConcretoDashboard /></RequireModulo>} />
                      <Route path="qualidade/concreto/importar-historico" element={<RequireModulo modulo="qualidade"><ConcretoImportarHistorico /></RequireModulo>} />
                      <Route path="qualidade/concreto/consulta" element={<RequireModulo modulo="qualidade"><ConcretoConsulta /></RequireModulo>} />
                      <Route path="qualidade/concreto/ensaios" element={<RequireModulo modulo="qualidade"><ConcretoEnsaios /></RequireModulo>} />
                      <Route path="qualidade/concreto/ensaios/importar" element={<RequireModulo modulo="qualidade"><ConcretoImportarEnsaios /></RequireModulo>} />
                      <Route path="seguranca" element={<RequireModulo modulo="seguranca"><RdrHome /></RequireModulo>} />
                      <Route path="seguranca/dashboard" element={<RequireModulo modulo="seguranca"><RdrDashboard /></RequireModulo>} />
                      <Route path="seguranca/novo" element={<RequireModulo modulo="seguranca"><RdrForm /></RequireModulo>} />
                      <Route path="seguranca/registros" element={<RequireModulo modulo="seguranca"><RdrRegistros /></RequireModulo>} />
                      <Route path="seguranca/registros/:id" element={<RequireModulo modulo="seguranca"><RdrForm /></RequireModulo>} />
                      <Route path="admin/users" element={<RequireModulo modulo="sistema"><UserApprovalManagement /></RequireModulo>} />
                      <Route path="admin/seguranca" element={<RequirePapel papeis={[]}><SecurityMonitoring /></RequirePapel>} />
                    </Route>

                    <Route path="*" element={<Navigate to="/projects" replace />} />
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </ProjectProvider>
          </ProjectStoreProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
