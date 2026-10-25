-- ============================================================
-- VIDA+ — INSTALADOR DO BANCO (PostgreSQL / Supabase)
-- ============================================================
-- ESTE É O ÚNICO SCRIPT NECESSÁRIO.
--
-- Ele deixa o banco 100% compatível com o sistema em
-- shared/js/db.js. Pode ser executado:
--   • num projeto Supabase vazio          (instalação)
--   • num banco já instalado              (reparo, sem perder dados)
--   • num banco do "modelo antigo"        (preserva e renomeia)
--
-- COMO USAR
--   1. Supabase → SQL Editor → New query
--   2. Cole TODO este arquivo → RUN
--   3. Rode supabase/diagnostico.sql para conferir (opcional)
--   4. Abra status-banco.html e valide leitura + escrita
--
-- O QUE ELE FAZ (todas as fases são idempotentes)
--   FASE 0  Preserva tabelas do modelo antigo (*_legado)
--   FASE 1  Cria as 8 tabelas do sistema
--   FASE 2  Garante TODAS as colunas usadas pelo app
--   FASE 3  Garante PK, defaults e NOT NULL
--   FASE 4  Garante as chaves estrangeiras
--   FASE 5  Garante índices
--   FASE 6  Liga RLS e cria as políticas do anon
--   FASE 7  Garante GRANTs para anon/authenticated
--   FASE 8  Publica as tabelas no Realtime
--   FASE 9  Recria a view fila_espera e a função posicao_fila
--   FASE 10 Dados de exemplo (logins e pacientes da demo)
--   FASE 11 Verificação final (mostra o que falta, se algo faltar)
--
-- ⚠️ SEGURANÇA: o login é feito no navegador (CPF + senha) e a
--    anon key fica no front. As políticas RLS abaixo são
--    permissivas de propósito (TCC/demo). Para produção use
--    Supabase Auth + bcrypt e políticas por perfil.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- FASE 0 — MODELO ANTIGO
-- ------------------------------------------------------------
-- Se o banco foi criado com o SQL antigo (pacientes.id_paciente
-- BIGINT / usuarios.tipo_usuario), as tabelas são renomeadas
-- para *_legado. NADA é apagado: os dados continuam lá para
-- consulta. Em seguida as tabelas do app são criadas limpas.
-- ============================================================
DO $$
DECLARE
    modelo_antigo boolean := false;
    tabelas_antigas text[] := ARRAY[
        'triagens', 'fila_atendimento', 'medicos', 'prescricoes',
        'encaminhamentos', 'exames', 'auditoria',
        'consultas', 'pacientes', 'usuarios'
    ];
    t text;
    destino text;
    n integer;
BEGIN
    SELECT
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'pacientes'
                  AND column_name = 'id_paciente')
        OR
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'usuarios'
                  AND column_name = 'tipo_usuario')
    INTO modelo_antigo;

    IF NOT modelo_antigo THEN
        RAISE NOTICE '[FASE 0] Modelo antigo não detectado — seguindo para instalação/reparo.';
        RETURN;
    END IF;

    RAISE NOTICE '[FASE 0] Modelo antigo detectado. Preservando tabelas como *_legado...';

    FOREACH t IN ARRAY tabelas_antigas LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = t
                     AND table_type = 'BASE TABLE') THEN
            destino := t || '_legado';
            n := 2;
            WHILE to_regclass('public.' || destino) IS NOT NULL LOOP
                destino := t || '_legado_' || n;
                n := n + 1;
            END LOOP;

            EXECUTE format('ALTER TABLE public.%I RENAME TO %I', t, destino);
            RAISE NOTICE '[FASE 0] public.% -> public.%', t, destino;
        END IF;
    END LOOP;

    RAISE NOTICE '[FASE 0] Concluído. Os dados antigos estão em public.*_legado.';
END $$;


-- ============================================================
-- FASE 1 — TABELAS (formato exato que shared/js/db.js envia)
-- ============================================================

-- ------------------------------------------------------------
-- 1.1 PACIENTES
-- MAPA_TABELAS.pacientes em db.js
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pacientes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf                   VARCHAR(11)  NOT NULL UNIQUE,   -- somente dígitos
    nome                  VARCHAR(160) NOT NULL,
    nascimento            DATE,
    sexo                  VARCHAR(1)   CHECK (sexo IN ('F', 'M', 'O')),
    telefone              VARCHAR(20),
    email                 VARCHAR(120),
    endereco              VARCHAR(255),
    tipo_sanguineo        VARCHAR(3),
    alergias              TEXT[]       DEFAULT '{}',
    doencas_cronicas      TEXT[]       DEFAULT '{}',
    medicamentos_uso      TEXT,
    deficiencia           VARCHAR(60),
    gestante              BOOLEAN      DEFAULT FALSE,
    tabagista             BOOLEAN      DEFAULT FALSE,
    responsavel_nome      VARCHAR(160),
    responsavel_telefone  VARCHAR(20),
    cartao_sus            VARCHAR(20),
    criado_em             TIMESTAMPTZ  DEFAULT NOW(),
    atualizado_em         TIMESTAMPTZ  DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 1.2 USUÁRIOS DO SISTEMA (funcionários)
