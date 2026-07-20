import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus, Search, FolderOpen, Calendar, User, Building2,
  MoreVertical, Edit3, Copy, Archive, Trash2, Layers,
  Camera, X,
} from 'lucide-react'
import { useProjects, type Project, type CronogramaInfo } from '@/lib/project-store'
import { useAuth } from '@/lib/auth-context'
import { parseMSProjectXML } from '@/lib/xml-parser'
import CronogramaManager from '@/components/CronogramaManager'
import CronogramaUploadModal from '@/components/CronogramaUploadModal'

const projectSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  localizacao: z.string().min(1, 'Local é obrigatório'),
  empresa: z.string().min(1, 'Cliente é obrigatório'),
  gestor: z.string().min(1, 'Gestor é obrigatório'),
})

type ProjectFormData = z.infer<typeof projectSchema>

export default function ProjectSelection() {
  const { projects, currentProject, setCurrentProject, createProject, updateProject, deleteProject, duplicateProject, archiveProject, addCronograma } = useProjects()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'todos' | 'ativo' | 'inativo' | 'arquivado'>('todos')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [managingProjectId, setManagingProjectId] = useState<string | null>(null)
  const [coverImage, setCoverImage] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ESC para fechar modais
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (managingProjectId) setManagingProjectId(null)
        else if (showForm) { setShowForm(false); setEditingProject(null); reset(); setCoverImage('') }
      }
    }
    if (managingProjectId || showForm) {
      window.addEventListener('keydown', handleKey)
      return () => window.removeEventListener('keydown', handleKey)
    }
  }, [managingProjectId, showForm])

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
  })

  const onSubmit = (data: ProjectFormData) => {
    const projectData = {
      nome: data.nome,
      codigo: `PRJ-${String(projects.length + 1).padStart(3, '0')}`,
      descricao: '',
      status: 'ativo' as const,
      gestor: data.gestor,
      dataInicio: new Date().toISOString(),
      dataFimPrevista: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      empresa: data.empresa,
      localizacao: data.localizacao,
      tipoProjeto: 'Construção',
      orcamento: 0,
      disciplinas: [],
      areas: [],
      equipe: [],
      observacoes: '',
      imagemCapa: coverImage || undefined,
    }

    if (editingProject) {
      updateProject(editingProject.id, {
        nome: data.nome,
        localizacao: data.localizacao,
        empresa: data.empresa,
        gestor: data.gestor,
        imagemCapa: coverImage || undefined,
      })
    } else {
      const newProject = createProject(projectData)
      setCurrentProject(newProject)
    }

    reset()
    setShowForm(false)
    setEditingProject(null)
    setCoverImage('')
  }

  const handleEdit = (project: Project) => {
    setEditingProject(project)
    setValue('nome', project.nome)
    setValue('localizacao', project.localizacao)
    setValue('empresa', project.empresa)
    setValue('gestor', project.gestor)
    setCoverImage(project.imagemCapa || '')
    setShowForm(true)
  }

  const handleDuplicate = (id: string) => {
    duplicateProject(id)
    setMenuOpen(null)
  }

  const handleArchive = (id: string) => {
    archiveProject(id)
    setMenuOpen(null)
  }

  const handleDelete = (id: string) => {
    if (confirm('Tem certeza que deseja deletar este projeto?')) {
      deleteProject(id)
    }
    setMenuOpen(null)
  }

  const openProject = (project: Project) => {
    setCurrentProject(project)
    navigate('/dashboard')
  }

  const openManager = (project: Project) => {
    setCurrentProject(project)
    setManagingProjectId(project.id)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5MB')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCoverImage(ev.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setCoverImage('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUploadFromManager = (cronograma: CronogramaInfo) => {
    if (managingProjectId) {
      addCronograma(managingProjectId, cronograma)
    }
  }

  const filteredProjects = projects.filter((p) => {
    if (filterStatus !== 'todos' && p.status !== filterStatus) return false
    if (search) {
      const s = search.toLowerCase()
      return p.nome.toLowerCase().includes(s) || p.codigo.toLowerCase().includes(s) || p.empresa.toLowerCase().includes(s)
    }
    return true
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      case 'inativo': return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
      case 'arquivado': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  const managingProject = managingProjectId ? projects.find((p) => p.id === managingProjectId) : null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-sm font-bold text-white">PE</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">ProjectEng</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Gerenciamento de Projetos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">{user?.email}</span>
            <button onClick={() => signOut()} className="text-sm text-gray-500 hover:text-red-600 transition">
              Sair
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Title + Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Meus Projetos</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {projects.length} projeto{projects.length !== 1 ? 's' : ''} cadastrado{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => { setEditingProject(null); reset(); setCoverImage(''); setShowForm(true) }}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-3 rounded-xl transition shadow-lg shadow-blue-600/20"
          >
            <Plus size={20} />
            Novo Projeto
          </button>
        </div>

        {/* Search + Filters */}
        {projects.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex-1">
              <Search size={18} className="text-gray-400" />
              <input
                type="text"
                placeholder="Buscar projeto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent border-none outline-none ml-2 text-sm text-gray-700 dark:text-gray-200 w-full"
              />
            </div>
            <div className="flex gap-2">
              {(['todos', 'ativo', 'inativo', 'arquivado'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                    filterStatus === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {status === 'todos' ? 'Todos' : status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Projects Grid */}
        {filteredProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <div
                key={project.id}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 hover:shadow-md transition group relative overflow-hidden"
              >
                {/* Cover Image */}
                {project.imagemCapa && (
                  <div className="h-40 w-full overflow-hidden">
                    <img
                      src={project.imagemCapa}
                      alt={project.nome}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  </div>
                )}

                <div className="p-6">
                {/* Status + Menu */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                  </span>
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpen(menuOpen === project.id ? null : project.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                    >
                      <MoreVertical size={16} />
                    </button>
                    {menuOpen === project.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(null)} />
                        <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                          <button onClick={() => { handleEdit(project); setMenuOpen(null) }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <Edit3 size={14} /> Editar
                          </button>
                          <button onClick={() => handleDuplicate(project.id)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <Copy size={14} /> Duplicar
                          </button>
                          <button onClick={() => handleArchive(project.id)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <Archive size={14} /> Arquivar
                          </button>
                          <button onClick={() => handleDelete(project.id)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                            <Trash2 size={14} /> Deletar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="mb-4 cursor-pointer" onClick={() => openProject(project)}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                      {project.codigo}
                    </span>
                    <span className="text-xs text-gray-400">{project.tipoProjeto}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition line-clamp-1">
                    {project.nome}
                  </h3>
                  {project.descricao && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{project.descricao}</p>
                  )}
                </div>

                {/* Progress */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Progresso</span>
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{project.percentualAvanco}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        project.percentualAvanco === 100 ? 'bg-green-500' :
                        project.percentualAvanco > 50 ? 'bg-blue-500' :
                        project.percentualAvanco > 0 ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      style={{ width: `${project.percentualAvanco}%` }}
                    />
                  </div>
                </div>

                {/* Details */}
                <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400 mb-4">
                  <div className="flex items-center gap-2">
                    <User size={14} />
                    <span>{project.gestor}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 size={14} />
                    <span>{project.empresa}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar size={14} />
                    <span>{new Date(project.dataInicio).toLocaleDateString('pt-BR')} - {new Date(project.dataFimPrevista).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>

                {/* Cronograma info */}
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Layers size={13} className="text-gray-400 dark:text-gray-500" />
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Cronogramas</span>
                  </div>
                  {(project.cronogramas || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(project.cronogramas || []).slice(0, 3).map((c) => (
                        <span
                          key={c.id}
                          className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: c.cor + '20', color: c.cor }}
                        >
                          {c.nome}
                        </span>
                      ))}
                      {(project.cronogramas || []).length > 3 && (
                        <span className="text-xs text-gray-400">+{(project.cronogramas || []).length - 3}</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic">Nenhum cronograma carregado</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => openProject(project)}
                    className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition text-sm"
                  >
                    <FolderOpen size={16} /> Abrir
                  </button>
                  <button
                    onClick={() => openManager(project)}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                  >
                    Gerenciar
                  </button>
                </div>
                </div>
              </div>
            ))}
          </div>
        ) : projects.length === 0 && !showForm ? (
          /* Empty State */
          <div className="text-center py-20">
            <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="text-blue-600" size={40} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Nenhum projeto ainda</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Crie seu primeiro projeto para começar a gerenciar cronogramas, atividades e indicadores.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-xl transition shadow-lg shadow-blue-600/20"
            >
              <Plus size={20} />
              Criar Primeiro Projeto
            </button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            Nenhum projeto encontrado com os filtros aplicados
          </div>
        ) : null}

        {/* Create/Edit Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingProject ? 'Editar Projeto' : 'Novo Projeto'}
                </h2>
                <button onClick={() => { setShowForm(false); setEditingProject(null); reset(); setCoverImage('') }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                {/* Cover Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Imagem de Capa</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  {coverImage ? (
                    <div className="relative">
                      <img src={coverImage} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition"
                    >
                      <Camera size={32} className="mb-2" />
                      <span className="text-sm">Clique para adicionar imagem</span>
                      <span className="text-xs text-gray-400 mt-1">JPG, PNG (máx. 5MB)</span>
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do Projeto *</label>
                  <input {...register('nome')} className={`w-full px-4 py-2.5 border rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.nome ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`} placeholder="Ex: Edifício Residencial Aurora" />
                  {errors.nome && <p className="text-xs text-red-600 mt-1">{errors.nome.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Local *</label>
                  <input {...register('localizacao')} className={`w-full px-4 py-2.5 border rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.localizacao ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`} placeholder="Endereço do projeto" />
                  {errors.localizacao && <p className="text-xs text-red-600 mt-1">{errors.localizacao.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente *</label>
                  <input {...register('empresa')} className={`w-full px-4 py-2.5 border rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.empresa ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`} placeholder="Nome do cliente" />
                  {errors.empresa && <p className="text-xs text-red-600 mt-1">{errors.empresa.message}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gestor Responsável *</label>
                  <input {...register('gestor')} className={`w-full px-4 py-2.5 border rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent ${errors.gestor ? 'border-red-300' : 'border-gray-300 dark:border-gray-600'}`} placeholder="Nome do gestor" />
                  {errors.gestor && <p className="text-xs text-red-600 mt-1">{errors.gestor.message}</p>}
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => { setShowForm(false); setEditingProject(null); reset(); setCoverImage('') }} className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition font-medium">
                    Cancelar
                  </button>
                  <button type="submit" className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-medium">
                    {editingProject ? 'Salvar' : 'Criar Projeto'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Cronograma Manager Modal */}
        {managingProject && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Cronogramas</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{managingProject.nome}</p>
                </div>
                <button
                  onClick={() => setManagingProjectId(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6">
                <CronogramaManager />
                {managingProject.cronogramas && managingProject.cronogramas.length > 0 && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1.5">
                      Cronograma Padrão
                    </label>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
                      Define qual cronograma fornece as configurações (início de semana, data de status, etc.)
                    </p>
                    <select
                      value={managingProject.cronogramaPadraoId || ''}
                      onChange={(e) => updateProject(managingProject.id, { cronogramaPadraoId: e.target.value || undefined })}
                      className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Nenhum (usar primeiro selecionado)</option>
                      {managingProject.cronogramas.map((c) => (
                        <option key={c.id} value={c.id}>{c.nome} (v{c.versao})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => {
                      setManagingProjectId(null)
                      if (managingProject.cronogramas && managingProject.cronogramas.length > 0) {
                        openProject(managingProject)
                      }
                    }}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-medium text-sm"
                  >
                    {managingProject.cronogramas && managingProject.cronogramas.length > 0 ? 'Abrir Dashboard' : 'Fechar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
