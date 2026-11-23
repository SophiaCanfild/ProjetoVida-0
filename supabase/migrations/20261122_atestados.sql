-- ============================================================
-- Vida+ — ATESTADOS MÉDICOS
-- Data: 22/11/2026
--
-- Cria a tabela `atestados`, que registra os atestados emitidos
-- pelo médico durante a consulta. O documento também continua
-- existindo como "foto" em consultas.atestado (ver schema.sql).
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabela
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.atestados (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id      UUID         NOT NULL,
    paciente_id      UUID,                                   -- FK → pacientes
    cpf              VARCHAR(11)  NOT NULL,
    numero           VARCHAR(30)  NOT NULL,                  -- ex.: AT-20261122-7KQ2M
    tipo             VARCHAR(30)  NOT NULL DEFAULT 'afastamento',
    -- afastamento | acompanhamento | comparecimento | previsao_parto | doacao_sangue | outros
    data_atendimento DATE         NOT NULL DEFAULT CURRENT_DATE,
    periodo_inicio   DATE,        -- quando o atestado tem período de afastamento
    periodo_fim      DATE,
    dias             SMALLINT,
    cid10            VARCHAR(10),
    motivo           TEXT         NOT NULL,                  -- ex.: "gripe (J06.9)"
    observacoes      TEXT,
    medico_nome      VARCHAR(160),
    medico_crm       VARCHAR(30),
    unidade          VARCHAR(80),
    emitida_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    criado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT atestados_numero_unico    UNIQUE (numero),
    CONSTRAINT atestados_tipo_valido     CHECK (tipo IN
        ('afastamento', 'acompanhamento', 'comparecimento', 'previsao_parto', 'doacao_sangue', 'outros')),
    CONSTRAINT atestados_dias_positivo   CHECK (dias IS NULL OR dias >= 0),
    CONSTRAINT atestados_periodo_ordem   CHECK (
        periodo_inicio IS NULL OR periodo_fim IS NULL OR periodo_inicio <= periodo_fim)
);

CREATE INDEX IF NOT EXISTS idx_atestados_cpf      ON public.atestados (cpf);
CREATE INDEX IF NOT EXISTS idx_atestados_consulta ON public.atestados (consulta_id);
CREATE INDEX IF NOT EXISTS idx_atestados_data     ON public.atestados (data_atendimento);

-- ------------------------------------------------------------
-- 2) Chaves estrangeiras (somente se as tabelas pai existirem)
-- ------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'consultas')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint
                       WHERE conname = 'atestados_consulta_fk') THEN
        ALTER TABLE public.atestados
            ADD CONSTRAINT atestados_consulta_fk
            FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'pacientes')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint
                       WHERE conname = 'atestados_paciente_fk') THEN
        ALTER TABLE public.atestados
            ADD CONSTRAINT atestados_paciente_fk
            FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE SET NULL;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 3) RLS + POLÍTICAS + PERMISSÕES
--    (mesmo padrão "demo" das demais tabelas: ver schema.sql, fase 6)
-- ------------------------------------------------------------
ALTER TABLE public.atestados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atestados leitura"  ON public.atestados;
DROP POLICY IF EXISTS "atestados inclusao" ON public.atestados;

-- Atestado é documento: ler + incluir (sem UPDATE/DELETE = bloqueado)
CREATE POLICY "atestados leitura"  ON public.atestados
    FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "atestados inclusao" ON public.atestados
    FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

DO $$
DECLARE
    papel text;
BEGIN
    FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', papel);
            EXECUTE format('GRANT SELECT, INSERT ON public.atestados TO %I', papel);
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.atestados FROM %I', papel);
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4) REALTIME — médico e app do paciente atualizam sozinhos
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'atestados'
    ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', 'atestados');
    END IF;
END $$;

-- ------------------------------------------------------------
-- 5) Verificação
-- ------------------------------------------------------------
SELECT 'atestados' AS tabela,
       count(*)   AS registros
FROM public.atestados;

-- ============================================================
-- DESFAZER (opcional — APAGA os atestados emitidos):
--   DROP TABLE IF EXISTS public.atestados;
-- As consultas continuam com a "foto" em consultas.atestado.
-- ============================================================