-- MAPA_TABELAS.usuarios em db.js (senha → senha_hash)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome                   VARCHAR(160) NOT NULL,
    cpf                    VARCHAR(11)  UNIQUE,
    email                  VARCHAR(120) UNIQUE,
    senha_hash             TEXT,          -- app grava a senha aqui
    perfil                 VARCHAR(20)  NOT NULL
                           CHECK (perfil IN ('recepcionista', 'enfermeiro', 'medico', 'administrador')),
    registro_profissional  VARCHAR(30),
    crm                    VARCHAR(30),
    coren                  VARCHAR(30),
    especialidade          VARCHAR(100),
    ativo                  BOOLEAN      DEFAULT TRUE,
    criado_em              TIMESTAMPTZ  DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 1.3 UNIDADES DE SAÚDE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.unidades (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome         VARCHAR(200) NOT NULL,
    cnpj         VARCHAR(14)  UNIQUE,
    tipo         VARCHAR(20)  DEFAULT 'ubs'
                 CHECK (tipo IN ('ubs', 'upa', 'hospital', 'clinica', 'laboratorio')),
    endereco     VARCHAR(300),
    cidade       VARCHAR(100),
    estado       CHAR(2),
    telefone     VARCHAR(15),
    email        VARCHAR(200),
    responsavel  VARCHAR(160),
    ativo        BOOLEAN      DEFAULT TRUE,
    criado_em    TIMESTAMPTZ  DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 1.4 CONSULTAS (entidade central: recepção → triagem → médico → telão)
-- MAPA_TABELAS.consultas em db.js
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consultas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id     UUID         REFERENCES public.pacientes(id) ON DELETE CASCADE,
    cpf             VARCHAR(11)  NOT NULL,
    unidade         VARCHAR(80)  NOT NULL,
    senha           VARCHAR(6)   NOT NULL,

    -- Recepção (JSONB: { criado_por, observacoes })
    recepcao        JSONB        DEFAULT '{}'::jsonb,

    -- Triagem (JSONB: queixa, sinais vitais, classificacao_risco...)
    triagem         JSONB,

    -- Consulta
    diagnostico     TEXT,
    cid10           VARCHAR(10),
    conduta         TEXT,
    orientacoes     TEXT,
    receita         JSONB        DEFAULT '[]'::jsonb,   -- [{ nome, dosagem, frequencia, duracao, obs }]
    exames          JSONB        DEFAULT '[]'::jsonb,   -- [{ nome, status, resultado, orientacao }]
    medico_nome     VARCHAR(160),
    medico_crm      VARCHAR(30),

    -- Fila / chamada / telão
    status          VARCHAR(20)  NOT NULL DEFAULT 'em_fila'
                    CHECK (status IN ('em_fila', 'chamado', 'em_consulta', 'finalizado', 'cancelado')),
    guiche          VARCHAR(10),
    nome_chamado    VARCHAR(160),
    tipo_chamada    VARCHAR(20)  CHECK (tipo_chamada IN ('triagem', 'consulta')),
    consultorio     VARCHAR(10),
    chamado_em      TIMESTAMPTZ,

    criado_em       TIMESTAMPTZ  DEFAULT NOW(),
    finalizado_em   TIMESTAMPTZ,
    cancelado_em    TIMESTAMPTZ
);

