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
    criado_em           TIMESTAMPTZ     DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ     DEFAULT NOW()
);

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
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.pacientes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- PACIENTES: paciente lê o próprio; equipe lê todos
CREATE POLICY "paciente proprio select" ON public.pacientes
    FOR SELECT USING (
        (SELECT auth.jwt() ->> 'cpf') = cpf
        OR (SELECT auth.jwt() ->> 'perfil') IN ('recepcionista','enfermeiro','medico','administrador')
    );
CREATE POLICY "paciente edita proprio" ON public.pacientes
    FOR UPDATE USING ((SELECT auth.jwt() ->> 'cpf') = cpf);
CREATE POLICY "recepcao cadastra" ON public.pacientes
    FOR INSERT WITH CHECK (
        (SELECT auth.jwt() ->> 'perfil') IN ('recepcionista','enfermeiro','medico','administrador')
        OR (SELECT auth.jwt() ->> 'cpf') = cpf
    );

-- CONSULTAS: paciente vê as próprias; equipe vê todas
CREATE POLICY "consulta paciente select" ON public.consultas
    FOR SELECT USING (
        (SELECT auth.jwt() ->> 'cpf') = cpf
        OR (SELECT auth.jwt() ->> 'perfil') IN ('recepcionista','enfermeiro','medico','administrador')
    );
CREATE POLICY "consulta inserir equipe" ON public.consultas
    FOR INSERT WITH CHECK (
        (SELECT auth.jwt() ->> 'perfil') IN ('recepcionista','enfermeiro','medico','administrador')
    );
CREATE POLICY "consulta cancelar paciente" ON public.consultas
    FOR UPDATE USING (
        (SELECT auth.jwt() ->> 'cpf') = cpf AND status IN ('em_fila','chamado')
    ) WITH CHECK (status IN ('em_fila','chamado','cancelado'));
CREATE POLICY "consulta equipe atualiza" ON public.consultas
    FOR UPDATE USING (
        (SELECT auth.jwt() ->> 'perfil') IN ('recepcionista','enfermeiro','medico','administrador')
    );

-- AGENDAMENTOS
CREATE POLICY "agendamento paciente select" ON public.agendamentos
    FOR SELECT USING (
        (SELECT auth.jwt() ->> 'cpf') = paciente_cpf
        OR (SELECT auth.jwt() ->> 'perfil') IN ('recepcionista','enfermeiro','medico','administrador')
    );
CREATE POLICY "agendamento paciente desmarca" ON public.agendamentos
    FOR UPDATE USING ((SELECT auth.jwt() ->> 'cpf') = paciente_cpf)
    WITH CHECK (status IN ('agendado','confirmado','cancelado'));
CREATE POLICY "agendamento equipe" ON public.agendamentos
    FOR ALL USING (
        (SELECT auth.jwt() ->> 'perfil') IN ('recepcionista','enfermeiro','medico','administrador')
    );

-- NOTIFICAÇÕES
CREATE POLICY "notificacao paciente select" ON public.notificacoes
    FOR SELECT USING ((SELECT auth.jwt() ->> 'cpf') = cpf);
CREATE POLICY "notificacao paciente marca lida" ON public.notificacoes
    FOR UPDATE USING ((SELECT auth.jwt() ->> 'cpf') = cpf)
    WITH CHECK (lida = TRUE);
CREATE POLICY "notificacao insere equipe" ON public.notificacoes
    FOR INSERT WITH CHECK (
        (SELECT auth.jwt() ->> 'perfil') IN ('recepcionista','enfermeiro','medico','administrador')
    );

-- USUÁRIOS
CREATE POLICY "usuarios select equipe" ON public.usuarios
    FOR SELECT USING (
        (SELECT auth.jwt() ->> 'perfil') IN ('recepcionista','enfermeiro','medico','administrador')
    );
CREATE POLICY "usuarios admin" ON public.usuarios
    FOR ALL USING ((SELECT auth.jwt() ->> 'perfil') = 'administrador');

-- MEDICAMENTOS
CREATE POLICY "medicamentos equipe" ON public.medicamentos
    FOR ALL USING (
        (SELECT auth.jwt() ->> 'perfil') IN ('enfermeiro','medico','administrador')
    );

-- UNIDADES
CREATE POLICY "unidades select" ON public.unidades
    FOR SELECT USING (TRUE);

-- CONFIGURAÇÕES
CREATE POLICY "config admin" ON public.configuracoes
    FOR ALL USING ((SELECT auth.jwt() ->> 'perfil') = 'administrador');


-- ============================================================
-- SEED (dados de exemplo)
-- ============================================================

-- Unidades
INSERT INTO public.unidades (nome, tipo, cidade, estado, telefone, email, responsavel)
VALUES
    ('UBS Central Araucária', 'ubs', 'Araucária', 'PR', '(41) 3333-4444', 'ubs.central@vida.com', 'Administrador'),
    ('UPA Araucária',         'upa', 'Araucária', 'PR', '(41) 3333-5555', 'upa.arauca@vida.com',  'Administrador')
ON CONFLICT DO NOTHING;

-- Usuários
INSERT INTO public.usuarios (nome, cpf, email, perfil, registro_profissional, crm, coren, especialidade)
VALUES
    ('Administrador Sistema',   '00000000000', 'admin@vida.com',              'administrador',  NULL,            NULL,          NULL,          NULL),
    ('Ana Recepção',            '11122233344', 'ana.recepcao@vida.com',       'recepcionista',  NULL,            NULL,          NULL,          NULL),
    ('Bruno Enfermeiro',        '22233344455', 'bruno.enf@vida.com',          'enfermeiro',     'COREN 123456',  NULL,          'COREN 123456','Enfermagem Geral'),
    ('Dr. Carlos Pereira',      '33344455566', 'carlos.medico@vida.com',      'medico',         'CRM 12345',     'CRM 12345',   NULL,          'Clínico Geral'),
    ('Dra. Carla Dermatologia', '44455566678', 'carla.dermato@vida.com',      'medico',         'CRM 67890',     'CRM 67890',   NULL,          'Dermatologia'),
    ('Diana Admin',             '44455566677', 'diana.admin@vida.com',        'administrador',  NULL,            NULL,          NULL,          NULL)
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
