-- ============================================================
-- VIDA+ — BANCO DE DADOS UNIFICADO (Supabase / PostgreSQL)
-- ============================================================
-- Serve TODOS os módulos do sistema:
--   1. Sistema Médico  (admin, médico, enfermeiro, recepcionista)
--   2. App do Paciente (PWA mobile)
--   3. Telão           (TV da unidade + painel de controle)
--
-- COMO USAR:
--   1. Crie um projeto em https://supabase.com
--   2. Menu "SQL Editor" → New query → cole este arquivo → RUN
--   3. Copie a URL e a anon key para shared/js/config.js
--
-- O script é IDEMPOTENTE: se você já tinha rodado uma versão
-- antiga, rode ESTA versão por cima — ela remove as policies
-- antigas, cria as novas (permissivas p/ demo), adiciona a
-- coluna cartao_sus e habilita o Realtime das tabelas.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. PACIENTES
-- Cadastro feito pela RECEPÇÃO; paciente só lê no app.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.pacientes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf                 VARCHAR(11)     NOT NULL UNIQUE,
    nome                VARCHAR(160)    NOT NULL,
    nascimento          DATE,
    sexo                VARCHAR(1)      CHECK (sexo IN ('F','M','O')),
    telefone            VARCHAR(20),
    email               VARCHAR(120),
    endereco            VARCHAR(255),
    tipo_sanguineo      VARCHAR(3),
    alergias            TEXT[]          DEFAULT '{}',
    doencas_cronicas    TEXT[]          DEFAULT '{}',
    medicamentos_uso    TEXT,
    deficiencia         VARCHAR(60),
    gestante            BOOLEAN         DEFAULT FALSE,
    tabagista           BOOLEAN         DEFAULT FALSE,
    responsavel_nome    VARCHAR(160),
    responsavel_telefone VARCHAR(20),
    cartao_sus          VARCHAR(20),
    criado_em           TIMESTAMPTZ     DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ     DEFAULT NOW()
);

-- Para bancos que já foram criados ANTES desta coluna existir (idempotente):
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS cartao_sus VARCHAR(20);

-- ============================================================
-- 2. USUÁRIOS DO SISTEMA (funcionários)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usuarios (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome                    VARCHAR(160)    NOT NULL,
    cpf                     VARCHAR(11)     UNIQUE,
    email                   VARCHAR(120)    UNIQUE,
    senha_hash              TEXT,
    perfil                  VARCHAR(20)     NOT NULL
                            CHECK (perfil IN ('recepcionista','enfermeiro','medico','administrador')),
    registro_profissional   VARCHAR(30),
    crm                     VARCHAR(30),
    coren                   VARCHAR(30),
    especialidade           VARCHAR(100),
    ativo                   BOOLEAN         DEFAULT TRUE,
    criado_em               TIMESTAMPTZ     DEFAULT NOW()
);

-- ============================================================
-- 3. UNIDADES DE SAÚDE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.unidades (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome            VARCHAR(200)    NOT NULL,
    cnpj            VARCHAR(14)     UNIQUE,
    tipo            VARCHAR(20)     DEFAULT 'ubs'
                    CHECK (tipo IN ('ubs','upa','hospital','clinica','laboratorio')),
    endereco        VARCHAR(300),
    cidade          VARCHAR(100),
    estado          CHAR(2),
    telefone        VARCHAR(15),
    email           VARCHAR(200),
    responsavel     VARCHAR(160),
    ativo           BOOLEAN         DEFAULT TRUE,
    criado_em       TIMESTAMPTZ     DEFAULT NOW()
);