-- ------------------------------------------------------------
-- 1.5 AGENDAMENTOS
-- MAPA_TABELAS.agendamentos em db.js
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agendamentos (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id    UUID         REFERENCES public.pacientes(id) ON DELETE CASCADE,
    paciente_cpf   VARCHAR(11),
    unidade        VARCHAR(80),
    especialidade  VARCHAR(80),
    medico_nome    VARCHAR(160),
    data_hora      TIMESTAMPTZ  NOT NULL,
    status         VARCHAR(20)  DEFAULT 'agendado'
                   CHECK (status IN ('agendado', 'confirmado', 'cancelado', 'concluido')),
    criado_em      TIMESTAMPTZ  DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 1.6 NOTIFICAÇÕES (app do paciente)
-- MAPA_TABELAS.notificacoes em db.js
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notificacoes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf        VARCHAR(11)  NOT NULL,
    tipo       VARCHAR(30)  DEFAULT 'aviso'
               CHECK (tipo IN ('atendimento_iniciado', 'triagem', 'chamada',
                               'resultado', 'lembrete', 'aviso')),
    titulo     VARCHAR(160) NOT NULL,
    texto      TEXT,
    link       VARCHAR(120),
    lida       BOOLEAN      DEFAULT FALSE,
    criado_em  TIMESTAMPTZ  DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 1.7 MEDICAMENTOS (estoque — usado pelo painel/status)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medicamentos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome                VARCHAR(160) NOT NULL,
    principio_ativo     VARCHAR(160),
    dosagem             VARCHAR(40),
    quantidade_estoque  INTEGER DEFAULT 0,
    estoque_minimo      INTEGER DEFAULT 10,
    atualizado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 1.8 CONFIGURAÇÕES DO SISTEMA
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.configuracoes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave          VARCHAR(100) NOT NULL UNIQUE,
    valor          TEXT         NOT NULL,
    descricao      VARCHAR(300),
    atualizado_em  TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- FASE 2 — REPARO DE COLUNAS
-- ------------------------------------------------------------
-- Bancos criados por versões antigas do projeto podem ter as
-- tabelas com colunas faltando. ADD COLUMN IF NOT EXISTS é
-- seguro e não afeta dados existentes.
-- ============================================================

-- PACIENTES
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS id                   UUID DEFAULT gen_random_uuid();
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS cpf                  VARCHAR(11);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS nome                 VARCHAR(160);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS nascimento           DATE;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS sexo                 VARCHAR(1);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS telefone             VARCHAR(20);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS email                VARCHAR(120);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS endereco             VARCHAR(255);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS tipo_sanguineo       VARCHAR(3);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS alergias             TEXT[] DEFAULT '{}';
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS doencas_cronicas     TEXT[] DEFAULT '{}';
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS medicamentos_uso     TEXT;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS deficiencia          VARCHAR(60);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS gestante             BOOLEAN DEFAULT FALSE;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS tabagista            BOOLEAN DEFAULT FALSE;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS responsavel_nome     VARCHAR(160);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS responsavel_telefone VARCHAR(20);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS cartao_sus           VARCHAR(20);
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS criado_em            TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS atualizado_em        TIMESTAMPTZ DEFAULT NOW();

-- USUARIOS
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS id                    UUID DEFAULT gen_random_uuid();
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS nome                  VARCHAR(160);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS cpf                   VARCHAR(11);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email                 VARCHAR(120);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS senha_hash            TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS perfil                VARCHAR(20);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS registro_profissional VARCHAR(30);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS crm                   VARCHAR(30);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS coren                 VARCHAR(30);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS especialidade         VARCHAR(100);
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS ativo                 BOOLEAN DEFAULT TRUE;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS criado_em             TIMESTAMPTZ DEFAULT NOW();

-- CONSULTAS
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS id             UUID DEFAULT gen_random_uuid();
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS paciente_id    UUID;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS cpf            VARCHAR(11);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS unidade        VARCHAR(80);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS senha          VARCHAR(6);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS recepcao       JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS triagem        JSONB;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS diagnostico    TEXT;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS cid10          VARCHAR(10);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS conduta        TEXT;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS orientacoes    TEXT;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS receita        JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS exames         JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS medico_nome    VARCHAR(160);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS medico_crm     VARCHAR(30);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS status         VARCHAR(20) DEFAULT 'em_fila';
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS guiche         VARCHAR(10);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS nome_chamado   VARCHAR(160);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS tipo_chamada   VARCHAR(20);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS consultorio    VARCHAR(10);
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS chamado_em     TIMESTAMPTZ;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS criado_em      TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS finalizado_em  TIMESTAMPTZ;
ALTER TABLE public.consultas ADD COLUMN IF NOT EXISTS cancelado_em   TIMESTAMPTZ;

-- AGENDAMENTOS
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS id             UUID DEFAULT gen_random_uuid();
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS paciente_id    UUID;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS paciente_cpf   VARCHAR(11);
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS unidade        VARCHAR(80);
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS especialidade  VARCHAR(80);
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS medico_nome    VARCHAR(160);
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS data_hora      TIMESTAMPTZ;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS status         VARCHAR(20) DEFAULT 'agendado';
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS criado_em      TIMESTAMPTZ DEFAULT NOW();

-- NOTIFICACOES
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS id         UUID DEFAULT gen_random_uuid();
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS cpf        VARCHAR(11);
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS tipo       VARCHAR(30) DEFAULT 'aviso';
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS titulo     VARCHAR(160);
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS texto      TEXT;
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS link       VARCHAR(120);
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS lida       BOOLEAN DEFAULT FALSE;
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS criado_em  TIMESTAMPTZ DEFAULT NOW();

-- UNIDADES / MEDICAMENTOS / CONFIGURACOES
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS id           UUID DEFAULT gen_random_uuid();
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS nome         VARCHAR(200);
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS cnpj         VARCHAR(14);
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS tipo         VARCHAR(20) DEFAULT 'ubs';
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS endereco     VARCHAR(300);
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS cidade       VARCHAR(100);
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS estado       CHAR(2);
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS telefone     VARCHAR(15);
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS email        VARCHAR(200);
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS responsavel  VARCHAR(160);
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS ativo        BOOLEAN DEFAULT TRUE;
ALTER TABLE public.unidades ADD COLUMN IF NOT EXISTS criado_em    TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.medicamentos ADD COLUMN IF NOT EXISTS id                  UUID DEFAULT gen_random_uuid();
ALTER TABLE public.medicamentos ADD COLUMN IF NOT EXISTS nome                VARCHAR(160);
ALTER TABLE public.medicamentos ADD COLUMN IF NOT EXISTS principio_ativo     VARCHAR(160);
ALTER TABLE public.medicamentos ADD COLUMN IF NOT EXISTS dosagem             VARCHAR(40);
ALTER TABLE public.medicamentos ADD COLUMN IF NOT EXISTS quantidade_estoque  INTEGER DEFAULT 0;
ALTER TABLE public.medicamentos ADD COLUMN IF NOT EXISTS estoque_minimo      INTEGER DEFAULT 10;
ALTER TABLE public.medicamentos ADD COLUMN IF NOT EXISTS atualizado_em       TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS id             UUID DEFAULT gen_random_uuid();
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS chave          VARCHAR(100);
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS valor          TEXT;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS descricao      VARCHAR(300);
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS atualizado_em  TIMESTAMPTZ DEFAULT NOW();


-- ============================================================
-- FASE 3 — CHAVES PRIMÁRIAS, DEFAULTS E NOT NULL
-- ============================================================
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['pacientes', 'usuarios', 'unidades', 'consultas',
                             'agendamentos', 'notificacoes', 'medicamentos', 'configuracoes'] LOOP
        -- 1) preenche UUIDs nulos e garante o default
        EXECUTE format('UPDATE public.%I SET id = gen_random_uuid() WHERE id IS NULL', t);
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()', t);

        -- 2) cria a PK em (id) se a tabela ainda não tiver nenhuma
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class cl ON cl.oid = c.conrelid
            JOIN pg_namespace ns ON ns.oid = cl.relnamespace
            WHERE ns.nspname = 'public' AND cl.relname = t AND c.contype = 'p'
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id)', t, t || '_pkey');
            RAISE NOTICE '[FASE 3] PK criada em public.% (id)', t;
        END IF;
    END LOOP;

    RAISE NOTICE '[FASE 3] Chaves primárias verificadas.';
