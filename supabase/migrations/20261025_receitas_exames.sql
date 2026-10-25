-- ============================================================
-- VIDA+ — MIGRAÇÃO 2026-10-25: RECEITA MÉDICA E SOLICITAÇÃO DE EXAMES
-- ============================================================
-- Para quem JÁ tem o banco instalado com supabase/schema.sql.
-- (Instalação nova: basta rodar o supabase/schema.sql, que já
--  inclui tudo o que está aqui.)
--
-- O QUE FAZ — idempotente, pode rodar mais de uma vez
--   1. Cria public.receitas            → 1 linha por receita emitida
--   2. Cria public.exames_solicitados  → 1 linha por exame pedido
--   3. Chaves estrangeiras → consultas / pacientes
--   4. Índices (inclui a lista de exames pendentes)
--   5. Gatilho que mantém exames_solicitados.atualizado_em
--   6. RLS + políticas + permissões
--        receitas           → ler e incluir. Receita emitida é
--                             documento: o app não altera nem apaga.
--        exames_solicitados → ler, incluir e atualizar (status e
--                             resultado). Não apaga: usa "cancelado".
--   7. Publica as duas tabelas no Realtime
--   8. Copia para as tabelas novas as receitas/exames gravados nas
--      consultas ANTES desta migração (consultas.receita/.exames)
--   9. Verificação final
--
-- NÃO altera nem apaga dados das tabelas que já existem. As colunas
-- consultas.receita e consultas.exames (JSONB) continuam recebendo
-- a "foto" dos itens — é o que o app do paciente lê.
--
-- COMO USAR
--   Supabase → SQL Editor → New query → cole TODO o arquivo → Run.
--   Resultado esperado: a tabela da verificação com "✅ OK" nas
--   duas linhas.
--
-- ⚠️ SEGURANÇA: assim como no schema.sql, as políticas são
--    permissivas para o papel anon (login feito no navegador —
--    TCC/demo). Para produção use Supabase Auth e políticas por perfil.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ------------------------------------------------------------
-- 1) RECEITAS — documento emitido pelo médico
--    MAPA_TABELAS.receitas em shared/js/db.js
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.receitas (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id    UUID         NOT NULL,                  -- FK → consultas (passo 3)
    paciente_id    UUID,                                   -- FK → pacientes (passo 3)
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


-- ------------------------------------------------------------
-- 2) EXAMES SOLICITADOS — pedido de exame com ciclo de status
--    solicitado → realizado → resultado_disponivel  (ou cancelado)
--    MAPA_TABELAS.exames_solicitados em shared/js/db.js
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exames_solicitados (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consulta_id          UUID          NOT NULL,           -- FK → consultas (passo 3)
    paciente_id          UUID,                             -- FK → pacientes (passo 3)
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


-- ------------------------------------------------------------
-- 3) CHAVES ESTRANGEIRAS
--    ON DELETE CASCADE acompanha a exclusão da consulta/paciente,
--    como nas demais tabelas do Vida+.
-- ------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receitas_consulta') THEN
        BEGIN
            ALTER TABLE public.receitas ADD CONSTRAINT fk_receitas_consulta
                FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE;
        EXCEPTION WHEN others THEN
            RAISE NOTICE '[receitas] FK receitas→consultas não criada: %', SQLERRM;
        END;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receitas_paciente') THEN
        BEGIN
            ALTER TABLE public.receitas ADD CONSTRAINT fk_receitas_paciente
                FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;
        EXCEPTION WHEN others THEN
            RAISE NOTICE '[receitas] FK receitas→pacientes não criada: %', SQLERRM;
        END;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_exames_sol_consulta') THEN
        BEGIN
            ALTER TABLE public.exames_solicitados ADD CONSTRAINT fk_exames_sol_consulta
                FOREIGN KEY (consulta_id) REFERENCES public.consultas(id) ON DELETE CASCADE;
        EXCEPTION WHEN others THEN
            RAISE NOTICE '[exames] FK exames_solicitados→consultas não criada: %', SQLERRM;
        END;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_exames_sol_paciente') THEN
        BEGIN
            ALTER TABLE public.exames_solicitados ADD CONSTRAINT fk_exames_sol_paciente
                FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id) ON DELETE CASCADE;
        EXCEPTION WHEN others THEN
            RAISE NOTICE '[exames] FK exames_solicitados→pacientes não criada: %', SQLERRM;
        END;
    END IF;