-- ============================================================
-- 4. CONSULTAS (entidade principal)
-- Fluxo: em_fila → chamado → em_consulta → finalizado | cancelado
-- ============================================================
CREATE TABLE IF NOT EXISTS public.consultas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id     UUID            REFERENCES public.pacientes(id) ON DELETE CASCADE,
    cpf             VARCHAR(11)     NOT NULL,
    unidade         VARCHAR(80)     NOT NULL,
    senha           VARCHAR(6)      NOT NULL,

    -- Recepção
    recepcao        JSONB           DEFAULT '{}',

    -- Triagem (enfermeira)
    triagem         JSONB           DEFAULT '{}',

    -- Consulta (médico)
    diagnostico     TEXT,
    cid10           VARCHAR(10),
    conduta         TEXT,
    orientacoes     TEXT,
    receita         JSONB           DEFAULT '[]',
    exames          JSONB           DEFAULT '[]',
    medico_nome     VARCHAR(160),
    medico_crm      VARCHAR(30),

    -- Fila / chamada / telão
    status          VARCHAR(20)     NOT NULL DEFAULT 'em_fila'
                    CHECK (status IN ('em_fila','chamado','em_consulta','finalizado','cancelado')),
    guiche          VARCHAR(10),
    nome_chamado    VARCHAR(160),
    tipo_chamada    VARCHAR(20)     DEFAULT 'triagem'
                    CHECK (tipo_chamada IN ('triagem','consulta')),
    consultorio     VARCHAR(10),
    chamado_em      TIMESTAMPTZ,

    criado_em       TIMESTAMPTZ     DEFAULT NOW(),
    finalizado_em   TIMESTAMPTZ,
    cancelado_em    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_consultas_cpf    ON public.consultas(cpf);
CREATE INDEX IF NOT EXISTS idx_consultas_status ON public.consultas(status);
CREATE INDEX IF NOT EXISTS idx_consultas_fila   ON public.consultas(status, criado_em);

-- ============================================================
-- 5. AGENDAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agendamentos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id     UUID            REFERENCES public.pacientes(id) ON DELETE CASCADE,
    paciente_cpf    VARCHAR(11),
    unidade         VARCHAR(80),
    especialidade   VARCHAR(80),
    medico_nome     VARCHAR(160),
    data_hora       TIMESTAMPTZ     NOT NULL,
    status          VARCHAR(20)     DEFAULT 'agendado'
                    CHECK (status IN ('agendado','confirmado','cancelado','concluido')),
    criado_em       TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cpf ON public.agendamentos(paciente_cpf);

-- ============================================================
-- 6. NOTIFICAÇÕES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notificacoes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf             VARCHAR(11)     NOT NULL,
    tipo            VARCHAR(30)     DEFAULT 'aviso'
                    CHECK (tipo IN ('atendimento_iniciado','triagem','chamada','resultado','lembrete','aviso')),
    titulo          VARCHAR(160)    NOT NULL,
    texto           TEXT,
    link            VARCHAR(120),
    lida            BOOLEAN         DEFAULT FALSE,
    criado_em       TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_cpf ON public.notificacoes(cpf);

-- ============================================================
-- 7. MEDICAMENTOS (estoque)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medicamentos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome                VARCHAR(160)    NOT NULL,
    principio_ativo     VARCHAR(160),
    dosagem             VARCHAR(40),
    quantidade_estoque  INTEGER         DEFAULT 0,
    estoque_minimo      INTEGER         DEFAULT 10,
    atualizado_em       TIMESTAMPTZ     DEFAULT NOW()
);

-- ============================================================
-- 8. CONFIGURAÇÕES DO SISTEMA
-- ============================================================
CREATE TABLE IF NOT EXISTS public.configuracoes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave           VARCHAR(100)    NOT NULL UNIQUE,
    valor           TEXT            NOT NULL,
    descricao       VARCHAR(300),
    atualizado_em   TIMESTAMPTZ     DEFAULT NOW()
);

-- ============================================================
-- VIEWS
-- ============================================================

-- Fila de espera (para o telão e painel)
CREATE OR REPLACE VIEW public.fila_espera AS
SELECT
    c.*,
    p.nome AS nome_paciente
FROM public.consultas c
LEFT JOIN public.pacientes p ON p.id = c.paciente_id
WHERE c.status IN ('em_fila','chamado')
ORDER BY c.criado_em ASC;