END $$;

-- Campos que o app considera obrigatórios ao inserir.
-- (SET NOT NULL só é aplicado se não houver linhas com NULL)
DO $$
BEGIN
    BEGIN
        UPDATE public.pacientes SET nome = 'Sem nome' WHERE nome IS NULL;
        ALTER TABLE public.pacientes ALTER COLUMN nome SET NOT NULL;
    EXCEPTION WHEN others THEN
        RAISE NOTICE '[FASE 3] Aviso em pacientes.nome: %', SQLERRM;
    END;

    BEGIN
        ALTER TABLE public.pacientes ALTER COLUMN cpf SET NOT NULL;
    EXCEPTION WHEN others THEN
        RAISE NOTICE '[FASE 3] Aviso em pacientes.cpf: %', SQLERRM;
    END;

    BEGIN
        UPDATE public.usuarios SET perfil = 'recepcionista' WHERE perfil IS NULL;
        ALTER TABLE public.usuarios ALTER COLUMN perfil SET NOT NULL;
    EXCEPTION WHEN others THEN
        RAISE NOTICE '[FASE 3] Aviso em usuarios.perfil: %', SQLERRM;
    END;
END $$;


-- ============================================================
-- FASE 4 — CHAVES ESTRANGEIRAS
-- ============================================================
DO $$
BEGIN
    -- consultas.paciente_id → pacientes.id
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_consultas_paciente') THEN
        BEGIN
            ALTER TABLE public.consultas
                ADD CONSTRAINT fk_consultas_paciente
                FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;
        EXCEPTION WHEN others THEN
            RAISE NOTICE '[FASE 4] FK consultas→pacientes não criada: %', SQLERRM;
        END;
    END IF;

    -- agendamentos.paciente_id → pacientes.id
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_agendamentos_paciente') THEN
        BEGIN
            ALTER TABLE public.agendamentos
                ADD CONSTRAINT fk_agendamentos_paciente
                FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;
        EXCEPTION WHEN others THEN
            RAISE NOTICE '[FASE 4] FK agendamentos→pacientes não criada: %', SQLERRM;
        END;
    END IF;

    RAISE NOTICE '[FASE 4] Chaves estrangeiras verificadas.';
END $$;