END $$;


-- ------------------------------------------------------------
-- 4) ÍNDICES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_receitas_cpf            ON public.receitas (cpf);
CREATE INDEX IF NOT EXISTS idx_receitas_consulta       ON public.receitas (consulta_id);
CREATE INDEX IF NOT EXISTS idx_receitas_paciente       ON public.receitas (paciente_id);
CREATE INDEX IF NOT EXISTS idx_receitas_emitida        ON public.receitas (emitida_em DESC);
CREATE INDEX IF NOT EXISTS idx_exames_sol_cpf          ON public.exames_solicitados (cpf);
CREATE INDEX IF NOT EXISTS idx_exames_sol_consulta     ON public.exames_solicitados (consulta_id);
CREATE INDEX IF NOT EXISTS idx_exames_sol_paciente     ON public.exames_solicitados (paciente_id);
CREATE INDEX IF NOT EXISTS idx_exames_sol_pedido       ON public.exames_solicitados (pedido);
-- lista de trabalho da página "Solicitar Exames" (pendentes, urgentes primeiro)
CREATE INDEX IF NOT EXISTS idx_exames_sol_pendentes    ON public.exames_solicitados (prioridade, solicitado_em)
    WHERE status IN ('solicitado', 'realizado');


-- ------------------------------------------------------------
-- 5) GATILHO — atualizado_em sempre correto, inclusive quando o
--    resultado é lançado direto no painel do Supabase
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vida_tocar_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.atualizado_em := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exames_sol_atualizado_em ON public.exames_solicitados;
CREATE TRIGGER trg_exames_sol_atualizado_em
    BEFORE UPDATE ON public.exames_solicitados
    FOR EACH ROW EXECUTE FUNCTION public.vida_tocar_atualizado_em();


-- ------------------------------------------------------------
-- 6) RLS + POLÍTICAS + PERMISSÕES
-- ------------------------------------------------------------
ALTER TABLE public.receitas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exames_solicitados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receitas leitura"               ON public.receitas;
DROP POLICY IF EXISTS "receitas inclusao"              ON public.receitas;
DROP POLICY IF EXISTS "exames solicitados leitura"     ON public.exames_solicitados;
DROP POLICY IF EXISTS "exames solicitados inclusao"    ON public.exames_solicitados;
DROP POLICY IF EXISTS "exames solicitados atualizacao" ON public.exames_solicitados;

-- Receitas: ler + incluir (sem política de UPDATE/DELETE = bloqueado)
CREATE POLICY "receitas leitura"  ON public.receitas
    FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "receitas inclusao" ON public.receitas
    FOR INSERT TO anon, authenticated WITH CHECK (TRUE);

-- Exames: ler + incluir + atualizar status/resultado (sem DELETE)
CREATE POLICY "exames solicitados leitura"     ON public.exames_solicitados
    FOR SELECT TO anon, authenticated USING (TRUE);
CREATE POLICY "exames solicitados inclusao"    ON public.exames_solicitados
    FOR INSERT TO anon, authenticated WITH CHECK (TRUE);
CREATE POLICY "exames solicitados atualizacao" ON public.exames_solicitados
    FOR UPDATE TO anon, authenticated USING (TRUE) WITH CHECK (TRUE);

DO $$
DECLARE
    papel text;
BEGIN
    FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', papel);
            EXECUTE format('GRANT SELECT, INSERT ON public.receitas TO %I', papel);
            EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.receitas FROM %I', papel);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.exames_solicitados TO %I', papel);
            EXECUTE format('REVOKE DELETE, TRUNCATE ON public.exames_solicitados FROM %I', papel);
        END IF;
    END LOOP;