-- Função: posição na fila
CREATE OR REPLACE FUNCTION public.posicao_fila(consulta_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
    SELECT COUNT(*)
    FROM public.fila_espera f
    WHERE f.criado_em <= (SELECT criado_em FROM public.consultas WHERE id = consulta_id)
      AND f.status = 'em_fila'
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS) — MODO DEMO SEM SUPABASE AUTH
-- ------------------------------------------------------------
-- ATENÇÃO: o sistema NÃO usa Supabase Auth — o login é feito no
-- próprio app (CPF + senha, lado cliente). Por isso as políticas
-- abaixo são PERMISSIVAS (USING TRUE), para a anon key conseguir
-- ler e gravar. Sem isso TODAS as queries falham silenciosamente.
--
-- ✅ Adequado para: TCC, demonstração, protótipo.
-- ⚠️ INSEGURO para produção: qualquer pessoa com a anon key pode
--    ler/alterar os dados. Para produção, implemente Supabase Auth
--    e recrie políticas restritivas por perfil.
-- ============================================================
ALTER TABLE public.pacientes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas restritivas (permite re-rodar o script sem erro)
DROP POLICY IF EXISTS "paciente proprio select"        ON public.pacientes;
DROP POLICY IF EXISTS "paciente edita proprio"         ON public.pacientes;
DROP POLICY IF EXISTS "recepcao cadastra"              ON public.pacientes;
DROP POLICY IF EXISTS "consulta paciente select"       ON public.consultas;
DROP POLICY IF EXISTS "consulta inserir equipe"        ON public.consultas;
DROP POLICY IF EXISTS "consulta cancelar paciente"     ON public.consultas;
DROP POLICY IF EXISTS "consulta equipe atualiza"       ON public.consultas;
DROP POLICY IF EXISTS "agendamento paciente select"    ON public.agendamentos;
DROP POLICY IF EXISTS "agendamento paciente desmarca"  ON public.agendamentos;
DROP POLICY IF EXISTS "agendamento equipe"             ON public.agendamentos;
DROP POLICY IF EXISTS "notificacao paciente select"      ON public.notificacoes;
DROP POLICY IF EXISTS "notificacao paciente marca lida"  ON public.notificacoes;
DROP POLICY IF EXISTS "notificacao insere equipe"        ON public.notificacoes;
DROP POLICY IF EXISTS "usuarios select equipe"         ON public.usuarios;
DROP POLICY IF EXISTS "usuarios admin"                 ON public.usuarios;
DROP POLICY IF EXISTS "medicamentos equipe"            ON public.medicamentos;
DROP POLICY IF EXISTS "unidades select"                ON public.unidades;
DROP POLICY IF EXISTS "config admin"                   ON public.configuracoes;

-- Políticas permissivas (demo) — DROP IF EXISTS antes garante re-run sem erro
DROP POLICY IF EXISTS "demo pacientes"     ON public.pacientes;
DROP POLICY IF EXISTS "demo consultas"     ON public.consultas;
DROP POLICY IF EXISTS "demo usuarios"      ON public.usuarios;
DROP POLICY IF EXISTS "demo agendamentos"  ON public.agendamentos;
DROP POLICY IF EXISTS "demo notificacoes"  ON public.notificacoes;
DROP POLICY IF EXISTS "demo medicamentos"  ON public.medicamentos;
DROP POLICY IF EXISTS "demo unidades"      ON public.unidades;
DROP POLICY IF EXISTS "demo configuracoes" ON public.configuracoes;

CREATE POLICY "demo pacientes"     ON public.pacientes     FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo consultas"     ON public.consultas     FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo usuarios"      ON public.usuarios      FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo agendamentos"  ON public.agendamentos  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo notificacoes"  ON public.notificacoes  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo medicamentos"  ON public.medicamentos  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo unidades"      ON public.unidades      FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo configuracoes" ON public.configuracoes FOR ALL USING (TRUE) WITH CHECK (TRUE);