-- Índices únicos usados pelo app (CPF é a chave natural do paciente).
-- Se houver duplicatas antigas, o script avisa e continua.
DO $$
BEGIN
    BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_pacientes_cpf ON public.pacientes (cpf);
    EXCEPTION WHEN others THEN
        RAISE NOTICE '[FASE 4] Índice único de CPF não criado (há duplicatas?): %', SQLERRM;
    END;

    BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_cpf ON public.usuarios (cpf);
    EXCEPTION WHEN others THEN
        RAISE NOTICE '[FASE 4] Índice único de CPF (usuarios) não criado: %', SQLERRM;
    END;

    BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON public.usuarios (email);
    EXCEPTION WHEN others THEN
        RAISE NOTICE '[FASE 4] Índice único de e-mail (usuarios) não criado: %', SQLERRM;
    END;

    BEGIN
        CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracoes_chave ON public.configuracoes (chave);
    EXCEPTION WHEN others THEN
        RAISE NOTICE '[FASE 4] Índice único de chave (configuracoes) não criado: %', SQLERRM;
    END;
END $$;


-- ============================================================
-- FASE 5 — ÍNDICES DE PERFORMANCE
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pacientes_nome        ON public.pacientes (nome);
CREATE INDEX IF NOT EXISTS idx_pacientes_email       ON public.pacientes (email);
CREATE INDEX IF NOT EXISTS idx_usuarios_cpf          ON public.usuarios (cpf);
CREATE INDEX IF NOT EXISTS idx_consultas_cpf         ON public.consultas (cpf);
CREATE INDEX IF NOT EXISTS idx_consultas_status      ON public.consultas (status);
CREATE INDEX IF NOT EXISTS idx_consultas_fila        ON public.consultas (status, criado_em);
CREATE INDEX IF NOT EXISTS idx_consultas_paciente    ON public.consultas (paciente_id);
-- Consulta exata do telão: unidade + status "chamado", mais recentes primeiro.
CREATE INDEX IF NOT EXISTS idx_consultas_telao
    ON public.consultas (unidade, chamado_em DESC)
    WHERE status = 'chamado';
CREATE INDEX IF NOT EXISTS idx_agendamentos_cpf      ON public.agendamentos (paciente_cpf);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data     ON public.agendamentos (data_hora);
CREATE INDEX IF NOT EXISTS idx_notificacoes_cpf      ON public.notificacoes (cpf);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida     ON public.notificacoes (cpf, lida);


-- ============================================================
-- FASE 6 — RLS + POLÍTICAS
-- ------------------------------------------------------------
-- Sem estas políticas o anon key não grava NADA (erro 42501).
-- ============================================================
ALTER TABLE public.pacientes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas/restritivas que possam ter ficado
DROP POLICY IF EXISTS "demo pacientes"     ON public.pacientes;
DROP POLICY IF EXISTS "demo usuarios"      ON public.usuarios;
DROP POLICY IF EXISTS "demo unidades"      ON public.unidades;
DROP POLICY IF EXISTS "demo consultas"     ON public.consultas;
DROP POLICY IF EXISTS "demo agendamentos"  ON public.agendamentos;
DROP POLICY IF EXISTS "demo notificacoes"  ON public.notificacoes;
DROP POLICY IF EXISTS "demo medicamentos"  ON public.medicamentos;
DROP POLICY IF EXISTS "demo configuracoes" ON public.configuracoes;

DROP POLICY IF EXISTS "paciente le proprio"           ON public.pacientes;
DROP POLICY IF EXISTS "paciente edita proprio"        ON public.pacientes;
DROP POLICY IF EXISTS "recepcao cadastra"             ON public.pacientes;
DROP POLICY IF EXISTS "consulta paciente select"      ON public.consultas;
DROP POLICY IF EXISTS "consulta inserir equipe"       ON public.consultas;
DROP POLICY IF EXISTS "consulta cancelar paciente"    ON public.consultas;
DROP POLICY IF EXISTS "consulta equipe atualiza"      ON public.consultas;
DROP POLICY IF EXISTS "agendamento paciente select"   ON public.agendamentos;
DROP POLICY IF EXISTS "agendamento paciente desmarca" ON public.agendamentos;
DROP POLICY IF EXISTS "agendamento equipe"            ON public.agendamentos;
DROP POLICY IF EXISTS "notificacao paciente select"     ON public.notificacoes;
DROP POLICY IF EXISTS "notificacao paciente marca lida" ON public.notificacoes;
DROP POLICY IF EXISTS "notificacao insere equipe"       ON public.notificacoes;
DROP POLICY IF EXISTS "usuarios select equipe"        ON public.usuarios;
DROP POLICY IF EXISTS "usuarios admin"                ON public.usuarios;
DROP POLICY IF EXISTS "medicamentos equipe"           ON public.medicamentos;
DROP POLICY IF EXISTS "unidades select"               ON public.unidades;
DROP POLICY IF EXISTS "config admin"                  ON public.configuracoes;

CREATE POLICY "demo pacientes"     ON public.pacientes     FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo usuarios"      ON public.usuarios      FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo unidades"      ON public.unidades      FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo consultas"     ON public.consultas     FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo agendamentos"  ON public.agendamentos  FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo notificacoes"  ON public.notificacoes  FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo medicamentos"  ON public.medicamentos  FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo configuracoes" ON public.configuracoes FOR ALL TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);


