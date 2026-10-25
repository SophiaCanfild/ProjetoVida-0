/* ============================================================
   VIDA+ — RECEITA MÉDICA E SOLICITAÇÃO DE EXAMES
   ------------------------------------------------------------
   Regras e utilitários da área do médico (sem dependência de
   tela). Usado por sistema-medico/medico/index.html.

   Classificação regulatória de cada medicamento:
     comum          → receita simples, 1 via
     antimicrobiano → RDC Anvisa nº 471/2021: 2 vias (a 2ª via fica
                      retida na farmácia), válida por 10 dias
     c1             → Portaria SVS/MS nº 344/1998 (controle especial):
                      2 vias (a 1ª via fica retida), válida por 30 dias,
                      no máximo 3 substâncias C1 por receita e
                      quantidade em algarismos E por extenso
     listas A/B     → exigem Notificação de Receita (talonário oficial
                      numerado pela Vigilância Sanitária): o sistema
                      NÃO emite esse documento.

   Os itens de um atendimento são separados automaticamente em
   uma receita por tipo (simples / antimicrobiano / controle
   especial), como nos prontuários eletrônicos profissionais.
   ============================================================ */
(function (global) {
  'use strict';

  // ------------------------------------------------------------
  // Utilidades de texto e data
  // ------------------------------------------------------------
  function normalizar(txt) {
    return String(txt || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // termo aparece como palavra(s) inteira(s) dentro de texto (ambos normalizados)
  function contemTermo(texto, termo) {
    if (!texto || !termo) return false;
    const seguro = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(^|[^a-z0-9])' + seguro + '([^a-z0-9]|$)').test(texto);
  }

  function esc(txt) {
    return String(txt === undefined || txt === null ? '' : txt)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Aceita ISO completo ou só a data (AAAA-MM-DD). A data pura é lida
  // como data LOCAL — new Date('2026-11-04') seria meia-noite UTC e
  // apareceria como 03/11 no Brasil.
  function paraData(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor));
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(valor);
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtData(valor) {
    const d = paraData(valor);
    return d ? d.toLocaleDateString('pt-BR') : '—';
  }

  function fmtDataHora(valor) {
    const d = paraData(valor);
    if (!d) return '—';
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
    'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function dataPorExtenso(valor) {
    const d = paraData(valor) || new Date();
    return d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }

  function dataIso(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function somarDias(base, dias) {
    const d = paraData(base) || new Date();
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    r.setDate(r.getDate() + (parseInt(dias, 10) || 0));
    return dataIso(r);
  }

  function idade(nascimento) {
    const n = paraData(nascimento);
    if (!n) return null;
    const h = new Date();
    let anos = h.getFullYear() - n.getFullYear();
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) anos--;
    return anos;
  }

  function formatarCpf(cpf) {
    const c = String(cpf || '').replace(/\D/g, '');
    return c.length === 11 ? c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (cpf || '—');
  }

  function rotuloSexo(s) {
    return { F: 'Feminino', M: 'Masculino', O: 'Outro' }[s] || '—';
  }

  function textoCrm(crm) {
    if (!crm) return '';
    return /^crm/i.test(String(crm).trim()) ? String(crm).trim() : 'CRM ' + String(crm).trim();
  }

  // ------------------------------------------------------------
  // Tipos de receita
  // ------------------------------------------------------------
  const TIPOS_RECEITA = {
    simples: {
      rotulo: 'Receita simples',
      curto: 'Simples',
      titulo: 'RECEITUÁRIO',
      vias: 1,
      validadeFixa: null,
      validadePadrao: 30,
      norma: 'Receita comum: 1 via. Sem prazo federal fixo — validade definida pelo prescritor.',
      viasRotulos: ['Via do paciente']
    },
    antimicrobiano: {
      rotulo: 'Receita de antimicrobiano',
      curto: 'Antimicrobiano',
      titulo: 'RECEITUÁRIO — ANTIMICROBIANO',
      vias: 2,
      validadeFixa: 10,
      norma: 'RDC Anvisa nº 471/2021: 2 vias, a 2ª via fica retida na farmácia; válida por 10 dias.',
      viasRotulos: ['1ª via — Paciente', '2ª via — Retenção da farmácia']
    },
    controle_especial: {
      rotulo: 'Receita de controle especial',
      curto: 'Controle especial',
      titulo: 'RECEITUÁRIO DE CONTROLE ESPECIAL',
      vias: 2,
      validadeFixa: 30,
      maxItens: 3,
      norma: 'Portaria SVS/MS nº 344/1998: 2 vias, a 1ª via fica retida na farmácia; válida por 30 dias; até 3 substâncias da lista C1 por receita.',
      viasRotulos: ['1ª via — Retenção da farmácia ou drogaria', '2ª via — Orientação ao paciente']
    }
  };

  const CLASSES = {
    comum: { rotulo: 'Comum', tipoReceita: 'simples' },
    antimicrobiano: { rotulo: 'Antimicrobiano', tipoReceita: 'antimicrobiano' },
    c1: { rotulo: 'Controle especial (C1)', tipoReceita: 'controle_especial' }
  };

  // ------------------------------------------------------------
  // Catálogos
  // ------------------------------------------------------------
  const MEDICAMENTOS = [
    // Analgésicos, antitérmicos e anti-inflamatórios
    { nome: 'Paracetamol 500 mg comprimido', via: 'Oral' },
    { nome: 'Paracetamol 750 mg comprimido', via: 'Oral' },
    { nome: 'Paracetamol 200 mg/mL solução oral (gotas)', via: 'Oral' },
    { nome: 'Dipirona 500 mg comprimido', via: 'Oral' },
    { nome: 'Dipirona 500 mg/mL solução oral (gotas)', via: 'Oral' },
    { nome: 'Ibuprofeno 400 mg comprimido', via: 'Oral' },
    { nome: 'Ibuprofeno 600 mg comprimido', via: 'Oral' },
    { nome: 'Ibuprofeno 50 mg/mL suspensão oral (gotas)', via: 'Oral' },
    { nome: 'Diclofenaco de sódio 50 mg comprimido', via: 'Oral' },
    { nome: 'Nimesulida 100 mg comprimido', via: 'Oral' },
    { nome: 'Ácido acetilsalicílico 100 mg comprimido', via: 'Oral' },
    // Antimicrobianos (RDC 471/2021)
    { nome: 'Amoxicilina 500 mg cápsula', via: 'Oral' },
    { nome: 'Amoxicilina 50 mg/mL suspensão oral', via: 'Oral' },
    { nome: 'Amoxicilina + clavulanato de potássio 500 mg + 125 mg comprimido', via: 'Oral' },
    { nome: 'Azitromicina 500 mg comprimido', via: 'Oral' },
    { nome: 'Cefalexina 500 mg cápsula', via: 'Oral' },
    { nome: 'Ciprofloxacino 500 mg comprimido', via: 'Oral' },
    { nome: 'Sulfametoxazol + trimetoprima 400 mg + 80 mg comprimido', via: 'Oral' },
    { nome: 'Metronidazol 400 mg comprimido', via: 'Oral' },
    { nome: 'Nitrofurantoína 100 mg cápsula', via: 'Oral' },
    { nome: 'Benzilpenicilina benzatina 1.200.000 UI pó para suspensão injetável', via: 'Intramuscular' },
    // Antialérgicos e corticoides
    { nome: 'Loratadina 10 mg comprimido', via: 'Oral' },
    { nome: 'Dexclorfeniramina 2 mg comprimido', via: 'Oral' },
    { nome: 'Prednisona 20 mg comprimido', via: 'Oral' },
    { nome: 'Prednisolona 3 mg/mL solução oral', via: 'Oral' },
    // Aparelho digestivo
    { nome: 'Omeprazol 20 mg cápsula', via: 'Oral' },
    { nome: 'Metoclopramida 10 mg comprimido', via: 'Oral' },
    { nome: 'Ondansetrona 8 mg comprimido', via: 'Oral' },
    { nome: 'Butilbrometo de escopolamina 10 mg comprimido', via: 'Oral' },
    { nome: 'Sais para reidratação oral (envelope)', via: 'Oral' },
    // Aparelho respiratório
    { nome: 'Salbutamol 100 mcg/dose aerossol', via: 'Inalatória' },
    { nome: 'Beclometasona 250 mcg/dose aerossol', via: 'Inalatória' },
    // Doenças crônicas
    { nome: 'Losartana potássica 50 mg comprimido', via: 'Oral' },
    { nome: 'Hidroclorotiazida 25 mg comprimido', via: 'Oral' },
    { nome: 'Enalapril 10 mg comprimido', via: 'Oral' },
    { nome: 'Anlodipino 5 mg comprimido', via: 'Oral' },
    { nome: 'Metformina 850 mg comprimido', via: 'Oral' },
    { nome: 'Glibenclamida 5 mg comprimido', via: 'Oral' },
    { nome: 'Sinvastatina 20 mg comprimido', via: 'Oral' },
    { nome: 'Levotiroxina 50 mcg comprimido', via: 'Oral' },
    // Outros
    { nome: 'Sulfato ferroso 40 mg de ferro comprimido', via: 'Oral' },
    { nome: 'Ácido fólico 5 mg comprimido', via: 'Oral' },
    { nome: 'Albendazol 400 mg comprimido', via: 'Oral' },
    { nome: 'Ivermectina 6 mg comprimido', via: 'Oral' },
    { nome: 'Fluconazol 150 mg cápsula', via: 'Oral' },
    { nome: 'Miconazol 2% creme', via: 'Tópica' },
    { nome: 'Dexametasona 0,1% creme', via: 'Tópica' },
    // Controle especial — lista C1 (Portaria 344/98)
    { nome: 'Fluoxetina 20 mg cápsula', via: 'Oral' },
    { nome: 'Sertralina 50 mg comprimido', via: 'Oral' },
    { nome: 'Amitriptilina 25 mg comprimido', via: 'Oral' },
    { nome: 'Carbamazepina 200 mg comprimido', via: 'Oral' },
    { nome: 'Ácido valproico 250 mg cápsula', via: 'Oral' },
    { nome: 'Haloperidol 5 mg comprimido', via: 'Oral' },
    { nome: 'Risperidona 2 mg comprimido', via: 'Oral' }
  ];

  // Princípios ativos usados na classificação automática (nomes normalizados)
  const ANTIMICROBIANOS = ['amoxicilina', 'ampicilina', 'azitromicina', 'benzilpenicilina', 'penicilina',
    'cefalexina', 'cefadroxila', 'cefuroxima', 'ceftriaxona', 'ciprofloxacino', 'levofloxacino',
    'norfloxacino', 'claritromicina', 'eritromicina', 'clindamicina', 'doxiciclina', 'tetraciclina',
    'metronidazol', 'nitrofurantoina', 'fosfomicina', 'sulfametoxazol', 'trimetoprima', 'oxacilina'];

  const CONTROLE_C1 = ['amitriptilina', 'nortriptilina', 'imipramina', 'clomipramina', 'fluoxetina',
    'sertralina', 'paroxetina', 'citalopram', 'escitalopram', 'venlafaxina', 'duloxetina', 'bupropiona',
    'mirtazapina', 'trazodona', 'acido valproico', 'valproato', 'divalproato', 'carbamazepina',
    'oxcarbazepina', 'fenitoina', 'lamotrigina', 'topiramato', 'gabapentina', 'pregabalina',
    'haloperidol', 'risperidona', 'quetiapina', 'olanzapina', 'clorpromazina', 'levomepromazina',
    'aripiprazol', 'litio', 'biperideno', 'periciazina'];

  // Listas A e B: exigem Notificação de Receita (fora do sistema)
  const NOTIFICACAO = [
    { termo: 'diazepam', lista: 'B1' }, { termo: 'clonazepam', lista: 'B1' },
    { termo: 'alprazolam', lista: 'B1' }, { termo: 'lorazepam', lista: 'B1' },
    { termo: 'bromazepam', lista: 'B1' }, { termo: 'midazolam', lista: 'B1' },
    { termo: 'morfina', lista: 'A1' }, { termo: 'metadona', lista: 'A1' },
    { termo: 'oxicodona', lista: 'A1' }, { termo: 'fentanil', lista: 'A1' },
    { termo: 'metilfenidato', lista: 'A3' }
  ];

  const VIAS_ADMINISTRACAO = ['Oral', 'Sublingual', 'Inalatória', 'Tópica', 'Oftálmica', 'Otológica',
    'Nasal', 'Retal', 'Vaginal', 'Intramuscular', 'Intravenosa', 'Subcutânea'];

  const VERBO_VIA = {
    'Oral': 'Tomar', 'Sublingual': 'Dissolver sob a língua', 'Inalatória': 'Inalar',
    'Tópica': 'Aplicar', 'Oftálmica': 'Pingar', 'Otológica': 'Pingar', 'Nasal': 'Aplicar',
    'Retal': 'Aplicar', 'Vaginal': 'Aplicar', 'Intramuscular': 'Aplicar',
    'Intravenosa': 'Aplicar', 'Subcutânea': 'Aplicar'
  };

  const FREQUENCIAS = ['1x ao dia', '2x ao dia (12/12h)', '3x ao dia (8/8h)', '4x ao dia (6/6h)',
    'De 4/4h', 'De 6/6h', 'De 8/8h', 'De 12/12h', 'Se necessário (até 4x ao dia)', 'Dose única',
    'À noite, ao deitar', 'Em jejum, pela manhã'];

  const DURACOES = ['Dose única', '3 dias', '5 dias', '7 dias', '10 dias', '14 dias', '30 dias',
    '60 dias', 'Uso contínuo'];

  const CATEGORIAS_EXAME = {
    laboratorial: { rotulo: 'Laboratorial', icone: 'fa-flask' },
    imagem: { rotulo: 'Imagem', icone: 'fa-x-ray' },
    cardiologico: { rotulo: 'Cardiológico', icone: 'fa-heart-pulse' },
    teste_rapido: { rotulo: 'Teste rápido', icone: 'fa-vial' },
    outros: { rotulo: 'Outros', icone: 'fa-file-medical' }
  };

  const LOCAIS_EXAME = ['Laboratório da unidade', 'Laboratório municipal (coleta central)',
    'Sala de procedimentos da unidade', 'Centro de diagnóstico por imagem',
    'Serviço de referência (encaminhamento)'];

  const LOCAL_PADRAO = {
    laboratorial: 'Laboratório da unidade',
    teste_rapido: 'Sala de procedimentos da unidade',
    imagem: 'Centro de diagnóstico por imagem',
    cardiologico: 'Serviço de referência (encaminhamento)',
    outros: ''
  };

  const EXAMES = [
    { nome: 'Hemograma completo', categoria: 'laboratorial', preparo: 'Não requer jejum.', frequente: true },
    { nome: 'Glicemia de jejum', categoria: 'laboratorial', preparo: 'Jejum de 8 a 12 horas (água liberada).', frequente: true },
    { nome: 'Hemoglobina glicada (HbA1c)', categoria: 'laboratorial', preparo: 'Não requer jejum.' },
    { nome: 'Colesterol total e frações (HDL, LDL)', categoria: 'laboratorial', preparo: 'Jejum não obrigatório; manter a alimentação habitual. Siga a orientação do laboratório.', frequente: true },
    { nome: 'Triglicerídeos', categoria: 'laboratorial', preparo: 'Jejum não obrigatório; siga a orientação do laboratório.' },
    { nome: 'Creatinina', categoria: 'laboratorial', preparo: 'Não requer jejum.', frequente: true },
    { nome: 'Ureia', categoria: 'laboratorial', preparo: 'Não requer jejum.' },
    { nome: 'TGO (AST) e TGP (ALT)', categoria: 'laboratorial', preparo: 'Não requer jejum.' },
    { nome: 'TSH e T4 livre', categoria: 'laboratorial', preparo: 'Não requer jejum. Quem usa levotiroxina deve colher antes da dose do dia.' },
    { nome: 'Proteína C reativa (PCR)', categoria: 'laboratorial', preparo: 'Não requer jejum.' },
    { nome: 'VHS (velocidade de hemossedimentação)', categoria: 'laboratorial', preparo: 'Não requer jejum.' },
    { nome: 'Urina tipo 1 (EAS)', categoria: 'laboratorial', preparo: 'Primeira urina da manhã, jato médio, após higiene íntima.', frequente: true },
    { nome: 'Urocultura com antibiograma', categoria: 'laboratorial', preparo: 'Jato médio após higiene íntima, de preferência antes de iniciar antibiótico.' },
    { nome: 'Parasitológico de fezes (EPF)', categoria: 'laboratorial', preparo: 'Coletar em frasco próprio fornecido pela unidade.' },
    { nome: 'Beta-HCG quantitativo', categoria: 'laboratorial', preparo: 'Não requer jejum.' },
    { nome: 'Teste rápido para COVID-19 (antígeno)', categoria: 'teste_rapido', preparo: 'Coleta de swab nasal na própria unidade.', frequente: true },
    { nome: 'Teste rápido para dengue (NS1/IgM/IgG)', categoria: 'teste_rapido', preparo: 'Realizado na própria unidade.' },
    { nome: 'Teste rápido para HIV', categoria: 'teste_rapido', preparo: 'Realizado na própria unidade, com aconselhamento.' },
    { nome: 'Teste rápido para sífilis', categoria: 'teste_rapido', preparo: 'Realizado na própria unidade.' },
    { nome: 'Teste rápido para hepatites B e C', categoria: 'teste_rapido', preparo: 'Realizado na própria unidade.' },
    { nome: 'Glicemia capilar', categoria: 'teste_rapido', preparo: 'Realizado na própria unidade.' },
    { nome: 'Raio-X de tórax (PA e perfil)', categoria: 'imagem', preparo: 'Retirar objetos metálicos. Informe se houver possibilidade de gravidez.', frequente: true },
    { nome: 'Raio-X de seios da face', categoria: 'imagem', preparo: 'Retirar objetos metálicos. Informe se houver possibilidade de gravidez.' },
    { nome: 'Ultrassonografia de abdome total', categoria: 'imagem', preparo: 'Jejum de 6 a 8 horas; dieta leve na véspera.' },
    { nome: 'Ultrassonografia pélvica', categoria: 'imagem', preparo: 'Bexiga cheia: beber de 4 a 6 copos de água 1 hora antes e não urinar.' },
    { nome: 'Eletrocardiograma (ECG)', categoria: 'cardiologico', preparo: 'Não passar cremes ou óleos no tórax no dia do exame.', local: 'Sala de procedimentos da unidade', frequente: true },
    { nome: 'Ecocardiograma transtorácico', categoria: 'cardiologico', preparo: 'Não requer preparo.' },
    { nome: 'Teste ergométrico', categoria: 'cardiologico', preparo: 'Roupa e tênis confortáveis; refeição leve 2 horas antes.' },
    { nome: 'Holter 24 horas', categoria: 'cardiologico', preparo: 'Tomar banho antes; não molhar o aparelho durante o exame.' }
  ];

  const STATUS_EXAME = {
    solicitado: { rotulo: 'Solicitado', classe: 'st-solicitado', icone: 'fa-clock' },
    realizado: { rotulo: 'Realizado / em análise', classe: 'st-realizado', icone: 'fa-flask-vial' },
    resultado_disponivel: { rotulo: 'Resultado disponível', classe: 'st-resultado', icone: 'fa-file-circle-check' },
    cancelado: { rotulo: 'Cancelado', classe: 'st-cancelado', icone: 'fa-ban' }
  };

  function buscarExameCatalogo(nome) {
    const n = normalizar(nome);
    return EXAMES.find(e => normalizar(e.nome) === n) || null;
  }

  function buscarMedicamentoCatalogo(nome) {
    const n = normalizar(nome);
    return MEDICAMENTOS.find(m => normalizar(m.nome) === n) || null;
  }

  // ------------------------------------------------------------
  // Classificação regulatória
  // ------------------------------------------------------------
  // → { classe: 'comum'|'antimicrobiano'|'c1', notificacao: null|'B1'|'A1'..., reconhecido }
  function classificarMedicamento(nome) {
    const n = normalizar(nome);
    const resultado = { classe: 'comum', notificacao: null, reconhecido: false };
    if (!n) return resultado;
    const notif = NOTIFICACAO.find(x => contemTermo(n, x.termo));
    if (notif) { resultado.notificacao = notif.lista; resultado.reconhecido = true; }
    if (CONTROLE_C1.some(t => contemTermo(n, t))) {
      resultado.classe = 'c1'; resultado.reconhecido = true;
    } else if (ANTIMICROBIANOS.some(t => contemTermo(n, t))) {
      resultado.classe = 'antimicrobiano'; resultado.reconhecido = true;
    }
    return resultado;
  }

  // ------------------------------------------------------------
  // Alerta de alergia
  // ------------------------------------------------------------
  const GRUPOS_ALERGIA = [
    { nome: 'penicilinas — reatividade cruzada', cruzada: true,
      termos: ['penicilina', 'penicilinas', 'betalactamico', 'betalactamicos', 'beta-lactamico', 'beta-lactamicos', 'benzetacil'],
      meds: ['penicilina', 'benzilpenicilina', 'amoxicilina', 'ampicilina', 'oxacilina', 'piperacilina', 'benzetacil'] },
    { nome: 'cefalosporinas — reatividade cruzada', cruzada: true,
      termos: ['cefalosporina', 'cefalosporinas'],
      meds: ['cefalexina', 'cefadroxila', 'cefazolina', 'cefuroxima', 'ceftriaxona', 'cefepima', 'cefotaxima'] },
    { nome: 'sulfonamidas — reatividade cruzada', cruzada: true,
      termos: ['sulfa', 'sulfas', 'sulfonamida', 'sulfonamidas'],
      meds: ['sulfametoxazol', 'sulfadiazina', 'sulfassalazina'] },
    { nome: 'anti-inflamatórios (AINEs) — reatividade cruzada', cruzada: true,
      termos: ['aine', 'aines', 'anti-inflamatorio', 'anti-inflamatorios', 'antiinflamatorio', 'antiinflamatorios', 'aas', 'aspirina'],
      meds: ['acido acetilsalicilico', 'aas', 'aspirina', 'ibuprofeno', 'diclofenaco', 'nimesulida', 'cetoprofeno', 'naproxeno', 'piroxicam', 'meloxicam', 'cetorolaco', 'indometacina'] },
    { nome: 'dipirona (metamizol)', cruzada: false,
      termos: ['dipirona', 'metamizol', 'novalgina'], meds: ['dipirona', 'metamizol'] },
    { nome: 'paracetamol (acetaminofeno)', cruzada: false,
      termos: ['paracetamol', 'acetaminofeno', 'acetaminofen', 'tylenol'], meds: ['paracetamol', 'acetaminofeno'] },
    { nome: 'macrolídeos — reatividade cruzada', cruzada: true,
      termos: ['macrolideo', 'macrolideos'], meds: ['azitromicina', 'claritromicina', 'eritromicina'] },
    { nome: 'quinolonas — reatividade cruzada', cruzada: true,
      termos: ['quinolona', 'quinolonas', 'fluoroquinolona', 'fluoroquinolonas'],
      meds: ['ciprofloxacino', 'levofloxacino', 'norfloxacino', 'moxifloxacino'] }
  ];

  // Palavras que descrevem forma/sal/apresentação, não o princípio ativo
  const PALAVRAS_GENERICAS = ['comprimido', 'comprimidos', 'capsula', 'capsulas', 'solucao', 'oral', 'gotas',
    'suspensao', 'creme', 'pomada', 'injetavel', 'xarope', 'frasco', 'ampola', 'aerossol', 'spray', 'dose',
    'potassio', 'potassica', 'sodio', 'sodica', 'sodico', 'cloridrato', 'mesilato', 'maleato', 'sulfato',
    'acetato', 'fosfato', 'carbonato', 'acido', 'retard', 'liberacao', 'prolongada', 'colirio', 'envelope',
    'para', 'clavulanato', 'ferro', 'nitrato'];

  const SEM_ALERGIA = /^(nenhuma|nenhum|nega|nega alergias?|nao|nao possui|nao tem|sem alergias?|nda|nkda|-)$/;

  // → [{ alergia, motivo }]
  function verificarAlergias(nomeMedicamento, alergias) {
    const med = normalizar(nomeMedicamento);
    if (!med) return [];
    const palavrasMed = med.split(/[^a-z0-9-]+/)
      .filter(p => p.length >= 4 && PALAVRAS_GENERICAS.indexOf(p) === -1 && !/^\d/.test(p));
    const conflitos = [];

    (alergias || []).forEach(original => {
      const a = normalizar(original);
      if (!a || SEM_ALERGIA.test(a)) return;

      // 1) mesmo princípio ativo (ex.: alergia "Dipirona" × "Dipirona 500 mg")
      if ((a.length >= 3 && contemTermo(med, a)) || palavrasMed.some(p => contemTermo(a, p))) {
        conflitos.push({ alergia: original, motivo: 'mesmo princípio ativo' });
        return;
      }
      // 2) mesma classe / reatividade cruzada
      for (const g of GRUPOS_ALERGIA) {
        const alergiaNoGrupo = g.termos.some(t => contemTermo(a, t)) ||
          (g.cruzada && g.meds.some(m => contemTermo(a, m)));
        if (alergiaNoGrupo && g.meds.some(m => contemTermo(med, m))) {
          conflitos.push({ alergia: original, motivo: g.nome });
          return;
        }
      }
    });
    return conflitos;
  }

  // ------------------------------------------------------------
  // Separação automática dos itens em receitas por tipo
  // ------------------------------------------------------------
  function agruparReceitas(itens, opcoes) {
    opcoes = opcoes || {};
    const porTipo = { simples: [], antimicrobiano: [], controle_especial: [] };
    (itens || []).forEach(item => {
      const tipo = (CLASSES[item.classe] || CLASSES.comum).tipoReceita;
      porTipo[tipo].push(item);
    });

    const grupos = [];
    if (porTipo.simples.length) grupos.push({ chave: 'simples', tipo: 'simples', itens: porTipo.simples });
    if (porTipo.antimicrobiano.length) grupos.push({ chave: 'antimicrobiano', tipo: 'antimicrobiano', itens: porTipo.antimicrobiano });
    const max = TIPOS_RECEITA.controle_especial.maxItens;
    for (let i = 0; i < porTipo.controle_especial.length; i += max) {
      grupos.push({
        chave: 'controle_especial-' + (i / max + 1),
        tipo: 'controle_especial',
        itens: porTipo.controle_especial.slice(i, i + max)
      });
    }

    grupos.forEach(g => {
      const cfg = TIPOS_RECEITA[g.tipo];
      g.vias = cfg.vias;
      g.validade_dias = cfg.validadeFixa ||
        Math.min(365, Math.max(1, parseInt(opcoes.validadeSimples, 10) || cfg.validadePadrao));
    });
    return grupos;
  }

  // ------------------------------------------------------------
  // Número por extenso (quantidade da receita de controle especial)
  // ------------------------------------------------------------
  const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
    'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
    'setecentos', 'oitocentos', 'novecentos'];

  function unidadeExtenso(n, fem) {
    if (fem && n === 1) return 'uma';
    if (fem && n === 2) return 'duas';
    return UNIDADES[n];
  }

  function ate999(n, fem) {
    if (n === 0) return '';
    if (n === 100) return 'cem';
    const partes = [];
    const c = Math.floor(n / 100);
    const resto = n % 100;
    if (c) partes.push(fem && c > 1 ? CENTENAS[c].replace(/os$/, 'as') : CENTENAS[c]);
    if (resto) {
      if (resto < 20) partes.push(unidadeExtenso(resto, fem));
      else {
        const d = Math.floor(resto / 10);
        const u = resto % 10;
        partes.push(u ? DEZENAS[d] + ' e ' + unidadeExtenso(u, fem) : DEZENAS[d]);
      }
    }
    return partes.join(' e ');
  }

  function numeroPorExtenso(numero, feminino) {
    const n = Math.floor(Math.abs(Number(numero) || 0));
    if (n === 0) return 'zero';
    if (n >= 1000000) return String(n);
    const mil = Math.floor(n / 1000);
    const resto = n % 1000;
    let txt = '';
    if (mil) txt = mil === 1 ? 'mil' : ate999(mil, feminino) + ' mil';
    if (resto) txt += (mil ? ((resto < 100 || resto % 100 === 0) ? ' e ' : ' ') : '') + ate999(resto, feminino);
    return txt;
  }

  // "21 cápsulas" → "21 (vinte e uma) cápsulas"
  function quantidadePorExtenso(qtd) {
    const m = /^\s*(\d{1,6})\s*(.*)$/.exec(String(qtd || ''));
    if (!m) return qtd || '';
    const resto = m[2] || '';
    const fem = /^(c[aá]psula|ampola|caixa|bisnaga|gota|unidade|dr[aá]gea|pastilha|seringa|bolsa|lata|cartela|bombinha|flaconete)/i.test(resto.trim());
    return m[1] + ' (' + numeroPorExtenso(parseInt(m[1], 10), fem) + ')' + (resto ? ' ' + resto : '');
  }

  // ------------------------------------------------------------
  // Unidade de saúde (cabeçalho dos documentos)
  // ------------------------------------------------------------
  const UNIDADES_INFO = {
    'UBS Central Araucária': { nome: 'UBS Central Araucária', endereco: '', cidade: 'Araucária', estado: 'PR', telefone: '(41) 3333-4444' },
    'UPA Araucária': { nome: 'UPA Araucária', endereco: '', cidade: 'Araucária', estado: 'PR', telefone: '(41) 3333-5555' }
  };

  function dadosUnidade(nome) {
    const n = nome || (global.APP_CONFIG && APP_CONFIG.UNIDADES && APP_CONFIG.UNIDADES[0]) || 'Unidade de Saúde';
    return UNIDADES_INFO[n] || { nome: n, endereco: '', cidade: '', estado: '', telefone: '' };
  }

  // Complementa com os dados reais da tabela public.unidades (quando há Supabase)
  async function carregarUnidades() {
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
      const { data, error } = await supabaseClient.from('unidades').select('nome, endereco, cidade, estado, telefone');
      if (error || !Array.isArray(data)) return;
      data.forEach(u => { if (u && u.nome) UNIDADES_INFO[u.nome] = Object.assign({}, UNIDADES_INFO[u.nome] || {}, u); });
    } catch (e) { /* segue com os dados padrão */ }
  }

  // ------------------------------------------------------------
  // Documentos para impressão
  // ------------------------------------------------------------
  function cssDocumento() {
    return [
      '@page { size: A4; margin: 12mm 14mm; }',
      '* { box-sizing: border-box; }',
      'html, body { margin: 0; padding: 0; }',
      'body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; font-size: 11pt; background: #e5e7eb; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '.folha { position: relative; background: #fff; width: 210mm; min-height: 297mm; margin: 12px auto; padding: 14mm 16mm; box-shadow: 0 2px 10px rgba(0,0,0,.18); display: flex; flex-direction: column; overflow: hidden; }',
      '.cab { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #0369a1; padding-bottom: 10px; }',
      '.cab img { width: 44px; height: 44px; object-fit: contain; }',
      '.cab .inst { font-weight: 700; font-size: 13pt; color: #0f2a43; }',
      '.cab .end { font-size: 8.5pt; color: #4b5563; margin-top: 2px; }',
      '.cab .via { margin-left: auto; border: 1.5px solid #0369a1; color: #0369a1; font-weight: 700; font-size: 8.5pt; padding: 6px 10px; border-radius: 6px; text-align: center; max-width: 62mm; text-transform: uppercase; }',
      'h1 { font-size: 14pt; text-align: center; letter-spacing: 1px; margin: 14px 0 4px; color: #0f2a43; }',
      '.meta { display: flex; justify-content: center; gap: 18px; font-size: 9pt; color: #374151; margin-bottom: 12px; flex-wrap: wrap; }',
      '.caixa { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; }',
      '.tit { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: .5px; margin-bottom: 5px; }',
      '.grade { display: grid; grid-template-columns: 2.2fr 1.4fr 1.4fr 0.7fr 1fr; gap: 6px 12px; }',
      '.campo label { display: block; font-size: 7pt; text-transform: uppercase; color: #64748b; letter-spacing: .4px; }',
      '.campo div { font-size: 10pt; font-weight: 600; }',
      '.linha2 { margin-top: 6px; font-size: 9.5pt; }',
      '.alergia { margin-top: 6px; font-size: 9.5pt; color: #b91c1c; font-weight: 700; }',
      '.corpo { flex: 1; padding: 4px 2px; }',
      '.uso { font-weight: 700; text-decoration: underline; margin: 10px 0 6px; font-size: 10.5pt; text-transform: uppercase; }',
      'ol.itens { margin: 0; padding-left: 22px; }',
      'ol.itens li { margin-bottom: 11px; }',
      '.linha-med { display: flex; align-items: baseline; gap: 6px; }',
      '.linha-med .nome { font-weight: 700; }',
      '.linha-med .pontos { flex: 1; border-bottom: 1px dotted #9ca3af; min-width: 20px; }',
      '.linha-med .qtd { font-weight: 700; white-space: nowrap; }',
      '.posologia { font-size: 10.5pt; margin-top: 2px; }',
      '.obs { font-size: 9.5pt; color: #4b5563; font-style: italic; margin-top: 1px; }',
      '.orientacoes { font-size: 10pt; border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 8px; white-space: pre-wrap; }',
      '.assinatura { margin-top: 22px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }',
      '.assinatura .local { font-size: 10pt; }',
      '.assinatura .ass { text-align: center; min-width: 78mm; }',
      '.assinatura .traco { border-top: 1px solid #111827; margin-bottom: 4px; }',
      '.assinatura .nome { font-weight: 700; font-size: 10.5pt; }',
      '.peq { font-size: 8pt; color: #4b5563; }',
      '.duas { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }',
      '.preencher { display: flex; gap: 6px; align-items: flex-end; font-size: 8pt; color: #475569; margin-top: 7px; }',
      '.preencher span.l { flex: 1; border-bottom: 1px solid #94a3b8; height: 12px; }',
      '.grade4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }',
      '.rodape { margin-top: 10px; font-size: 7.5pt; color: #6b7280; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 6px; }',
      '.marca { position: absolute; top: 42%; left: -10%; right: -10%; text-align: center; font-size: 44pt; color: rgba(220, 38, 38, 0.10); transform: rotate(-28deg); font-weight: 800; pointer-events: none; letter-spacing: 4px; }',
      'table.exames { width: 100%; border-collapse: collapse; font-size: 9.5pt; }',
      'table.exames th { text-align: left; font-size: 7.5pt; text-transform: uppercase; color: #475569; background: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 6px; }',
      'table.exames td { border-bottom: 1px solid #e2e8f0; padding: 7px 6px; vertical-align: top; }',
      '.urgente { color: #b91c1c; font-weight: 700; }',
      '.aviso-paciente { font-size: 9pt; background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 8px 10px; margin-top: 10px; }',
      '@media print {',
      '  body { background: #fff; }',
      '  .folha { width: auto; min-height: 266mm; margin: 0; padding: 0; box-shadow: none; break-after: page; page-break-after: always; }',
      '  .folha:last-child { break-after: auto; page-break-after: auto; }',
      '}'
    ].join('\n');
  }

  function envolverDocumento(titulo, folhas) {
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + esc(titulo) +
      '</title><style>' + cssDocumento() + '</style></head><body>' + folhas.join('') + '</body></html>';
  }

  function cabecalho(unidadeNome, viaRotulo, ctx) {
    const u = dadosUnidade(unidadeNome);
    const endereco = [u.endereco, [u.cidade, u.estado].filter(Boolean).join('/')].filter(Boolean).join(' — ');
    const contato = [endereco, u.telefone ? 'Tel. ' + u.telefone : ''].filter(Boolean).join(' • ');
    return '<div class="cab">' +
      (ctx.logoUrl ? '<img src="' + esc(ctx.logoUrl) + '" alt="">' : '') +
      '<div><div class="inst">' + esc(u.nome) + '</div>' +
      '<div class="end">' + esc(contato || 'Sistema Único de Saúde') + '</div></div>' +
      (viaRotulo ? '<div class="via">' + esc(viaRotulo) + '</div>' : '') +
      '</div>';
  }

  function blocoPaciente(paciente, opcoes) {
    const p = paciente || {};
    const anos = idade(p.nascimento);
    const alergias = (p.alergias || []).filter(a => a && !SEM_ALERGIA.test(normalizar(a)));
    return '<div class="caixa"><div class="tit">Identificação do paciente</div>' +
      '<div class="grade">' +
      '<div class="campo"><label>Nome</label><div>' + esc(p.nome || '—') + '</div></div>' +
      '<div class="campo"><label>CPF</label><div>' + esc(formatarCpf(p.cpf)) + '</div></div>' +
      '<div class="campo"><label>Cartão SUS</label><div>' + esc(p.cartao_sus || '—') + '</div></div>' +
      '<div class="campo"><label>Idade</label><div>' + (anos !== null ? anos + ' anos' : '—') + '</div></div>' +
      '<div class="campo"><label>Sexo</label><div>' + esc(rotuloSexo(p.sexo)) + '</div></div>' +
      '</div>' +
      (opcoes && opcoes.endereco ? '<div class="linha2"><b>Endereço:</b> ' + esc(p.endereco || '________________________________________________') + '</div>' : '') +
      (alergias.length ? '<div class="alergia">⚠ Alergias informadas: ' + esc(alergias.join(', ')) + '</div>' : '') +
      '</div>';
  }

  function blocoAssinatura(doc) {
    const u = dadosUnidade(doc.unidade);
    return '<div class="assinatura">' +
      '<div class="local">' + esc(u.cidade || '') + (u.cidade ? ', ' : '') + esc(dataPorExtenso(doc.emitida_em || doc.solicitado_em)) + '</div>' +
      '<div class="ass"><div class="traco"></div>' +
      '<div class="nome">' + esc(doc.medico_nome || 'Médico(a) responsável') + '</div>' +
      '<div class="peq">' + esc(textoCrm(doc.medico_crm) || 'CRM') + ' • Assinatura e carimbo</div></div>' +
      '</div>';
  }

  function posologia(item) {
    const verbo = VERBO_VIA[item.via] || 'Usar';
    const minuscula = t => t ? (/^\d/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1)) : '';
    const partes = [];
    if (item.dosagem) partes.push(verbo + ' ' + minuscula(item.dosagem));
    if (item.frequencia) partes.push(minuscula(item.frequencia));
    if (item.duracao) partes.push(/^\d/.test(item.duracao) ? 'por ' + item.duracao : minuscula(item.duracao));
    return partes.length ? partes.join(', ') + '.' : '';
  }

  function corpoReceita(receita) {
    const porVia = {};
    const ordem = [];
    (receita.itens || []).forEach(item => {
      const via = item.via || 'Oral';
      if (!porVia[via]) { porVia[via] = []; ordem.push(via); }
      porVia[via].push(item);
    });
    let n = 0;
    return ordem.map(via => {
      const itens = porVia[via].map(item => {
        n++;
        const qtd = receita.tipo === 'controle_especial' ? quantidadePorExtenso(item.quantidade) : (item.quantidade || '');
        return '<li value="' + n + '"><div class="linha-med"><span class="nome">' + esc(item.nome) + '</span>' +
          '<span class="pontos"></span><span class="qtd">' + esc(qtd || '') + '</span></div>' +
          (posologia(item) ? '<div class="posologia">' + esc(posologia(item)) + '</div>' : '') +
          (item.obs ? '<div class="obs">' + esc(item.obs) + '</div>' : '') +
          '</li>';
      }).join('');
      return '<div class="uso">Uso ' + esc(via.toLowerCase()) + '</div><ol class="itens">' + itens + '</ol>';
    }).join('');
  }

  // receitas: [{ numero, tipo, itens, orientacoes, emitida_em, valida_ate,
  //              validade_dias, medico_nome, medico_crm, unidade }]
  // ctx: { paciente, logoUrl, previa }
  function gerarDocumentoReceitas(receitas, ctx) {
    ctx = ctx || {};
    const folhas = [];
    (receitas || []).forEach(r => {
      const cfg = TIPOS_RECEITA[r.tipo] || TIPOS_RECEITA.simples;
      const vias = cfg.vias;
      for (let v = 0; v < vias; v++) {
        const numero = r.numero || (ctx.previa ? 'gerado ao finalizar' : '—');
        const validade = r.valida_ate
          ? fmtData(r.valida_ate) + (r.validade_dias ? ' (' + r.validade_dias + ' dias)' : '')
          : (r.validade_dias ? r.validade_dias + ' dias após a emissão' : 'conforme prescritor');
        let rodapeExtra = '';
        if (r.tipo === 'antimicrobiano') {
          rodapeExtra = '<div class="caixa" style="margin-top:12px"><div class="tit">Registro da dispensação — uso exclusivo da farmácia</div>' +
            '<div class="grade4">' +
            ['Data da dispensação', 'Quantidade aviada', 'Lote', 'Rubrica do farmacêutico']
              .map(t => '<div class="preencher">' + t + '<span class="l"></span></div>').join('') +
            '</div></div>';
        } else if (r.tipo === 'controle_especial') {
          rodapeExtra = '<div class="duas">' +
            '<div class="caixa"><div class="tit">Identificação do comprador</div>' +
            ['Nome', 'Ident. (RG)', 'Órgão emissor', 'Endereço', 'Cidade/UF', 'Telefone']
              .map(t => '<div class="preencher">' + t + '<span class="l"></span></div>').join('') + '</div>' +
            '<div class="caixa"><div class="tit">Identificação do fornecedor</div>' +
            ['Farmácia/drogaria', 'Assinatura do farmacêutico', 'Data']
              .map(t => '<div class="preencher">' + t + '<span class="l"></span></div>').join('') + '</div>' +
            '</div>';
        }
        folhas.push('<section class="folha">' +
          (ctx.previa ? '<div class="marca">PRÉ-VISUALIZAÇÃO</div>' : '') +
          cabecalho(r.unidade, vias > 1 ? cfg.viasRotulos[v] : '', ctx) +
          '<h1>' + esc(cfg.titulo) + '</h1>' +
          '<div class="meta"><span>Nº <b>' + esc(numero) + '</b></span>' +
          '<span>Emissão: <b>' + esc(fmtData(r.emitida_em || new Date())) + '</b></span>' +
          '<span>Válida até: <b>' + esc(validade) + '</b></span></div>' +
          blocoPaciente(ctx.paciente, { endereco: r.tipo !== 'simples' }) +
          '<div class="corpo">' + corpoReceita(r) +
          (r.orientacoes ? '<div class="orientacoes"><b>Orientações:</b> ' + esc(r.orientacoes) + '</div>' : '') +
          '</div>' +
          blocoAssinatura(r) +
          rodapeExtra +
          '<div class="rodape">' + esc(cfg.norma) + '<br>Documento emitido pelo sistema Vida+ • ' +
          esc(cfg.rotulo) + ' nº ' + esc(numero) + (vias > 1 ? ' • ' + esc(cfg.viasRotulos[v]) : '') + '</div>' +
          '</section>');
      }
    });
    return envolverDocumento('Receita médica', folhas);
  }

  // pedido: { pedido, solicitado_em, exames[], indicacao, cid10,
  //           medico_nome, medico_crm, unidade }
  function gerarDocumentoExames(pedido, ctx) {
    ctx = ctx || {};
    const exames = pedido.exames || [];
    const numero = pedido.pedido || (ctx.previa ? 'gerado ao finalizar' : '—');
    const urgente = exames.some(e => e.prioridade === 'urgente');
    const indicacoes = Array.from(new Set(exames.map(e => (e.indicacao || '').trim()).filter(Boolean)));
    const indicacao = pedido.indicacao || indicacoes.join(' / ');
    const cid = pedido.cid10 || (exames.find(e => e.cid10) || {}).cid10 || '';

    const linhas = exames.map((e, i) => {
      const cat = CATEGORIAS_EXAME[e.categoria] || CATEGORIAS_EXAME.outros;
      return '<tr><td>' + (i + 1) + '</td>' +
        '<td><b>' + esc(e.nome) + '</b></td>' +
        '<td>' + esc(cat.rotulo) + '</td>' +
        '<td' + (e.prioridade === 'urgente' ? ' class="urgente">URGENTE' : '>Rotina') + '</td>' +
        '<td>' + esc(e.orientacao || '—') + '</td>' +
        '<td>' + esc(e.local_realizacao || '—') + '</td></tr>';
    }).join('');

    const folha = '<section class="folha">' +
      (ctx.previa ? '<div class="marca">PRÉ-VISUALIZAÇÃO</div>' : '') +
      cabecalho(pedido.unidade, urgente ? 'Prioridade: URGENTE' : '', ctx) +
      '<h1>SOLICITAÇÃO DE EXAMES</h1>' +
      '<div class="meta"><span>Pedido nº <b>' + esc(numero) + '</b></span>' +
      '<span>Data: <b>' + esc(fmtData(pedido.solicitado_em || new Date())) + '</b></span>' +
      '<span>Exames: <b>' + exames.length + '</b></span></div>' +
      blocoPaciente(ctx.paciente) +
      '<div class="caixa"><div class="tit">Indicação clínica / justificativa</div>' +
      '<div style="font-size:10pt">' + esc(indicacao || '—') + (cid ? ' &nbsp; <b>CID-10:</b> ' + esc(cid) : '') + '</div></div>' +
      '<div class="corpo"><table class="exames"><thead><tr><th>#</th><th>Exame</th><th>Tipo</th><th>Prioridade</th>' +
      '<th>Preparo / orientação</th><th>Local de realização</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
      '<div class="aviso-paciente"><b>Ao paciente:</b> leve este pedido, um documento com foto e o Cartão SUS no dia do exame. ' +
      'Siga as orientações de preparo. Você será avisado pelo app Vida+ quando o resultado estiver disponível.</div>' +
      '</div>' +
      blocoAssinatura({ unidade: pedido.unidade, emitida_em: pedido.solicitado_em, medico_nome: pedido.medico_nome, medico_crm: pedido.medico_crm }) +
      '<div class="rodape">Documento emitido pelo sistema Vida+ • Solicitação de exames nº ' + esc(numero) + '</div>' +
      '</section>';
    return envolverDocumento('Solicitação de exames', [folha]);
  }

  // Imprime um documento HTML sem abrir nova aba (iframe oculto)
  function imprimirHtml(html) {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    const imprimir = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      finally { setTimeout(() => frame.remove(), 60000); }
    };
    if (doc.readyState === 'complete') setTimeout(imprimir, 250);
    else frame.onload = () => setTimeout(imprimir, 250);
  }

  global.Prescricoes = {
    // dados
    TIPOS_RECEITA, CLASSES, MEDICAMENTOS, EXAMES, CATEGORIAS_EXAME, LOCAIS_EXAME, LOCAL_PADRAO,
    VIAS_ADMINISTRACAO, FREQUENCIAS, DURACOES, STATUS_EXAME,
    // regras
    classificarMedicamento, verificarAlergias, agruparReceitas, buscarExameCatalogo,
    buscarMedicamentoCatalogo, numeroPorExtenso, quantidadePorExtenso, posologia,
    // unidade
    dadosUnidade, carregarUnidades,
    // documentos
    gerarDocumentoReceitas, gerarDocumentoExames, imprimirHtml,
    // utilidades
    normalizar, esc, fmtData, fmtDataHora, dataIso, somarDias, idade, formatarCpf, textoCrm
  };
})(window);