-- ============================================================
-- REALTIME — publica as mudanças das tabelas em tempo real
-- ------------------------------------------------------------
-- Necessário para o "postgres_changes" do supabase-js funcionar
-- (fila do telão e do app atualizando sozinhos). Idempotente.
-- ============================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH t IN ARRAY ARRAY['usuarios','pacientes','consultas','agendamentos','notificacoes'] LOOP
            IF NOT EXISTS (
                SELECT 1 FROM pg_publication_tables
                WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
            ) THEN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            END IF;
        END LOOP;
    END IF;
END $$;


-- ============================================================
-- SEED (dados de exemplo)
-- ============================================================

-- Unidades
INSERT INTO public.unidades (nome, tipo, cidade, estado, telefone, email, responsavel)
VALUES
    ('UBS Central Araucária', 'ubs', 'Araucária', 'PR', '(41) 3333-4444', 'ubs.central@vida.com', 'Administrador'),
    ('UPA Araucária',         'upa', 'Araucária', 'PR', '(41) 3333-5555', 'upa.arauca@vida.com',  'Administrador')
ON CONFLICT DO NOTHING;

-- Usuários (mesmos logins do modo demo do app — ver tabela no README)
-- senha_hash guarda a senha em TEXTO SIMPLES apenas para o TCC/demo.
-- Para produção, use Supabase Auth ou hash bcrypt (pgcrypto).
INSERT INTO public.usuarios (nome, cpf, email, senha_hash, perfil, crm, coren, especialidade)
VALUES
    ('Administrador Sistema',   '00000000000', 'admin@vida.com',              'admin123',      'administrador',  NULL,           NULL,              NULL),
    ('Dr. Alexandre Medicina',  '12345678901', 'alexandre.medicina@vida.com', 'medico123',     'medico',         'CRM/PR 12345', NULL,              'Clínico Geral'),
    ('Dra. Carla Dermatologia', '23456789012', 'carla.dermato@vida.com',      'medico123',     'medico',         'CRM/PR 67890', NULL,              'Dermatologia'),
    ('Dr. Roberto Cirurgia',    '34567890123', 'roberto.cirurgia@vida.com',   'medico123',     'medico',         'CRM/PR 11223', NULL,              'Cirurgia Geral'),
    ('Paula Santos Silva',      '45678901234', 'paula.santos@vida.com',       'enfermeiro123', 'enfermeiro',     NULL,           'COREN/PR 123456', 'Enfermagem Geral'),
    ('Roberto Lima Costa',      '56789012345', 'roberto.lima@vida.com',       'enfermeiro123', 'enfermeiro',     NULL,           'COREN/PR 234567', 'Enfermagem'),
    ('Fernanda Oliveira',       '67890123456', 'fernanda.oliveira@vida.com',  'recep123',      'recepcionista',  NULL,           NULL,              NULL),
    ('Carlos Eduardo Mendes',   '78901234567', 'carlos.mendes@vida.com',      'recep123',      'recepcionista',  NULL,           NULL,              NULL)
ON CONFLICT (email) DO NOTHING;

-- Pacientes
INSERT INTO public.pacientes (cpf, nome, nascimento, sexo, telefone, email, endereco, tipo_sanguineo, alergias, doencas_cronicas, medicamentos_uso, responsavel_nome, responsavel_telefone)
VALUES
    ('12345678909', 'Maria Oliveira Santos',  '1995-04-12', 'F', '(41) 99999-1234', 'maria.demo@email.com',
        'Rua das Flores, 120 — Araucária/PR', 'O+',
        '{"Dipirona","Poeira"}', '{"Asma leve"}',
        'Salbutamol (inalador)', 'João Oliveira', '(41) 98888-1111'),
    ('98765432100', 'João Pedro da Silva',    '1988-11-03', 'M', '(41) 98888-2222', 'joao.demo@email.com',
        'Av. das Araucárias, 500 — Araucária/PR', 'A+',
        '{}', '{"Hipertensão"}',
        'Losartana 50mg', 'Ana Silva', '(41) 97777-3333')
