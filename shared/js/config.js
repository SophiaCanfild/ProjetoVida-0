/* ============================================================
   VIDA+ — Configuração Global Compartilhada
   Usado por TODOS os módulos do sistema.
   ============================================================ */

const APP_CONFIG = {
  NOME: "Vida+",
  VERSAO: "2.0",

  /* ---- SUPABASE ---- */
  SUPABASE_URL: "https://ofqyqorsedxveersqful.supabase.com",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mcXlxb3JzZWR4dmVlcnNxZnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NjYwNTUsImV4cCI6MjA5NjQ0MjA1NX0.ZKz40dXHnloi0w8n87MvExq1RQZe_nyThfxqvGIj-lc",

  /* ---- ONESIGNAL (push notifications) ---- */
  ONESIGNAL_APP_ID: "",

  /* ---- UNIDADES ---- */
  UNIDADES: ["UBS Central Araucária", "UPA Araucária"],

  /* ---- TELÃO ---- */
  CODIGO_TV_CONTROLE: "1234",
  GUICHES: ["1", "2", "3"],
  TEMPO_POR_POSICAO: 12,

  /* ---- MÉDICOS DISPONÍVEIS (para o telão) ---- */
  MEDICOS: [
    { consultorio: "1", nome: "Dr. Carlos Pereira",   especialidade: "Clínico Geral" },
    { consultorio: "2", nome: "Dra. Carla Dermatologia", especialidade: "Dermatologia" }
  ]
};

/* ---- CONFIGURAÇÃO DO TELÃO ---- */
const TV_CONFIG = {
  UNIDADE: APP_CONFIG.UNIDADES[0],
  TEMPO_POR_POSICAO: APP_CONFIG.TEMPO_POR_POSICAO
};

/* Supabase configurado? */
const SUPABASE_CONFIGURADO = !!(APP_CONFIG.SUPABASE_URL && APP_CONFIG.SUPABASE_ANON_KEY);

/* Inicializar cliente Supabase (se configurado) */
/* NÃO usar "var supabase" — conflita com window.supabase do CDN */
var supabaseClient = null;
try {
  if (SUPABASE_CONFIGURADO && window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
    console.log('[Vida+] Supabase conectado');
  } else {
    console.log('[Vida+] Modo demo (localStorage)');
  }
} catch (e) {
  console.warn('[Vida+] Supabase indisponível, modo demo:', e.message);
  supabaseClient = null;
}