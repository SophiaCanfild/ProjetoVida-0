-- ============================================================
-- VIDA+ — VERSÃO MÍNIMA DO BANCO (somente o essencial)
-- ============================================================
-- Use este arquivo quando o supabase/schema.sql der erro.
-- Ele faz SÓ o necessário para o app gravar pacientes:
--   • cria as 10 tabelas (se não existirem), incluindo receitas
--     e exames_solicitados (receita médica / pedido de exames)
--   • liga RLS com políticas permissivas
--   • concede permissões ao anon
--
-- NÃO tem: migração do modelo antigo, seeds, realtime, views,
-- triggers ou blocos condicionais — é curto justamente para
-- ser fácil encontrar onde um erro acontece.
--
-- COMO USAR
--   1. SQL Editor → New query
--   2. Ctrl+A para garantir que NADA está selecionado
--   3. Cole TUDO e clique em Run
--   4. Esperado: "Success. No rows returned"
--
-- Se der erro, ele aponta a linha exata (ex.: "LINE 42: ...").
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1) TABELAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pacientes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf                   VARCHAR(11)  NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS public.usuarios (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome                   VARCHAR(160) NOT NULL,
    cpf                    VARCHAR(11)  UNIQUE,
    email                  VARCHAR(120) UNIQUE,
    senha_hash             TEXT,
    perfil                 VARCHAR(20)  NOT NULL
                           CHECK (perfil IN ('recepcionista', 'enfermeiro', 'medico', 'administrador')),
    registro_profissional  VARCHAR(30),
    crm                    VARCHAR(30),
    coren                  VARCHAR(30),
    especialidade          VARCHAR(100),
    ativo                  BOOLEAN      DEFAULT TRUE,
    criado_em              TIMESTAMPTZ  DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS public.consultas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id     UUID         REFERENCES public.pacientes(id) ON DELETE CASCADE,
    cpf             VARCHAR(11)  NOT NULL,
    unidade         VARCHAR(80)  NOT NULL,
    senha           VARCHAR(6)   NOT NULL,
    recepcao        JSONB        DEFAULT '{}'::jsonb,
    triagem         JSONB,
    diagnostico     TEXT,
    cid10           VARCHAR(10),
    conduta         TEXT,
    orientacoes     TEXT,
    receita         JSONB        DEFAULT '[]'::jsonb,
    exames          JSONB        DEFAULT '[]'::jsonb,
    medico_nome     VARCHAR(160),
    medico_crm      VARCHAR(30),
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

CREATE TABLE IF NOT EXISTS public.medicamentos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome                VARCHAR(160) NOT NULL,
    principio_ativo     VARCHAR(160),
    dosagem             VARCHAR(40),
    quantidade_estoque  INTEGER DEFAULT 0,
    estoque_minimo      INTEGER DEFAULT 10,
    atualizado_em       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.configuracoes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave          VARCHAR(100) NOT NULL UNIQUE,
    valor          TEXT         NOT NULL,
    descricao      VARCHAR(300),
    atualizado_em  TIMESTAMPTZ DEFAULT NOW()
);