-- ============================================================
-- FASE 7 — PERMISSÕES (GRANTs)
-- ------------------------------------------------------------
-- RLS liberado não basta: o papel anon também precisa dos
-- privilégios de tabela, que podem ter sido revogados.
-- ============================================================
DO $$
DECLARE
    t text;
    papel text;
BEGIN
    -- Em Supabase os papéis anon/authenticated sempre existem.
    -- O IF evita erro caso o script rode num PostgreSQL comum.
    FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', papel);
            FOREACH t IN ARRAY ARRAY['pacientes', 'usuarios', 'unidades', 'consultas',
                                     'agendamentos', 'notificacoes', 'medicamentos', 'configuracoes'] LOOP
                EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO %I', t, papel);
            END LOOP;
        END IF;
    END LOOP;
    RAISE NOTICE '[FASE 7] GRANTs aplicados em anon/authenticated.';
END $$;


-- ============================================================
-- FASE 8 — REALTIME
-- ------------------------------------------------------------
-- Faz o telão, a fila e o app do paciente atualizarem sozinhos.
-- ============================================================
DO $$
DECLARE
    t text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    FOREACH t IN ARRAY ARRAY['usuarios', 'pacientes', 'consultas', 'agendamentos', 'notificacoes'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            RAISE NOTICE '[FASE 8] Realtime publicado: public.%', t;
        END IF;
    END LOOP;
END $$;


-- ============================================================
-- FASE 9 — VIEW E FUNÇÃO DA FILA
-- ============================================================
DROP FUNCTION IF EXISTS public.posicao_fila(UUID);
DROP VIEW IF EXISTS public.fila_espera;

CREATE VIEW public.fila_espera AS
SELECT
    c.*,
    p.nome AS nome_paciente
FROM public.consultas c
LEFT JOIN public.pacientes p ON p.id = c.paciente_id
WHERE c.status IN ('em_fila', 'chamado')
ORDER BY c.criado_em ASC;

CREATE FUNCTION public.posicao_fila(consulta_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COUNT(*)
    FROM public.fila_espera f
    WHERE f.criado_em <= (SELECT criado_em FROM public.consultas WHERE id = consulta_id)
      AND f.status = 'em_fila'
$$;

GRANT SELECT ON public.fila_espera TO anon, authenticated;


-- ============================================================
-- FASE 10 — DADOS DE EXEMPLO
-- ------------------------------------------------------------
-- Mesmos logins do modo demo (ver README).
-- Senhas em texto puro apenas para o TCC — ver aviso de segurança.
-- ============================================================

-- Unidades
INSERT INTO public.unidades (nome, tipo, cidade, estado, telefone, email, responsavel)
VALUES
    ('UBS Central Araucária', 'ubs', 'Araucária', 'PR', '(41) 3333-4444', 'ubs.central@vida.com', 'Administrador'),
    ('UPA Araucária',         'upa', 'Araucária', 'PR', '(41) 3333-5555', 'upa.arauca@vida.com',   'Administrador')
ON CONFLICT DO NOTHING;

-- Usuários do sistema
INSERT INTO public.usuarios (nome, cpf, email, senha_hash, perfil, crm, coren, especialidade)
VALUES
    ('Administrador Sistema',   '00000000000', 'admin@vida.com',              'admin123',      'administrador', NULL,           NULL,              NULL),
    ('Dr. Alexandre Medicina',  '12345678901', 'alexandre.medicina@vida.com', 'medico123',     'medico',        'CRM/PR 12345', NULL,              'Clínico Geral'),
    ('Dra. Carla Dermatologia', '23456789012', 'carla.dermato@vida.com',      'medico123',     'medico',        'CRM/PR 67890', NULL,              'Dermatologia'),
    ('Dr. Roberto Cirurgia',    '34567890123', 'roberto.cirurgia@vida.com',   'medico123',     'medico',        'CRM/PR 11223', NULL,              'Cirurgia Geral'),
    ('Paula Santos Silva',      '45678901234', 'paula.santos@vida.com',       'enfermeiro123', 'enfermeiro',    NULL,           'COREN/PR 123456', 'Enfermagem Geral'),
    ('Roberto Lima Costa',      '56789012345', 'roberto.lima@vida.com',       'enfermeiro123', 'enfermeiro',    NULL,           'COREN/PR 234567', 'Enfermagem'),
    ('Fernanda Oliveira',       '67890123456', 'fernanda.oliveira@vida.com',  'recep123',      'recepcionista', NULL,           NULL,              NULL),
    ('Carlos Eduardo Mendes',   '78901234567', 'carlos.mendes@vida.com',      'recep123',      'recepcionista', NULL,           NULL,              NULL)
ON CONFLICT DO NOTHING;

-- Pacientes de exemplo
INSERT INTO public.pacientes
    (cpf, nome, nascimento, sexo, telefone, email, endereco, tipo_sanguineo,
     alergias, doencas_cronicas, medicamentos_uso, responsavel_nome, responsavel_telefone)
VALUES
    ('12345678909', 'Maria Oliveira Santos', '1995-04-12', 'F', '(41) 99999-1234', 'maria.demo@email.com',
     'Rua das Flores, 120 — Araucária/PR', 'O+',
     ARRAY['Dipirona', 'Poeira'], ARRAY['Asma leve'],
     'Salbutamol (inalador)', 'João Oliveira', '(41) 98888-1111'),
    ('98765432100', 'João Pedro da Silva', '1988-11-03', 'M', '(41) 98888-2222', 'joao.demo@email.com',
     'Av. das Araucárias, 500 — Araucária/PR', 'A+',
     ARRAY[]::TEXT[], ARRAY['Hipertensão'],
     'Losartana 50mg', 'Ana Silva', '(41) 97777-3333')
ON CONFLICT (cpf) DO NOTHING;

-- Consulta finalizada de exemplo
INSERT INTO public.consultas
    (paciente_id, cpf, unidade, senha, recepcao, triagem,
     diagnostico, cid10, conduta, orientacoes, receita, exames,
     medico_nome, medico_crm, status, finalizado_em, criado_em)
SELECT
    p.id, p.cpf, 'UBS Central Araucária', 'B305',
    '{"criado_por":"Ana Recepção"}'::jsonb,
    '{"queixa_principal":"Dor de cabeça forte e febre","sintomas":["Febre","Dor de cabeça","Cansaço"],"tempo_sintomas":"2 dias","intensidade_dor":7,"pressao":"130/85","temperatura":38.2,"pulso":95,"saturacao":96,"classificacao_risco":"amarelo","enfermeiro":"Bruno Enfermeiro — COREN 123456"}'::jsonb,
    'Gripe', 'J11.1',
    'Repouso, hidratação e medicação sintomática.',
    'Retornar se febre persistir por mais de 72h.',
    '[{"nome":"Paracetamol 750mg","dosagem":"1 comprimido","frequencia":"6/6h","duracao":"5 dias","obs":"Após as refeições"}]'::jsonb,
    '[{"nome":"Hemograma completo","status":"resultado_disponivel","resultado":"Leucocitose leve","orientacao":"Jejum de 8h"}]'::jsonb,
    'Dr. Carlos Pereira', 'CRM 12345',
    'finalizado', NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days'
FROM public.pacientes p
WHERE p.cpf = '12345678909'
  AND NOT EXISTS (
      SELECT 1 FROM public.consultas c
      WHERE c.cpf = '12345678909' AND c.senha = 'B305'
  );

-- Agendamento futuro
INSERT INTO public.agendamentos
    (paciente_id, paciente_cpf, unidade, especialidade, medico_nome, data_hora, status)
SELECT p.id, p.cpf, 'UBS Central Araucária', 'Clínico Geral', 'Dr. Carlos Pereira',
       NOW() + INTERVAL '5 days', 'confirmado'
FROM public.pacientes p
WHERE p.cpf = '12345678909'
  AND NOT EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.paciente_cpf = '12345678909'
  );

-- Notificação
INSERT INTO public.notificacoes (cpf, tipo, titulo, texto, link)
SELECT '12345678909', 'lembrete', '🗓️ Lembrete de consulta',
       'Você tem consulta com Clínico Geral na UBS Central em breve.',
       'agendamentos.html'
WHERE NOT EXISTS (
    SELECT 1 FROM public.notificacoes
    WHERE cpf = '12345678909' AND tipo = 'lembrete'
);

-- Medicamentos em estoque
INSERT INTO public.medicamentos (nome, principio_ativo, dosagem, quantidade_estoque, estoque_minimo)
VALUES
    ('Paracetamol 750mg',   'Paracetamol',  '750mg',  200, 50),
    ('Ibuprofeno 400mg',    'Ibuprofeno',   '400mg',  150, 30),
    ('Amoxicilina 500mg',   'Amoxicilina',  '500mg',  100, 25),
    ('Losartana 50mg',      'Losartana',    '50mg',   180, 40),
    ('Metformina 500mg',    'Metformina',   '500mg',  120, 30),
    ('Salbutamol Inalador', 'Salbutamol',   '100mcg',  50, 15),
    ('Dipirona 500mg',      'Dipirona',     '500mg',  300, 60),
    ('Omeprazol 20mg',      'Omeprazol',    '20mg',   160, 35)
ON CONFLICT DO NOTHING;

-- Configurações
INSERT INTO public.configuracoes (chave, valor, descricao)
VALUES
    ('nome_sistema',         'Vida+', 'Nome do sistema'),
    ('versao',               '2.0',   'Versão unificada'),
    ('protocolo_manchester', 'true',  'Usar protocolo de Manchester'),
    ('tempo_por_posicao',    '12',    'Minutos estimados por posição na fila'),
    ('codigo_tv_controle',   '1234',  'Código de acesso ao painel do telão')
ON CONFLICT (chave) DO NOTHING;


-- ============================================================
-- FASE 11 — VERIFICAÇÃO FINAL
-- ------------------------------------------------------------
-- 11.1 mostra SOMENTE o que estiver faltando (deve vir vazio)
-- ============================================================
WITH esperado (tabela, coluna) AS (
    VALUES
        ('pacientes', 'id'), ('pacientes', 'cpf'), ('pacientes', 'nome'),
        ('pacientes', 'nascimento'), ('pacientes', 'sexo'), ('pacientes', 'telefone'),
        ('pacientes', 'email'), ('pacientes', 'endereco'), ('pacientes', 'tipo_sanguineo'),
        ('pacientes', 'alergias'), ('pacientes', 'doencas_cronicas'),
        ('pacientes', 'medicamentos_uso'), ('pacientes', 'deficiencia'),
        ('pacientes', 'gestante'), ('pacientes', 'tabagista'),
        ('pacientes', 'responsavel_nome'), ('pacientes', 'responsavel_telefone'),
        ('pacientes', 'cartao_sus'), ('pacientes', 'criado_em'), ('pacientes', 'atualizado_em'),

        ('usuarios', 'id'), ('usuarios', 'nome'), ('usuarios', 'cpf'),
        ('usuarios', 'email'), ('usuarios', 'senha_hash'), ('usuarios', 'perfil'),
        ('usuarios', 'registro_profissional'), ('usuarios', 'crm'), ('usuarios', 'coren'),
        ('usuarios', 'especialidade'), ('usuarios', 'ativo'), ('usuarios', 'criado_em'),

        ('consultas', 'id'), ('consultas', 'paciente_id'), ('consultas', 'cpf'),
        ('consultas', 'unidade'), ('consultas', 'senha'), ('consultas', 'recepcao'),
        ('consultas', 'triagem'), ('consultas', 'diagnostico'), ('consultas', 'cid10'),
        ('consultas', 'conduta'), ('consultas', 'orientacoes'), ('consultas', 'receita'),
        ('consultas', 'exames'), ('consultas', 'medico_nome'), ('consultas', 'medico_crm'),
        ('consultas', 'status'), ('consultas', 'guiche'), ('consultas', 'nome_chamado'),
        ('consultas', 'tipo_chamada'), ('consultas', 'consultorio'), ('consultas', 'chamado_em'),
        ('consultas', 'criado_em'), ('consultas', 'finalizado_em'), ('consultas', 'cancelado_em'),

        ('agendamentos', 'id'), ('agendamentos', 'paciente_id'), ('agendamentos', 'paciente_cpf'),
        ('agendamentos', 'unidade'), ('agendamentos', 'especialidade'), ('agendamentos', 'medico_nome'),
        ('agendamentos', 'data_hora'), ('agendamentos', 'status'), ('agendamentos', 'criado_em'),

        ('notificacoes', 'id'), ('notificacoes', 'cpf'), ('notificacoes', 'tipo'),
        ('notificacoes', 'titulo'), ('notificacoes', 'texto'), ('notificacoes', 'link'),
        ('notificacoes', 'lida'), ('notificacoes', 'criado_em')
)
SELECT e.tabela, e.coluna, '❌ FALTA' AS status
FROM esperado e
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public'
      AND c.table_name = e.tabela
      AND c.column_name = e.coluna
WHERE c.column_name IS NULL
ORDER BY e.tabela, e.coluna;

-- 11.2 resumo do banco (contagens e RLS)
SELECT
    t.tabela,
    t.rls_ligado,
    t.registros,
    t.politicas
FROM (
    SELECT 'pacientes' AS tabela,
           (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'pacientes') AS rls_ligado,
           (SELECT count(*) FROM public.pacientes) AS registros,
           (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'pacientes') AS politicas
    UNION ALL
    SELECT 'usuarios', (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'usuarios'),
           (SELECT count(*) FROM public.usuarios),
           (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios')
    UNION ALL
    SELECT 'consultas', (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'consultas'),
           (SELECT count(*) FROM public.consultas),
           (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'consultas')
    UNION ALL
    SELECT 'agendamentos', (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'agendamentos'),
           (SELECT count(*) FROM public.agendamentos),
           (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agendamentos')
    UNION ALL
    SELECT 'notificacoes', (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = 'notificacoes'),
           (SELECT count(*) FROM public.notificacoes),
           (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notificacoes')
) t
ORDER BY t.tabela;

-- 11.3 recarrega o cache de schema do PostgREST (evita PGRST205)
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- FIM — banco pronto para o Vida+
-- Se a consulta 11.1 voltou vazia, o schema está 100% compatível.
-- ============================================================
