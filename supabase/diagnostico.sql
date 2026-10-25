-- ============================================================
-- VIDA+ — DIAGNÓSTICO DO BANCO (SOMENTE LEITURA)
-- ------------------------------------------------------------
-- Rode no Supabase: SQL Editor → New query → cole → RUN.
-- Nenhum comando aqui altera dados. Cada SELECT responde uma
-- pergunta usada no DIAGNOSTICO-BANCO.md.
-- ============================================================


-- ============================================================
-- 1) QUAIS TABELAS EXISTEM HOJE?
-- O app espera: pacientes, usuarios, unidades, consultas,
-- agendamentos, notificacoes, medicamentos, configuracoes,
-- receitas, exames_solicitados (receita médica / pedido de exames —
-- ver a seção 10 e supabase/migrations/20261025_receitas_exames.sql).
-- ============================================================
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;


-- ============================================================
-- 2) QUAL MODELO DE PACIENTES ESTÁ INSTALADO?
-- "id_paciente BIGINT" + coluna "id_usuario" = modelo ANTIGO
-- (o do SQL com triagens/fila_atendimento), incompatível com o app.
-- "id UUID" + "nome" + "nascimento" = modelo do schema.sql (correto).
-- ============================================================
SELECT ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pacientes'
ORDER BY ordinal_position;


-- ============================================================
-- 3) VEREDITO AUTOMÁTICO DA TABELA PACIENTES
-- ============================================================
SELECT
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'pacientes'
              AND column_name = 'id_paciente'
        )
        AND NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'pacientes'
              AND column_name = 'nome'
        )
        THEN 'MODELO ANTIGO (id_paciente BIGINT): o app NÃO consegue gravar pacientes aqui'
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'pacientes'
              AND column_name = 'id'
        )
        AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'pacientes'
              AND column_name = 'nome'
        )
        THEN 'MODELO DO APP (id UUID + nome): compatível'
        ELSE 'TABELA PACIENTES INEXISTENTE OU INCOMPLETA'
    END AS veredito;


-- ============================================================
-- 4) O QUE A TABELA PACIENTES EXIGE (NOT NULL / PK / FK)
-- Se aparecer id_usuario ou id_paciente como NOT NULL, todo
-- INSERT feito pelo app será recusado (erro 23502).
-- ============================================================
SELECT
    kcu.column_name,
    tc.constraint_type,
    tc.constraint_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'pacientes'
ORDER BY tc.constraint_type, kcu.column_name;


-- ============================================================
-- 5) COLUNAS-CHAVE DAS OUTRAS TABELAS USADAS PELO APP
-- (compare com shared/js/db.js → MAPA_TABELAS)
-- ============================================================
SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS colunas
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('usuarios', 'consultas', 'agendamentos', 'notificacoes',
                     'receitas', 'exames_solicitados')
GROUP BY table_name
ORDER BY table_name;


-- ============================================================
-- 6) RLS ESTÁ LIGADO? EXISTEM POLÍTICAS PARA O anon?
-- RLS ligado + nenhuma política = todo INSERT falha com 42501
-- ("new row violates row-level security policy").
-- ============================================================
SELECT c.relname AS tabela, c.relrowsecurity AS rls_ligado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

SELECT tablename, policyname, cmd, qual IS NOT NULL AS tem_using, with_check IS NOT NULL AS tem_with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- ============================================================
-- 7) O PAPEL anon TEM PERMISSÃO DE INSERT/UPDATE?
-- ============================================================
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN ('pacientes', 'usuarios', 'consultas', 'agendamentos', 'notificacoes',
                     'receitas', 'exames_solicitados')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;


-- ============================================================
-- 8) REALTIME ESTÁ PUBLICADO NAS TABELAS?
-- (falha aqui não impede gravar; só não atualiza sozinho)
-- ============================================================
SELECT tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
ORDER BY tablename;


-- ============================================================
-- 9) QUANTOS REGISTROS EXISTEM (o "salvou" real)
-- ============================================================
SELECT 'pacientes' AS tabela, count(*) FROM public.pacientes
UNION ALL SELECT 'usuarios', count(*) FROM public.usuarios
UNION ALL SELECT 'consultas', count(*) FROM public.consultas
UNION ALL SELECT 'agendamentos', count(*) FROM public.agendamentos
UNION ALL SELECT 'notificacoes', count(*) FROM public.notificacoes
ORDER BY tabela;


-- ============================================================
-- 10) RECEITA MÉDICA E SOLICITAR EXAME (migração 2026-10-25)
-- "FALTA" = rode supabase/migrations/20261025_receitas_exames.sql
-- (ou o schema.sql atualizado). Sem as tabelas o médico continua
-- emitindo, mas os registros ficam só na foto da consulta.
-- ============================================================
SELECT t.tabela,
       CASE WHEN to_regclass('public.' || t.tabela) IS NULL
            THEN 'FALTA — rode supabase/migrations/20261025_receitas_exames.sql'
            ELSE 'OK' END AS situacao,
       (SELECT count(*) FROM information_schema.columns c
         WHERE c.table_schema = 'public' AND c.table_name = t.tabela) AS colunas,
       t.colunas_esperadas
FROM (VALUES ('receitas', 17), ('exames_solicitados', 24)) AS t(tabela, colunas_esperadas)
ORDER BY t.tabela;