END $$;


-- ------------------------------------------------------------
-- 7) REALTIME — médico e app do paciente atualizam sozinhos
-- ------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;

    FOREACH t IN ARRAY ARRAY['receitas', 'exames_solicitados'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;


-- ------------------------------------------------------------
-- 8) RECUPERA o que foi gravado ANTES desta migração
-- ------------------------------------------------------------
-- Se o sistema médico foi usado antes de as tabelas existirem, as
-- receitas e os exames ficaram só na "foto" da consulta. Aqui eles
-- são copiados para as tabelas novas (só os itens com id, gerados
-- pela versão nova do sistema). Seguro rodar várias vezes; se algo
-- der errado, só avisa e não interrompe a migração.
DO $$
DECLARE
    n_receitas integer := 0;
    n_exames   integer := 0;
BEGIN
    BEGIN
        INSERT INTO public.receitas (id, consulta_id, paciente_id, cpf, numero, tipo, vias, itens,
                                     orientacoes, validade_dias, valida_ate, medico_nome, medico_crm,
                                     unidade, emitida_em)
        SELECT g.receita_id, c.id, c.paciente_id, c.cpf, g.numero, g.tipo,
               CASE WHEN g.tipo = 'simples' THEN 1 ELSE 2 END,
               g.itens, c.orientacoes,
               CASE g.tipo WHEN 'antimicrobiano' THEN 10 WHEN 'controle_especial' THEN 30 END,
               g.valida_ate, c.medico_nome, c.medico_crm, c.unidade,
               COALESCE(c.finalizado_em, c.criado_em, NOW())
        FROM public.consultas c
        CROSS JOIN LATERAL (
            SELECT (x.item->>'receita_id')::uuid AS receita_id,
                   MIN(x.item->>'receita_numero') AS numero,
                   MIN(x.item->>'receita_tipo')   AS tipo,
                   MIN(CASE WHEN x.item->>'valida_ate' ~ '^\d{4}-\d{2}-\d{2}$'
                            THEN (x.item->>'valida_ate')::date END) AS valida_ate,
                   jsonb_agg(x.item - 'receita_id' - 'receita_numero' - 'receita_tipo' - 'valida_ate'
                             ORDER BY x.ordem) AS itens
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.receita) = 'array'
                                           THEN c.receita ELSE '[]'::jsonb END)
                 WITH ORDINALITY AS x(item, ordem)
            WHERE x.item->>'receita_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            GROUP BY x.item->>'receita_id'
        ) g
        WHERE c.status = 'finalizado'
          AND g.numero IS NOT NULL
          AND g.tipo IN ('simples', 'antimicrobiano', 'controle_especial')
          AND (g.tipo <> 'controle_especial' OR jsonb_array_length(g.itens) <= 3)
          AND NOT EXISTS (SELECT 1 FROM public.receitas r WHERE r.id = g.receita_id OR r.numero = g.numero);
        GET DIAGNOSTICS n_receitas = ROW_COUNT;
    EXCEPTION WHEN others THEN
        RAISE NOTICE '[recuperação] receitas não copiadas: %', SQLERRM;
    END;

    BEGIN
        INSERT INTO public.exames_solicitados (id, consulta_id, paciente_id, cpf, pedido, nome, categoria,
                                               prioridade, indicacao, cid10, orientacao, local_realizacao,
                                               status, resultado, realizado_em, resultado_em, cancelado_em,
                                               motivo_cancelamento, atualizado_por, medico_nome, medico_crm,
                                               unidade, solicitado_em)
        SELECT (e.item->>'id')::uuid, c.id, c.paciente_id, c.cpf,
               COALESCE(NULLIF(left(e.item->>'pedido', 30), ''),
                        'EX-' || to_char(COALESCE(c.finalizado_em, c.criado_em, NOW()), 'YYYYMMDD')
                              || '-' || upper(substr(md5(c.id::text), 1, 5))),
               left(btrim(e.item->>'nome'), 160),
               CASE WHEN e.item->>'categoria' IN ('laboratorial', 'imagem', 'cardiologico', 'teste_rapido', 'outros')
                    THEN e.item->>'categoria' ELSE 'outros' END,
               CASE WHEN e.item->>'prioridade' = 'urgente' THEN 'urgente' ELSE 'rotina' END,
               e.item->>'indicacao',
               left(COALESCE(NULLIF(e.item->>'cid10', ''), c.cid10), 10),
               e.item->>'orientacao',
               left(e.item->>'local_realizacao', 160),
               CASE
                   WHEN e.item->>'status' = 'resultado_disponivel'
                        AND NULLIF(btrim(e.item->>'resultado'), '') IS NOT NULL THEN 'resultado_disponivel'
                   WHEN e.item->>'status' = 'cancelado'
                        AND NULLIF(btrim(e.item->>'motivo_cancelamento'), '') IS NOT NULL THEN 'cancelado'
                   WHEN e.item->>'status' IN ('realizado', 'resultado_disponivel') THEN 'realizado'
                   ELSE 'solicitado'
               END,
               e.item->>'resultado',
               CASE WHEN e.item->>'realizado_em' ~ '^\d{4}-\d{2}-\d{2}' THEN (e.item->>'realizado_em')::timestamptz END,
               CASE WHEN e.item->>'resultado_em' ~ '^\d{4}-\d{2}-\d{2}' THEN (e.item->>'resultado_em')::timestamptz END,
               CASE WHEN e.item->>'cancelado_em' ~ '^\d{4}-\d{2}-\d{2}' THEN (e.item->>'cancelado_em')::timestamptz END,
               e.item->>'motivo_cancelamento',
               left(e.item->>'atualizado_por', 160),
               COALESCE(left(e.item->>'medico_nome', 160), c.medico_nome),
               COALESCE(left(e.item->>'medico_crm', 30), c.medico_crm),
               COALESCE(left(e.item->>'unidade', 80), c.unidade),
               COALESCE(CASE WHEN e.item->>'solicitado_em' ~ '^\d{4}-\d{2}-\d{2}'
                             THEN (e.item->>'solicitado_em')::timestamptz END,
                        c.finalizado_em, c.criado_em, NOW())
        FROM public.consultas c
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c.exames) = 'array'
                                                     THEN c.exames ELSE '[]'::jsonb END) AS e(item)
        WHERE c.status = 'finalizado'
          AND e.item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND NULLIF(btrim(e.item->>'nome'), '') IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.exames_solicitados s WHERE s.id = (e.item->>'id')::uuid);
        GET DIAGNOSTICS n_exames = ROW_COUNT;
    EXCEPTION WHEN others THEN
        RAISE NOTICE '[recuperação] exames não copiados: %', SQLERRM;
    END;

    RAISE NOTICE '[recuperação] % receita(s) e % exame(s) copiados das consultas.', n_receitas, n_exames;