-- Receita médica (1 linha por receita emitida)
CREATE TABLE IF NOT EXISTS public.receitas (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id    UUID         NOT NULL REFERENCES public.consultas(id) ON DELETE CASCADE,
    paciente_id    UUID         REFERENCES public.pacientes(id) ON DELETE CASCADE,
    cpf            VARCHAR(11)  NOT NULL,
    numero         VARCHAR(30)  NOT NULL,                  -- ex.: RX-20261025-7KQ2M
    tipo           VARCHAR(20)  NOT NULL DEFAULT 'simples',
    vias           SMALLINT     NOT NULL DEFAULT 1,
    itens          JSONB        NOT NULL DEFAULT '[]'::jsonb,
                   -- [{ nome, classe, dosagem, via, frequencia, duracao, quantidade, obs }]
    orientacoes    TEXT,
    validade_dias  SMALLINT,
    valida_ate     DATE,
    alertas        JSONB        NOT NULL DEFAULT '[]'::jsonb,
                   -- alertas de alergia confirmados pelo médico:
                   -- [{ tipo, medicamento, alergia, motivo, confirmado_por, confirmado_em }]
    medico_nome    VARCHAR(160),
    medico_crm     VARCHAR(30),
    unidade        VARCHAR(80),
    emitida_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    criado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT receitas_numero_unico   UNIQUE (numero),
    CONSTRAINT receitas_tipo_valido    CHECK (tipo IN ('simples', 'antimicrobiano', 'controle_especial')),
    -- simples = 1 via; antimicrobiano e controle especial = 2 vias (uma fica retida na farmácia)
    CONSTRAINT receitas_vias_por_tipo  CHECK ((tipo = 'simples' AND vias = 1) OR (tipo <> 'simples' AND vias = 2)),
    -- validade: antimicrobiano 10 dias (RDC Anvisa 471/2021); controle especial 30 dias (Portaria SVS/MS 344/98)
    CONSTRAINT receitas_validade       CHECK (
           (tipo = 'simples'           AND (validade_dias IS NULL OR validade_dias BETWEEN 1 AND 365))
        OR (tipo = 'antimicrobiano'    AND validade_dias = 10)
        OR (tipo = 'controle_especial' AND validade_dias = 30)),
    CONSTRAINT receitas_itens_lista    CHECK (CASE WHEN jsonb_typeof(itens) = 'array'
                                                   THEN jsonb_array_length(itens) >= 1 ELSE FALSE END),
    -- Portaria 344/98: no máximo 3 substâncias da lista C1 por receita
    CONSTRAINT receitas_controle_max_3 CHECK (tipo <> 'controle_especial'
                                              OR CASE WHEN jsonb_typeof(itens) = 'array'
                                                      THEN jsonb_array_length(itens) <= 3 ELSE FALSE END),
    CONSTRAINT receitas_alertas_lista  CHECK (jsonb_typeof(alertas) = 'array')
);

-- Pedido de exame (1 linha por exame, com status)
CREATE TABLE IF NOT EXISTS public.exames_solicitados (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id          UUID          NOT NULL REFERENCES public.consultas(id) ON DELETE CASCADE,
    paciente_id          UUID          REFERENCES public.pacientes(id) ON DELETE CASCADE,
    cpf                  VARCHAR(11)   NOT NULL,
    pedido               VARCHAR(30)   NOT NULL,           -- agrupa os exames da mesma guia: EX-20261025-AB3CD
    nome                 VARCHAR(160)  NOT NULL,
    categoria            VARCHAR(20)   NOT NULL DEFAULT 'laboratorial',
    prioridade           VARCHAR(10)   NOT NULL DEFAULT 'rotina',
    indicacao            TEXT,                             -- justificativa / hipótese diagnóstica
    cid10                VARCHAR(10),
    orientacao           TEXT,                             -- preparo (ex.: jejum de 8 horas)
    local_realizacao     VARCHAR(160),                     -- laboratório, setor ou serviço de referência
    status               VARCHAR(25)   NOT NULL DEFAULT 'solicitado',
    resultado            TEXT,
    realizado_em         TIMESTAMPTZ,
    resultado_em         TIMESTAMPTZ,
    cancelado_em         TIMESTAMPTZ,
    motivo_cancelamento  TEXT,
    atualizado_por       VARCHAR(160),
    medico_nome          VARCHAR(160),
    medico_crm           VARCHAR(30),
    unidade              VARCHAR(80),
    solicitado_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    atualizado_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT exames_sol_nome_preenchido   CHECK (btrim(nome) <> ''),
    CONSTRAINT exames_sol_categoria_valida  CHECK (categoria IN ('laboratorial', 'imagem', 'cardiologico', 'teste_rapido', 'outros')),
    CONSTRAINT exames_sol_prioridade_valida CHECK (prioridade IN ('rotina', 'urgente')),
    CONSTRAINT exames_sol_status_valido     CHECK (status IN ('solicitado', 'realizado', 'resultado_disponivel', 'cancelado')),
    -- resultado disponível exige o resultado; cancelamento exige o motivo
    CONSTRAINT exames_sol_resultado_exigido CHECK (status <> 'resultado_disponivel' OR NULLIF(btrim(resultado), '') IS NOT NULL),
    CONSTRAINT exames_sol_motivo_exigido    CHECK (status <> 'cancelado' OR NULLIF(btrim(motivo_cancelamento), '') IS NOT NULL)
);

