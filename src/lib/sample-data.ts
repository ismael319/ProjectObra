import type { ParsedProject, BaselineData, TimephasedSeries, TimephasedWeek } from '@/lib/xml-parser'

// Helper: cria array de 11 baselines (BL0-BL10)
// BL0 = custo original, BL1 = revisão 1 (~+2%), BL9 = revisão 9 (~-3%), BL10 = revisão 10 (~-8%)
function bl(cost: number, work: number): BaselineData[] {
  return [
    { work, cost },                                          // BL0
    { work: Math.round(work * 1.02), cost: Math.round(cost * 1.02) },  // BL1
    { work: 0, cost: 0 },                                    // BL2
    { work: 0, cost: 0 },                                    // BL3
    { work: 0, cost: 0 },                                    // BL4
    { work: 0, cost: 0 },                                    // BL5
    { work: 0, cost: 0 },                                    // BL6
    { work: 0, cost: 0 },                                    // BL7
    { work: 0, cost: 0 },                                    // BL8
    { work: Math.round(work * 0.97), cost: Math.round(cost * 0.97) },  // BL9
    { work: Math.round(work * 0.92), cost: Math.round(cost * 0.92) },  // BL10
  ]
}

export const sampleProject: ParsedProject = {
  name: 'Edifício Residencial Aurora - 20 Unidades',
  startDate: new Date('2026-01-05'),
  finishDate: new Date('2026-12-20'),
  author: 'Eng. Carlos Silva',
  company: 'Construtora ABC',
  description: 'Obra de edifício residencial com 20 unidades, 12 andares, subsolo e cobertura',
  weekStartDay: 5,

  baselines: [
    { id: 'BL0', index: 0, label: 'Baseline 0 (original)', available: true, totalWork: 0, totalCost: 0, hasTimephased: true, savedDate: new Date('2026-01-05') },
    { id: 'BL1', index: 1, label: 'Baseline 1 (revisão 1)', available: true, totalWork: 0, totalCost: 0, hasTimephased: true, savedDate: new Date('2026-03-15') },
    { id: 'BL2', index: 2, label: 'Baseline 2 (revisão 2)', available: false, totalWork: 0, totalCost: 0, hasTimephased: false },
    { id: 'BL3', index: 3, label: 'Baseline 3 (revisão 3)', available: false, totalWork: 0, totalCost: 0, hasTimephased: false },
    { id: 'BL4', index: 4, label: 'Baseline 4 (revisão 4)', available: false, totalWork: 0, totalCost: 0, hasTimephased: false },
    { id: 'BL5', index: 5, label: 'Baseline 5 (revisão 5)', available: false, totalWork: 0, totalCost: 0, hasTimephased: false },
    { id: 'BL6', index: 6, label: 'Baseline 6 (revisão 6)', available: false, totalWork: 0, totalCost: 0, hasTimephased: false },
    { id: 'BL7', index: 7, label: 'Baseline 7 (revisão 7)', available: false, totalWork: 0, totalCost: 0, hasTimephased: false },
    { id: 'BL8', index: 8, label: 'Baseline 8 (revisão 8)', available: false, totalWork: 0, totalCost: 0, hasTimephased: false },
    { id: 'BL9', index: 9, label: 'Baseline 9 (revisão 9)', available: true, totalWork: 0, totalCost: 0, hasTimephased: false },
    { id: 'BL10', index: 10, label: 'Baseline 10 (revisão 10)', available: true, totalWork: 0, totalCost: 0, hasTimephased: false },
  ],

  activities: [
    // FASE 1 - FUNDAÇÃO
    { id: '1', uid: 1, name: 'FASE 1 - FUNDAÇÃO', wbs: '1', outlineLevel: 1, outlineNumber: '1', start: new Date('2026-01-05'), finish: new Date('2026-02-28'), duration: 4800, durationFormat: 7, percentComplete: 100, predecessorUids: [], resourceUids: [1, 2], isMilestone: false, isSummary: true, responsible: 'Eng. Carlos', discipline: 'Civil', area: 'Fundação', notes: '', priority: 1000, calendarName: '', text1: 'Eng. Carlos', text2: '', text3: 'Civil', number1: 0, number2: 0, cost: 280000, actualCost: 275000, work: 3600, actualWork: 3500, baselines: bl(280000, 3600) },
    { id: '1.1', uid: 2, name: 'Limpeza do terreno', wbs: '1.1', outlineLevel: 2, outlineNumber: '1.1', start: new Date('2026-01-05'), finish: new Date('2026-01-10'), duration: 480, durationFormat: 7, percentComplete: 100, predecessorUids: [], resourceUids: [1], isMilestone: false, isSummary: false, responsible: 'João Silva', discipline: 'Civil', area: 'Fundação', notes: '', priority: 800, calendarName: '', text1: 'João Silva', text2: '', text3: 'Civil', number1: 0, number2: 0, cost: 15000, actualCost: 14500, work: 480, actualWork: 480, baselines: bl(15000, 480) },
    { id: '1.2', uid: 3, name: 'Escavação e movimento de terra', wbs: '1.2', outlineLevel: 2, outlineNumber: '1.2', start: new Date('2026-01-11'), finish: new Date('2026-01-20'), duration: 800, durationFormat: 7, percentComplete: 100, predecessorUids: [2], resourceUids: [1, 3], isMilestone: false, isSummary: false, responsible: 'João Silva', discipline: 'Civil', area: 'Fundação', notes: '', priority: 800, calendarName: '', text1: 'João Silva', text2: '', text3: 'Civil', number1: 0, number2: 0, cost: 45000, actualCost: 48000, work: 1200, actualWork: 1250, baselines: bl(45000, 1200) },
    { id: '1.3', uid: 4, name: 'Baldrame concreto armado', wbs: '1.3', outlineLevel: 2, outlineNumber: '1.3', start: new Date('2026-01-21'), finish: new Date('2026-02-10'), duration: 1600, durationFormat: 7, percentComplete: 100, predecessorUids: [3], resourceUids: [1, 2, 4], isMilestone: false, isSummary: false, responsible: 'João Silva', discipline: 'Civil', area: 'Fundação', notes: '', priority: 800, calendarName: '', text1: 'João Silva', text2: '', text3: 'Civil', number1: 0, number2: 0, cost: 120000, actualCost: 118000, work: 3000, actualWork: 2960, baselines: bl(120000, 3000) },
    { id: '1.4', uid: 5, name: 'Impermeabilização fundação', wbs: '1.4', outlineLevel: 2, outlineNumber: '1.4', start: new Date('2026-02-11'), finish: new Date('2026-02-18'), duration: 640, durationFormat: 7, percentComplete: 100, predecessorUids: [4], resourceUids: [5], isMilestone: false, isSummary: false, responsible: 'Pedro Santos', discipline: 'Impermeabilização', area: 'Fundação', notes: '', priority: 800, calendarName: '', text1: 'Pedro Santos', text2: '', text3: 'Impermeabilização', number1: 0, number2: 0, cost: 25000, actualCost: 24000, work: 640, actualWork: 620, baselines: bl(25000, 640) },
    { id: '1.5', uid: 6, name: 'Marco - Fundação concluída', wbs: '1.5', outlineLevel: 2, outlineNumber: '1.5', start: new Date('2026-02-28'), finish: new Date('2026-02-28'), duration: 0, durationFormat: 7, percentComplete: 100, predecessorUids: [5], resourceUids: [], isMilestone: true, isSummary: false, responsible: 'Eng. Carlos', discipline: 'Civil', area: 'Fundação', notes: '', priority: 1000, calendarName: '', text1: 'Eng. Carlos', text2: '', text3: 'Civil', number1: 0, number2: 0, cost: 0, actualCost: 0, work: 0, actualWork: 0, baselines: bl(0, 0) },

    // FASE 2 - ESTRUTURA
    { id: '2', uid: 7, name: 'FASE 2 - ESTRUTURA', wbs: '2', outlineLevel: 1, outlineNumber: '2', start: new Date('2026-03-01'), finish: new Date('2026-07-30'), duration: 10400, durationFormat: 7, percentComplete: 68, predecessorUids: [6], resourceUids: [1, 2, 4], isMilestone: false, isSummary: true, responsible: 'Eng. Carlos', discipline: 'Estrutural', area: 'Estrutura', notes: '', priority: 1000, calendarName: '', text1: 'Eng. Carlos', text2: '', text3: 'Estrutural', number1: 0, number2: 0, cost: 1200000, actualCost: 850000, work: 15000, actualWork: 10200, baselines: bl(1200000, 15000) },
    { id: '2.1', uid: 8, name: 'Pilares subsolo e térreo', wbs: '2.1', outlineLevel: 2, outlineNumber: '2.1', start: new Date('2026-03-01'), finish: new Date('2026-03-20'), duration: 1520, durationFormat: 7, percentComplete: 100, predecessorUids: [6], resourceUids: [1, 2, 4], isMilestone: false, isSummary: false, responsible: 'Marcos Lima', discipline: 'Estrutural', area: 'Estrutura', notes: '', priority: 800, calendarName: '', text1: 'Marcos Lima', text2: '', text3: 'Estrutural', number1: 0, number2: 0, cost: 180000, actualCost: 175000, work: 3840, actualWork: 3840, baselines: bl(180000, 3840) },
    { id: '2.2', uid: 9, name: 'Lajes condicionadas subsolo', wbs: '2.2', outlineLevel: 2, outlineNumber: '2.2', start: new Date('2026-03-21'), finish: new Date('2026-04-10'), duration: 1520, durationFormat: 7, percentComplete: 100, predecessorUids: [8], resourceUids: [1, 2], isMilestone: false, isSummary: false, responsible: 'Marcos Lima', discipline: 'Estrutural', area: 'Estrutura', notes: '', priority: 800, calendarName: '', text1: 'Marcos Lima', text2: '', text3: 'Estrutural', number1: 0, number2: 0, cost: 200000, actualCost: 195000, work: 3040, actualWork: 3040, baselines: bl(200000, 3040) },
    { id: '2.3', uid: 10, name: 'Pilares 1º ao 4º andar', wbs: '2.3', outlineLevel: 2, outlineNumber: '2.3', start: new Date('2026-04-11'), finish: new Date('2026-05-15'), duration: 2400, durationFormat: 7, percentComplete: 100, predecessorUids: [9], resourceUids: [1, 2, 4], isMilestone: false, isSummary: false, responsible: 'Marcos Lima', discipline: 'Estrutural', area: 'Estrutura', notes: '', priority: 800, calendarName: '', text1: 'Marcos Lima', text2: '', text3: 'Estrutural', number1: 0, number2: 0, cost: 300000, actualCost: 290000, work: 6000, actualWork: 6000, baselines: bl(300000, 6000) },
    { id: '2.4', uid: 11, name: 'Lajes 1º ao 4º andar', wbs: '2.4', outlineLevel: 2, outlineNumber: '2.4', start: new Date('2026-05-16'), finish: new Date('2026-06-10'), duration: 1920, durationFormat: 7, percentComplete: 85, predecessorUids: [10], resourceUids: [1, 2], isMilestone: false, isSummary: false, responsible: 'Marcos Lima', discipline: 'Estrutural', area: 'Estrutura', notes: '', priority: 800, calendarName: '', text1: 'Marcos Lima', text2: '', text3: 'Estrutural', number1: 0, number2: 0, cost: 250000, actualCost: 220000, work: 3840, actualWork: 3264, baselines: bl(250000, 3840) },
    { id: '2.5', uid: 12, name: 'Pilares 5º ao 8º andar', wbs: '2.5', outlineLevel: 2, outlineNumber: '2.5', start: new Date('2026-06-11'), finish: new Date('2026-07-10'), duration: 2080, durationFormat: 7, percentComplete: 40, predecessorUids: [11], resourceUids: [1, 2, 4], isMilestone: false, isSummary: false, responsible: 'Marcos Lima', discipline: 'Estrutural', area: 'Estrutura', notes: '', priority: 800, calendarName: '', text1: 'Marcos Lima', text2: '', text3: 'Estrutural', number1: 0, number2: 0, cost: 280000, actualCost: 120000, work: 5200, actualWork: 2080, baselines: bl(280000, 5200) },
    { id: '2.6', uid: 13, name: 'Lajes 5º ao 8º andar', wbs: '2.6', outlineLevel: 2, outlineNumber: '2.6', start: new Date('2026-07-11'), finish: new Date('2026-07-30'), duration: 1520, durationFormat: 7, percentComplete: 15, predecessorUids: [12], resourceUids: [1, 2], isMilestone: false, isSummary: false, responsible: 'Marcos Lima', discipline: 'Estrutural', area: 'Estrutura', notes: '', priority: 800, calendarName: '', text1: 'Marcos Lima', text2: '', text3: 'Estrutural', number1: 0, number2: 0, cost: 200000, actualCost: 35000, work: 3040, actualWork: 456, baselines: bl(200000, 3040) },

    // FASE 3 - ALVENARIA
    { id: '3', uid: 14, name: 'FASE 3 - ALVENARIA', wbs: '3', outlineLevel: 1, outlineNumber: '3', start: new Date('2026-04-01'), finish: new Date('2026-09-15'), duration: 11200, durationFormat: 7, percentComplete: 35, predecessorUids: [8], resourceUids: [6, 7], isMilestone: false, isSummary: true, responsible: 'Roberto Alves', discipline: 'Alvenaria', area: 'Alvenaria', notes: '', priority: 800, calendarName: '', text1: 'Roberto Alves', text2: '', text3: 'Alvenaria', number1: 0, number2: 0, cost: 650000, actualCost: 230000, work: 9600, actualWork: 3360, baselines: bl(650000, 9600) },
    { id: '3.1', uid: 15, name: 'Alvenaria subsolo e térreo', wbs: '3.1', outlineLevel: 2, outlineNumber: '3.1', start: new Date('2026-04-01'), finish: new Date('2026-04-25'), duration: 1920, durationFormat: 7, percentComplete: 100, predecessorUids: [8], resourceUids: [6], isMilestone: false, isSummary: false, responsible: 'Roberto Alves', discipline: 'Alvenaria', area: 'Alvenaria', notes: '', priority: 800, calendarName: '', text1: 'Roberto Alves', text2: '', text3: 'Alvenaria', number1: 0, number2: 0, cost: 80000, actualCost: 78000, work: 1920, actualWork: 1920, baselines: bl(80000, 1920) },
    { id: '3.2', uid: 16, name: 'Alvenaria 1º ao 4º andar', wbs: '3.2', outlineLevel: 2, outlineNumber: '3.2', start: new Date('2026-05-20'), finish: new Date('2026-07-15'), duration: 3360, durationFormat: 7, percentComplete: 60, predecessorUids: [15], resourceUids: [6, 7], isMilestone: false, isSummary: false, responsible: 'Roberto Alves', discipline: 'Alvenaria', area: 'Alvenaria', notes: '', priority: 800, calendarName: '', text1: 'Roberto Alves', text2: '', text3: 'Alvenaria', number1: 0, number2: 0, cost: 250000, actualCost: 155000, work: 3360, actualWork: 2016, baselines: bl(250000, 3360) },
    { id: '3.3', uid: 17, name: 'Alvenaria 5º ao 8º andar', wbs: '3.3', outlineLevel: 2, outlineNumber: '3.3', start: new Date('2026-07-16'), finish: new Date('2026-09-15'), duration: 3840, durationFormat: 7, percentComplete: 5, predecessorUids: [16], resourceUids: [6, 7], isMilestone: false, isSummary: false, responsible: 'Roberto Alves', discipline: 'Alvenaria', area: 'Alvenaria', notes: '', priority: 800, calendarName: '', text1: 'Roberto Alves', text2: '', text3: 'Alvenaria', number1: 0, number2: 0, cost: 300000, actualCost: 18000, work: 3840, actualWork: 192, baselines: bl(300000, 3840) },

    // FASE 4 - INSTALAÇÕES
    { id: '4', uid: 18, name: 'FASE 4 - INSTALAÇÕES', wbs: '4', outlineLevel: 1, outlineNumber: '4', start: new Date('2026-05-01'), finish: new Date('2026-10-30'), duration: 12800, durationFormat: 7, percentComplete: 22, predecessorUids: [15], resourceUids: [8, 9, 10], isMilestone: false, isSummary: true, responsible: 'Eng. Fernando', discipline: 'Instalações', area: 'Instalações', notes: '', priority: 800, calendarName: '', text1: 'Eng. Fernando', text2: '', text3: 'Instalações', number1: 0, number2: 0, cost: 950000, actualCost: 210000, work: 12000, actualWork: 2640, baselines: bl(950000, 12000) },
    { id: '4.1', uid: 19, name: 'Hidráulica subsolo', wbs: '4.1', outlineLevel: 2, outlineNumber: '4.1', start: new Date('2026-05-01'), finish: new Date('2026-05-20'), duration: 1520, durationFormat: 7, percentComplete: 100, predecessorUids: [15], resourceUids: [8], isMilestone: false, isSummary: false, responsible: 'Antônio Costa', discipline: 'Hidráulica', area: 'Instalações', notes: '', priority: 800, calendarName: '', text1: 'Antônio Costa', text2: '', text3: 'Hidráulica', number1: 0, number2: 0, cost: 120000, actualCost: 118000, work: 1520, actualWork: 1520, baselines: bl(120000, 1520) },
    { id: '4.2', uid: 20, name: 'Elétrica subsolo e térreo', wbs: '4.2', outlineLevel: 2, outlineNumber: '4.2', start: new Date('2026-05-10'), finish: new Date('2026-06-05'), duration: 2080, durationFormat: 7, percentComplete: 100, predecessorUids: [19], resourceUids: [9], isMilestone: false, isSummary: false, responsible: 'Paulo Mendes', discipline: 'Elétrica', area: 'Instalações', notes: '', priority: 800, calendarName: '', text1: 'Paulo Mendes', text2: '', text3: 'Elétrica', number1: 0, number2: 0, cost: 95000, actualCost: 92000, work: 2080, actualWork: 2080, baselines: bl(95000, 2080) },
    { id: '4.3', uid: 21, name: 'Hidráulica 1º ao 4º andar', wbs: '4.3', outlineLevel: 2, outlineNumber: '4.3', start: new Date('2026-06-06'), finish: new Date('2026-08-10'), duration: 4160, durationFormat: 7, percentComplete: 40, predecessorUids: [20], resourceUids: [8], isMilestone: false, isSummary: false, responsible: 'Antônio Costa', discipline: 'Hidráulica', area: 'Instalações', notes: '', priority: 800, calendarName: '', text1: 'Antônio Costa', text2: '', text3: 'Hidráulica', number1: 0, number2: 0, cost: 280000, actualCost: 115000, work: 4160, actualWork: 1664, baselines: bl(280000, 4160) },
    { id: '4.4', uid: 22, name: 'Elétrica 1º ao 4º andar', wbs: '4.4', outlineLevel: 2, outlineNumber: '4.4', start: new Date('2026-06-15'), finish: new Date('2026-08-20'), duration: 4160, durationFormat: 7, percentComplete: 35, predecessorUids: [20], resourceUids: [9], isMilestone: false, isSummary: false, responsible: 'Paulo Mendes', discipline: 'Elétrica', area: 'Instalações', notes: '', priority: 800, calendarName: '', text1: 'Paulo Mendes', text2: '', text3: 'Elétrica', number1: 0, number2: 0, cost: 250000, actualCost: 90000, work: 4160, actualWork: 1456, baselines: bl(250000, 4160) },
    { id: '4.5', uid: 23, name: 'Ar condicionado central', wbs: '4.5', outlineLevel: 2, outlineNumber: '4.5', start: new Date('2026-07-01'), finish: new Date('2026-10-30'), duration: 7680, durationFormat: 7, percentComplete: 10, predecessorUids: [21], resourceUids: [10], isMilestone: false, isSummary: false, responsible: 'Lucas Ferreira', discipline: 'Ar Condicionado', area: 'Instalações', notes: '', priority: 600, calendarName: '', text1: 'Lucas Ferreira', text2: '', text3: 'Ar Condicionado', number1: 0, number2: 0, cost: 350000, actualCost: 38000, work: 7680, actualWork: 768, baselines: bl(350000, 7680) },

    // FASE 5 - ACABAMENTOS
    { id: '5', uid: 24, name: 'FASE 5 - ACABAMENTOS', wbs: '5', outlineLevel: 1, outlineNumber: '5', start: new Date('2026-08-01'), finish: new Date('2026-11-30'), duration: 10400, durationFormat: 7, percentComplete: 5, predecessorUids: [16], resourceUids: [11, 12, 13], isMilestone: false, isSummary: true, responsible: 'Eng. Maria', discipline: 'Acabamentos', area: 'Acabamentos', notes: '', priority: 600, calendarName: '', text1: 'Eng. Maria', text2: '', text3: 'Acabamentos', number1: 0, number2: 0, cost: 1100000, actualCost: 55000, work: 10400, actualWork: 520, baselines: bl(1100000, 10400) },
    { id: '5.1', uid: 25, name: 'Revestimento externo (fachada)', wbs: '5.1', outlineLevel: 2, outlineNumber: '5.1', start: new Date('2026-08-01'), finish: new Date('2026-10-15'), duration: 5280, durationFormat: 7, percentComplete: 8, predecessorUids: [16], resourceUids: [11], isMilestone: false, isSummary: false, responsible: 'Ricardo Souza', discipline: 'Revestimento', area: 'Acabamentos', notes: '', priority: 600, calendarName: '', text1: 'Ricardo Souza', text2: '', text3: 'Revestimento', number1: 0, number2: 0, cost: 400000, actualCost: 35000, work: 5280, actualWork: 422, baselines: bl(400000, 5280) },
    { id: '5.2', uid: 26, name: 'Piso e cerâmica', wbs: '5.2', outlineLevel: 2, outlineNumber: '5.2', start: new Date('2026-09-01'), finish: new Date('2026-11-15'), duration: 5760, durationFormat: 7, percentComplete: 3, predecessorUids: [25], resourceUids: [12], isMilestone: false, isSummary: false, responsible: 'Fernanda Lima', discipline: 'Acabamento', area: 'Acabamentos', notes: '', priority: 600, calendarName: '', text1: 'Fernanda Lima', text2: '', text3: 'Acabamento', number1: 0, number2: 0, cost: 350000, actualCost: 12000, work: 5760, actualWork: 173, baselines: bl(350000, 5760) },
    { id: '5.3', uid: 27, name: 'Marcenaria (esquadrias)', wbs: '5.3', outlineLevel: 2, outlineNumber: '5.3', start: new Date('2026-09-15'), finish: new Date('2026-11-20'), duration: 5280, durationFormat: 7, percentComplete: 0, predecessorUids: [25], resourceUids: [13], isMilestone: false, isSummary: false, responsible: 'Carlos Eduardo', discipline: 'Marcenaria', area: 'Acabamentos', notes: '', priority: 600, calendarName: '', text1: 'Carlos Eduardo', text2: '', text3: 'Marcenaria', number1: 0, number2: 0, cost: 250000, actualCost: 0, work: 5280, actualWork: 0, baselines: bl(250000, 5280) },
    { id: '5.4', uid: 28, name: 'Pintura', wbs: '5.4', outlineLevel: 2, outlineNumber: '5.4', start: new Date('2026-10-01'), finish: new Date('2026-11-30'), duration: 4800, durationFormat: 7, percentComplete: 0, predecessorUids: [26], resourceUids: [11], isMilestone: false, isSummary: false, responsible: 'Ricardo Souza', discipline: 'Pintura', area: 'Acabamentos', notes: '', priority: 600, calendarName: '', text1: 'Ricardo Souza', text2: '', text3: 'Pintura', number1: 0, number2: 0, cost: 200000, actualCost: 0, work: 4800, actualWork: 0, baselines: bl(200000, 4800) },

    // FASE 6 - COMPLEMENTOS
    { id: '6', uid: 29, name: 'FASE 6 - COMPLEMENTOS', wbs: '6', outlineLevel: 1, outlineNumber: '6', start: new Date('2026-10-01'), finish: new Date('2026-12-20'), duration: 5600, durationFormat: 7, percentComplete: 0, predecessorUids: [25], resourceUids: [14, 15], isMilestone: false, isSummary: true, responsible: 'Eng. Maria', discipline: 'Complementos', area: 'Complementos', notes: '', priority: 400, calendarName: '', text1: 'Eng. Maria', text2: '', text3: 'Complementos', number1: 0, number2: 0, cost: 450000, actualCost: 0, work: 5600, actualWork: 0, baselines: bl(450000, 5600) },
    { id: '6.1', uid: 30, name: 'Elevador', wbs: '6.1', outlineLevel: 2, outlineNumber: '6.1', start: new Date('2026-10-01'), finish: new Date('2026-12-01'), duration: 4160, durationFormat: 7, percentComplete: 0, predecessorUids: [25], resourceUids: [14], isMilestone: false, isSummary: false, responsible: 'Empresa XYZ', discipline: 'Elevador', area: 'Complementos', notes: '', priority: 400, calendarName: '', text1: 'Empresa XYZ', text2: '', text3: 'Elevador', number1: 0, number2: 0, cost: 250000, actualCost: 0, work: 4160, actualWork: 0, baselines: bl(250000, 4160) },
    { id: '6.2', uid: 31, name: 'Portaria e controle de acesso', wbs: '6.2', outlineLevel: 2, outlineNumber: '6.2', start: new Date('2026-11-01'), finish: new Date('2026-12-10'), duration: 2880, durationFormat: 7, percentComplete: 0, predecessorUids: [30], resourceUids: [15], isMilestone: false, isSummary: false, responsible: 'Paulo Mendes', discipline: 'Eletrônica', area: 'Complementos', notes: '', priority: 400, calendarName: '', text1: 'Paulo Mendes', text2: '', text3: 'Eletrônica', number1: 0, number2: 0, cost: 80000, actualCost: 0, work: 2880, actualWork: 0, baselines: bl(80000, 2880) },
    { id: '6.3', uid: 32, name: 'Paisagismo e área verde', wbs: '6.3', outlineLevel: 2, outlineNumber: '6.3', start: new Date('2026-11-15'), finish: new Date('2026-12-15'), duration: 2400, durationFormat: 7, percentComplete: 0, predecessorUids: [30], resourceUids: [15], isMilestone: false, isSummary: false, responsible: 'Ana Paula', discipline: 'Paisagismo', area: 'Complementos', notes: '', priority: 400, calendarName: '', text1: 'Ana Paula', text2: '', text3: 'Paisagismo', number1: 0, number2: 0, cost: 60000, actualCost: 0, work: 2400, actualWork: 0, baselines: bl(60000, 2400) },
    { id: '6.4', uid: 33, name: 'Limpeza final', wbs: '6.4', outlineLevel: 2, outlineNumber: '6.4', start: new Date('2026-12-01'), finish: new Date('2026-12-15'), duration: 1200, durationFormat: 7, percentComplete: 0, predecessorUids: [30, 31], resourceUids: [15], isMilestone: false, isSummary: false, responsible: 'Equipe de Limpeza', discipline: 'Limpeza', area: 'Complementos', notes: '', priority: 400, calendarName: '', text1: 'Equipe de Limpeza', text2: '', text3: 'Limpeza', number1: 0, number2: 0, cost: 30000, actualCost: 0, work: 1200, actualWork: 0, baselines: bl(30000, 1200) },
    { id: '6.5', uid: 34, name: 'Vistoria e entrega', wbs: '6.5', outlineLevel: 2, outlineNumber: '6.5', start: new Date('2026-12-16'), finish: new Date('2026-12-20'), duration: 400, durationFormat: 7, percentComplete: 0, predecessorUids: [33], resourceUids: [], isMilestone: true, isSummary: false, responsible: 'Eng. Carlos', discipline: 'Gerência', area: 'Complementos', notes: '', priority: 1000, calendarName: '', text1: 'Eng. Carlos', text2: '', text3: 'Gerência', number1: 0, number2: 0, cost: 0, actualCost: 0, work: 0, actualWork: 0, baselines: bl(0, 0) },
  ],

  resources: [
    { uid: 1, name: 'João Silva', type: 1, initials: 'JS', group: 'Pedreiro', maxUnits: 1, peakUnits: 1, baseRate: 85, costPerUse: 0, role: 'Pedreiro', email: '', phone: '', code: 'P001' },
    { uid: 2, name: 'Carlos Oliveira', type: 1, initials: 'CO', group: 'Pedreiro', maxUnits: 1, peakUnits: 1, baseRate: 80, costPerUse: 0, role: 'Pedreiro', email: '', phone: '', code: 'P002' },
    { uid: 3, name: 'Máquinas Pesadas', type: 2, initials: 'MP', group: 'Equipamento', maxUnits: 1, peakUnits: 1, baseRate: 500, costPerUse: 0, role: 'Equipamento', email: '', phone: '', code: 'E001' },
    { uid: 4, name: 'Marcos Lima', type: 1, initials: 'ML', group: 'Estrutural', maxUnits: 1, peakUnits: 1, baseRate: 95, costPerUse: 0, role: 'Encarregado Estrutural', email: '', phone: '', code: 'E001' },
    { uid: 5, name: 'Pedro Santos', type: 1, initials: 'PS', group: 'Impermeabilização', maxUnits: 1, peakUnits: 1, baseRate: 90, costPerUse: 0, role: 'Especialista', email: '', phone: '', code: 'I001' },
    { uid: 6, name: 'Roberto Alves', type: 1, initials: 'RA', group: 'Alvenaria', maxUnits: 1, peakUnits: 1, baseRate: 85, costPerUse: 0, role: 'Encarregado Alvenaria', email: '', phone: '', code: 'A001' },
    { uid: 7, name: 'Equipe Alvenaria (4p)', type: 1, initials: 'EA', group: 'Alvenaria', maxUnits: 4, peakUnits: 4, baseRate: 320, costPerUse: 0, role: 'Pedreiro', email: '', phone: '', code: 'A002' },
    { uid: 8, name: 'Antônio Costa', type: 1, initials: 'AC', group: 'Hidráulica', maxUnits: 1, peakUnits: 1, baseRate: 95, costPerUse: 0, role: 'Encarregado Hidráulica', email: '', phone: '', code: 'H001' },
    { uid: 9, name: 'Paulo Mendes', type: 1, initials: 'PM', group: 'Elétrica', maxUnits: 1, peakUnits: 1, baseRate: 100, costPerUse: 0, role: 'Encarregado Elétrica', email: '', phone: '', code: 'EL01' },
    { uid: 10, name: 'Lucas Ferreira', type: 1, initials: 'LF', group: 'Ar Condicionado', maxUnits: 1, peakUnits: 1, baseRate: 110, costPerUse: 0, role: 'Técnico Ar Condicionado', email: '', phone: '', code: 'AC01' },
    { uid: 11, name: 'Ricardo Souza', type: 1, initials: 'RS', group: 'Revestimento', maxUnits: 1, peakUnits: 1, baseRate: 88, costPerUse: 0, role: 'Encarregado Revestimento', email: '', phone: '', code: 'R001' },
    { uid: 12, name: 'Fernanda Lima', type: 1, initials: 'FL', group: 'Acabamento', maxUnits: 1, peakUnits: 1, baseRate: 82, costPerUse: 0, role: 'Azulejista', email: '', phone: '', code: 'AC02' },
    { uid: 13, name: 'Carlos Eduardo', type: 1, initials: 'CE', group: 'Marcenaria', maxUnits: 1, peakUnits: 1, baseRate: 92, costPerUse: 0, role: 'Marceneiro', email: '', phone: '', code: 'M001' },
    { uid: 14, name: 'Empresa XYZ Elevadores', type: 1, initials: 'XE', group: 'Elevador', maxUnits: 2, peakUnits: 2, baseRate: 400, costPerUse: 0, role: 'Subcontratada', email: '', phone: '', code: 'SUB1' },
    { uid: 15, name: 'Equipe Finalização (3p)', type: 1, initials: 'EF', group: 'Finalização', maxUnits: 3, peakUnits: 3, baseRate: 240, costPerUse: 0, role: 'Geral', email: '', phone: '', code: 'F001' },
  ],

  assignments: [
    { uid: 1, taskUid: 2, resourceUid: 1, units: 1, work: 480, actualWork: 480, cost: 680, actualCost: 680, delay: 0, levelingDelay: 0 },
    { uid: 2, taskUid: 3, resourceUid: 1, units: 1, work: 800, actualWork: 850, cost: 1133, actualCost: 1204, delay: 0, levelingDelay: 0 },
    { uid: 3, taskUid: 3, resourceUid: 3, units: 1, work: 400, actualWork: 400, cost: 3333, actualCost: 3333, delay: 0, levelingDelay: 0 },
    { uid: 4, taskUid: 4, resourceUid: 1, units: 1, work: 1200, actualWork: 1180, cost: 1700, actualCost: 1671, delay: 0, levelingDelay: 0 },
    { uid: 5, taskUid: 4, resourceUid: 2, units: 1, work: 1200, actualWork: 1180, cost: 1600, actualCost: 1573, delay: 0, levelingDelay: 0 },
    { uid: 6, taskUid: 4, resourceUid: 4, units: 1, work: 600, actualWork: 600, cost: 950, actualCost: 950, delay: 0, levelingDelay: 0 },
    { uid: 7, taskUid: 5, resourceUid: 5, units: 1, work: 640, actualWork: 620, cost: 960, actualCost: 930, delay: 0, levelingDelay: 0 },
    { uid: 8, taskUid: 8, resourceUid: 1, units: 1, work: 1520, actualWork: 1520, cost: 2153, actualCost: 2153, delay: 0, levelingDelay: 0 },
    { uid: 9, taskUid: 8, resourceUid: 2, units: 1, work: 1520, actualWork: 1520, cost: 2027, actualCost: 2027, delay: 0, levelingDelay: 0 },
    { uid: 10, taskUid: 8, resourceUid: 4, units: 1, work: 800, actualWork: 800, cost: 1263, actualCost: 1263, delay: 0, levelingDelay: 0 },
    { uid: 11, taskUid: 9, resourceUid: 1, units: 1, work: 1520, actualWork: 1520, cost: 2153, actualCost: 2153, delay: 0, levelingDelay: 0 },
    { uid: 12, taskUid: 9, resourceUid: 2, units: 1, work: 1520, actualWork: 1520, cost: 2027, actualCost: 2027, delay: 0, levelingDelay: 0 },
    { uid: 13, taskUid: 10, resourceUid: 1, units: 1, work: 2400, actualWork: 2400, cost: 3400, actualCost: 3400, delay: 0, levelingDelay: 0 },
    { uid: 14, taskUid: 10, resourceUid: 2, units: 1, work: 2400, actualWork: 2400, cost: 3200, actualCost: 3200, delay: 0, levelingDelay: 0 },
    { uid: 15, taskUid: 10, resourceUid: 4, units: 1, work: 1200, actualWork: 1200, cost: 1895, actualCost: 1895, delay: 0, levelingDelay: 0 },
    { uid: 16, taskUid: 11, resourceUid: 1, units: 1, work: 1920, actualWork: 1632, cost: 2720, actualCost: 2314, delay: 0, levelingDelay: 0 },
    { uid: 17, taskUid: 11, resourceUid: 2, units: 1, work: 1920, actualWork: 1632, cost: 2560, actualCost: 2176, delay: 0, levelingDelay: 0 },
    { uid: 18, taskUid: 12, resourceUid: 1, units: 1, work: 2080, actualWork: 832, cost: 2947, actualCost: 1179, delay: 0, levelingDelay: 0 },
    { uid: 19, taskUid: 12, resourceUid: 2, units: 1, work: 2080, actualWork: 832, cost: 2773, actualCost: 1109, delay: 0, levelingDelay: 0 },
    { uid: 20, taskUid: 12, resourceUid: 4, units: 1, work: 1040, actualWork: 416, cost: 1642, actualCost: 657, delay: 0, levelingDelay: 0 },
    { uid: 21, taskUid: 13, resourceUid: 1, units: 1, work: 1520, actualWork: 228, cost: 2153, actualCost: 323, delay: 0, levelingDelay: 0 },
    { uid: 22, taskUid: 13, resourceUid: 2, units: 1, work: 1520, actualWork: 228, cost: 2027, actualCost: 304, delay: 0, levelingDelay: 0 },
    { uid: 23, taskUid: 15, resourceUid: 6, units: 1, work: 1920, actualWork: 1920, cost: 2720, actualCost: 2720, delay: 0, levelingDelay: 0 },
    { uid: 24, taskUid: 16, resourceUid: 6, units: 1, work: 3360, actualWork: 2016, cost: 4760, actualCost: 2856, delay: 0, levelingDelay: 0 },
    { uid: 25, taskUid: 16, resourceUid: 7, units: 4, work: 3360, actualWork: 2016, cost: 15238, actualCost: 9143, delay: 0, levelingDelay: 0 },
    { uid: 26, taskUid: 17, resourceUid: 6, units: 1, work: 1920, actualWork: 96, cost: 2720, actualCost: 136, delay: 0, levelingDelay: 0 },
    { uid: 27, taskUid: 17, resourceUid: 7, units: 4, work: 1920, actualWork: 96, cost: 8709, actualCost: 435, delay: 0, levelingDelay: 0 },
    { uid: 28, taskUid: 19, resourceUid: 8, units: 1, work: 1520, actualWork: 1520, cost: 2400, actualCost: 2400, delay: 0, levelingDelay: 0 },
    { uid: 29, taskUid: 20, resourceUid: 9, units: 1, work: 2080, actualWork: 2080, cost: 3467, actualCost: 3467, delay: 0, levelingDelay: 0 },
    { uid: 30, taskUid: 21, resourceUid: 8, units: 1, work: 4160, actualWork: 1664, cost: 6587, actualCost: 2635, delay: 0, levelingDelay: 0 },
    { uid: 31, taskUid: 22, resourceUid: 9, units: 1, work: 4160, actualWork: 1456, cost: 6933, actualCost: 2427, delay: 0, levelingDelay: 0 },
    { uid: 32, taskUid: 23, resourceUid: 10, units: 1, work: 7680, actualWork: 768, cost: 14080, actualCost: 1408, delay: 0, levelingDelay: 0 },
    { uid: 33, taskUid: 25, resourceUid: 11, units: 1, work: 5280, actualWork: 422, cost: 7760, actualCost: 621, delay: 0, levelingDelay: 0 },
    { uid: 34, taskUid: 26, resourceUid: 12, units: 1, work: 5760, actualWork: 173, cost: 7855, actualCost: 236, delay: 0, levelingDelay: 0 },
    { uid: 35, taskUid: 30, resourceUid: 14, units: 2, work: 4160, actualWork: 0, cost: 11093, actualCost: 0, delay: 0, levelingDelay: 0 },
    { uid: 36, taskUid: 31, resourceUid: 15, units: 1, work: 2880, actualWork: 0, cost: 1152, actualCost: 0, delay: 0, levelingDelay: 0 },
    { uid: 37, taskUid: 32, resourceUid: 15, units: 1, work: 2400, actualWork: 0, cost: 960, actualCost: 0, delay: 0, levelingDelay: 0 },
    { uid: 38, taskUid: 33, resourceUid: 15, units: 1, work: 1200, actualWork: 0, cost: 480, actualCost: 0, delay: 0, levelingDelay: 0 },
  ],

  // Dados timephased sintéticos (gerados a partir das atividades)
  // Quando um XML real é carregado, estes são substituídos pelos dados reais
  timephased: (() => {
    const weeks: TimephasedWeek[] = []
    const startDate = new Date('2026-01-05')
    const endDate = new Date('2026-12-20')
    const totalWeeks = Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 86400000))

    // Atividades não-summary com seus valores
    const activities = [
      { start: new Date('2026-01-05'), finish: new Date('2026-01-10'), work: 480, actualWork: 480, bl0: 480 },
      { start: new Date('2026-01-11'), finish: new Date('2026-01-20'), work: 1200, actualWork: 1250, bl0: 1200 },
      { start: new Date('2026-01-21'), finish: new Date('2026-02-10'), work: 3000, actualWork: 2960, bl0: 3000 },
      { start: new Date('2026-02-11'), finish: new Date('2026-02-18'), work: 640, actualWork: 620, bl0: 640 },
      { start: new Date('2026-03-01'), finish: new Date('2026-04-15'), work: 8000, actualWork: 7200, bl0: 8000 },
      { start: new Date('2026-03-15'), finish: new Date('2026-05-30'), work: 12000, actualWork: 9600, bl0: 12000 },
      { start: new Date('2026-04-01'), finish: new Date('2026-06-30'), work: 16000, actualWork: 11200, bl0: 16200 },
      { start: new Date('2026-05-01'), finish: new Date('2026-07-31'), work: 14000, actualWork: 7000, bl0: 14000 },
      { start: new Date('2026-06-01'), finish: new Date('2026-08-31'), work: 10000, actualWork: 3300, bl0: 10000 },
      { start: new Date('2026-07-01'), finish: new Date('2026-09-30'), work: 8000, actualWork: 1300, bl0: 8200 },
      { start: new Date('2026-08-01'), finish: new Date('2026-10-31'), work: 6000, actualWork: 0, bl0: 6000 },
      { start: new Date('2026-09-01'), finish: new Date('2026-11-30'), work: 4000, actualWork: 0, bl0: 4000 },
      { start: new Date('2026-10-01'), finish: new Date('2026-12-20'), work: 2400, actualWork: 0, bl0: 2400 },
    ]

    for (let w = 0; w <= totalWeeks; w++) {
      const weekDate = new Date(startDate)
      weekDate.setDate(weekDate.getDate() + w * 7)
      const weekEnd = new Date(weekDate)
      weekEnd.setDate(weekEnd.getDate() + 6)
      weekEnd.setHours(23, 59, 59, 999)

      const months = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
      const weekNum = Math.ceil((w + 1))
      const label = `${months[weekDate.getMonth()]}/${weekDate.getFullYear()} (W${String(weekNum).padStart(2, '0')})`
      const periodKey = `${weekDate.getFullYear()}-${String(weekDate.getMonth() + 1).padStart(2, '0')}-${String(weekDate.getDate()).padStart(2, '0')}`

      let planned = 0
      let actual = 0
      const baselines: Record<number, number> = {}

      for (const a of activities) {
        const aStart = a.start.getTime()
        const aFinish = a.finish.getTime()
        const wStart = weekDate.getTime()
        const wEnd = weekEnd.getTime()

        const overlapStart = Math.max(aStart, wStart)
        const overlapEnd = Math.min(aFinish, wEnd)

        if (overlapEnd < overlapStart) continue

        const totalDur = aFinish - aStart
        const overlapDur = overlapEnd - overlapStart
        const fraction = totalDur > 0 ? overlapDur / totalDur : 0

        planned += (a.work / 60) * fraction // converter minutos → horas
        actual += (a.actualWork / 60) * fraction
        baselines[0] = (baselines[0] || 0) + (a.bl0 / 60) * fraction
      }

      weeks.push({
        weekStart: new Date(weekDate),
        weekLabel: label,
        periodKey,
        planned: Math.round(planned * 100) / 100,
        actual: Math.round(actual * 100) / 100,
        baselines,
        costPlanned: 0,
      })
    }

    // Calcular totais
    const totals = {
      plannedHours: weeks.reduce((sum, w) => sum + w.planned, 0),
      actualHours: weeks.reduce((sum, w) => sum + w.actual, 0),
      baselineHours: {} as Record<number, number>,
    }
    for (const w of weeks) {
      for (const [blIdx, val] of Object.entries(w.baselines)) {
        totals.baselineHours[parseInt(blIdx)] = (totals.baselineHours[parseInt(blIdx)] || 0) + val
      }
    }

    const series: TimephasedSeries = {
      granularity: 'week',
      rawPoints: [],
      weeks,
      totals,
      dateRange: { start: startDate, end: endDate },
      available: true,
      baselineIndices: new Set([0]),
    }
    return series
  })(),
}