END $$;


-- ------------------------------------------------------------
-- 9) VERIFICAÇÃO FINAL — esperado: "✅ OK" nas duas linhas
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';   -- PostgREST enxerga as tabelas na hora (evita PGRST205)

WITH esperado (tabela, coluna) AS (
    VALUES
        ('receitas', 'id'), ('receitas', 'consulta_id'), ('receitas', 'paciente_id'),
        ('receitas', 'cpf'), ('receitas', 'numero'), ('receitas', 'tipo'), ('receitas', 'vias'),
        ('receitas', 'itens'), ('receitas', 'orientacoes'), ('receitas', 'validade_dias'),
        ('receitas', 'valida_ate'), ('receitas', 'alertas'), ('receitas', 'medico_nome'),
        ('receitas', 'medico_crm'), ('receitas', 'unidade'), ('receitas', 'emitida_em'),
        ('receitas', 'criado_em'),

        ('exames_solicitados', 'id'), ('exames_solicitados', 'consulta_id'),
        ('exames_solicitados', 'paciente_id'), ('exames_solicitados', 'cpf'),
        ('exames_solicitados', 'pedido'), ('exames_solicitados', 'nome'),
        ('exames_solicitados', 'categoria'), ('exames_solicitados', 'prioridade'),
        ('exames_solicitados', 'indicacao'), ('exames_solicitados', 'cid10'),
        ('exames_solicitados', 'orientacao'), ('exames_solicitados', 'local_realizacao'),
        ('exames_solicitados', 'status'), ('exames_solicitados', 'resultado'),
        ('exames_solicitados', 'realizado_em'), ('exames_solicitados', 'resultado_em'),
        ('exames_solicitados', 'cancelado_em'), ('exames_solicitados', 'motivo_cancelamento'),
        ('exames_solicitados', 'atualizado_por'), ('exames_solicitados', 'medico_nome'),
        ('exames_solicitados', 'medico_crm'), ('exames_solicitados', 'unidade'),
        ('exames_solicitados', 'solicitado_em'), ('exames_solicitados', 'atualizado_em')
),
faltando AS (
    SELECT e.tabela, string_agg(e.coluna, ', ' ORDER BY e.coluna) AS colunas
    FROM esperado e
    LEFT JOIN information_schema.columns c
           ON c.table_schema = 'public' AND c.table_name = e.tabela AND c.column_name = e.coluna
    WHERE c.column_name IS NULL
    GROUP BY e.tabela
),
resumo AS (
    SELECT t.tabela,
           f.colunas AS colunas_faltando,
           COALESCE((SELECT cl.relrowsecurity FROM pg_class cl
                      WHERE cl.oid = to_regclass('public.' || t.tabela)), FALSE) AS rls_ligado,
           (SELECT count(*) FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = t.tabela) AS politicas,
           EXISTS (SELECT 1 FROM pg_constraint k
                    WHERE k.conrelid = to_regclass('public.' || t.tabela) AND k.contype = 'f') AS chaves_estrangeiras,
           EXISTS (SELECT 1 FROM pg_publication_tables p
                    WHERE p.pubname = 'supabase_realtime' AND p.schemaname = 'public'
                      AND p.tablename = t.tabela) AS realtime
    FROM (VALUES ('receitas'), ('exames_solicitados')) AS t(tabela)
    LEFT JOIN faltando f ON f.tabela = t.tabela
)
SELECT r.tabela,
       CASE
           WHEN to_regclass('public.' || r.tabela) IS NULL THEN '❌ tabela não existe'
           WHEN r.colunas_faltando IS NOT NULL THEN '❌ faltam colunas'
           WHEN NOT r.rls_ligado OR r.politicas = 0 THEN '⚠️ RLS/políticas'
           WHEN NOT r.chaves_estrangeiras THEN '⚠️ sem chaves estrangeiras (veja os avisos)'
           WHEN NOT r.realtime THEN '⚠️ fora do Realtime'
           ELSE '✅ OK'
       END AS situacao,
       r.colunas_faltando,
       r.rls_ligado,
       r.politicas,
       r.chaves_estrangeiras,
       r.realtime,
       CASE r.tabela
           WHEN 'receitas' THEN (SELECT count(*) FROM public.receitas)
           ELSE (SELECT count(*) FROM public.exames_solicitados)
       END AS registros
FROM resumo r
ORDER BY r.tabela;

-- ============================================================
-- DESFAZER (opcional — APAGA as receitas e os pedidos de exame):
--   DROP TABLE IF EXISTS public.exames_solicitados;
--   DROP TABLE IF EXISTS public.receitas;
--   DROP FUNCTION IF EXISTS public.vida_tocar_atualizado_em();
-- As consultas continuam com a "foto" em consultas.receita/.exames.
-- ============================================================