ON CONFLICT (cpf) DO NOTHING;

-- Consulta finalizada de exemplo
INSERT INTO public.consultas (paciente_id, cpf, unidade, senha,
    recepcao, triagem,
    diagnostico, cid10, conduta, orientacoes,
    receita, exames,
    medico_nome, medico_crm,
    status, finalizado_em, criado_em)
SELECT p.id, p.cpf, 'UBS Central Araucária', 'B305',
    '{"criado_por":"Ana Recepção"}'::jsonb,
    '{"queixa_principal":"Dor de cabeça forte e febre","sintomas":["Febre","Dor de cabeça","Cansaço"],"tempo_sintomas":"2 dias","intensidade_dor":7,"pressao":"130/85","temperatura":38.2,"pulso":95,"saturacao":96,"classificacao_risco":"amarelo","enfermeiro":"Bruno Enfermeiro — COREN 123456"}'::jsonb,
    'Gripe', 'J11.1',
    'Repouso, hidratação e medicação sintomática.',
    'Retornar se febre persistir por mais de 72h.',
    '[{"nome":"Paracetamol 750mg","dosagem":"1 comprimido","frequencia":"6/6h","duracao":"5 dias","obs":"Após as refeições"}]'::jsonb,
    '[{"nome":"Hemograma completo","status":"resultado_disponivel","resultado":"Leucocitose leve","orientacao":"Jejum de 8h"}]'::jsonb,
    'Dr. Carlos Pereira', 'CRM 12345',
    'finalizado', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days'
FROM public.pacientes p WHERE p.cpf = '12345678909'
ON CONFLICT DO NOTHING;

-- Agendamento futuro
INSERT INTO public.agendamentos (paciente_id, paciente_cpf, unidade, especialidade, medico_nome, data_hora, status)
SELECT p.id, p.cpf, 'UBS Central Araucária', 'Clínico Geral', 'Dr. Carlos Pereira',
    NOW() + INTERVAL '5 days', 'confirmado'
FROM public.pacientes p WHERE p.cpf = '12345678909'
ON CONFLICT DO NOTHING;

-- Notificação de exemplo
INSERT INTO public.notificacoes (cpf, tipo, titulo, texto, link)
VALUES ('12345678909', 'lembrete', '🗓️ Lembrete de consulta',
    'Você tem consulta com Clínico Geral na UBS Central em breve.',
    'agendamentos.html')
ON CONFLICT DO NOTHING;

-- Medicamentos em estoque
INSERT INTO public.medicamentos (nome, principio_ativo, dosagem, quantidade_estoque, estoque_minimo)
VALUES
    ('Paracetamol 750mg',   'Paracetamol',   '750mg',  200, 50),
    ('Ibuprofeno 400mg',    'Ibuprofeno',    '400mg',  150, 30),
    ('Amoxicilina 500mg',   'Amoxicilina',   '500mg',  100, 25),
    ('Losartana 50mg',      'Losartana',     '50mg',   180, 40),
    ('Metformina 500mg',    'Metformina',    '500mg',  120, 30),
    ('Salbutamol Inalador', 'Salbutamol',    '100mcg',  50, 15),
    ('Dipirona 500mg',      'Dipirona',      '500mg',  300, 60),
    ('Omeprazol 20mg',      'Omeprazol',     '20mg',   160, 35)
ON CONFLICT DO NOTHING;

-- Configurações
INSERT INTO public.configuracoes (chave, valor, descricao)
VALUES
    ('nome_sistema',        'Vida+',            'Nome do sistema'),
    ('versao',              '2.0',              'Versão unificada'),
    ('protocolo_manchester','true',             'Usar protocolo de Manchester'),
    ('tempo_por_posicao',   '12',               'Minutos estimados por posição na fila'),
    ('codigo_tv_controle',  '1234',             'Código de acesso ao painel do telão')
ON CONFLICT (chave) DO NOTHING;


-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