-- ============================================================
-- 2) RLS + POLÍTICAS (sem o TO, vale para todos os papéis)
-- ============================================================

ALTER TABLE public.pacientes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unidades      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agendamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receitas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exames_solicitados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demo pacientes"     ON public.pacientes;
DROP POLICY IF EXISTS "demo usuarios"      ON public.usuarios;
DROP POLICY IF EXISTS "demo unidades"      ON public.unidades;
DROP POLICY IF EXISTS "demo consultas"     ON public.consultas;
DROP POLICY IF EXISTS "demo agendamentos"  ON public.agendamentos;
DROP POLICY IF EXISTS "demo notificacoes"  ON public.notificacoes;
DROP POLICY IF EXISTS "demo medicamentos"  ON public.medicamentos;
DROP POLICY IF EXISTS "demo configuracoes" ON public.configuracoes;

CREATE POLICY "demo pacientes"     ON public.pacientes     FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo usuarios"      ON public.usuarios      FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo unidades"      ON public.unidades      FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo consultas"     ON public.consultas     FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo agendamentos"  ON public.agendamentos  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo notificacoes"  ON public.notificacoes  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo medicamentos"  ON public.medicamentos  FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "demo configuracoes" ON public.configuracoes FOR ALL USING (TRUE) WITH CHECK (TRUE);

-- Receitas: só ler e incluir (documento emitido). Exames: sem apagar.
DROP POLICY IF EXISTS "receitas leitura"               ON public.receitas;
DROP POLICY IF EXISTS "receitas inclusao"              ON public.receitas;
DROP POLICY IF EXISTS "exames solicitados leitura"     ON public.exames_solicitados;
DROP POLICY IF EXISTS "exames solicitados inclusao"    ON public.exames_solicitados;
DROP POLICY IF EXISTS "exames solicitados atualizacao" ON public.exames_solicitados;
CREATE POLICY "receitas leitura"               ON public.receitas           FOR SELECT USING (TRUE);
CREATE POLICY "receitas inclusao"              ON public.receitas           FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "exames solicitados leitura"     ON public.exames_solicitados FOR SELECT USING (TRUE);
CREATE POLICY "exames solicitados inclusao"    ON public.exames_solicitados FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "exames solicitados atualizacao" ON public.exames_solicitados FOR UPDATE USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- 3) PERMISSÕES
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pacientes     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usuarios      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultas     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agendamentos  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicamentos  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes TO anon, authenticated;
GRANT SELECT, INSERT                 ON public.receitas           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE         ON public.exames_solicitados TO anon, authenticated;

-- ============================================================
-- 4) ÍNDICE DA CONSULTA FEITA PELO TELÃO
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_consultas_telao
    ON public.consultas (unidade, chamado_em DESC)
    WHERE status = 'chamado';

-- ============================================================
-- 5) RECARREGA O CACHE DO POSTGREST
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 6) CONFERÊNCIA (deve retornar 10 linhas, todas com rls = true)
-- ============================================================
SELECT c.relname AS tabela,
       c.relrowsecurity AS rls_ligado,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('pacientes', 'usuarios', 'unidades', 'consultas',
                    'agendamentos', 'notificacoes', 'medicamentos', 'configuracoes',
                    'receitas', 'exames_solicitados')
ORDER BY c.relname;
