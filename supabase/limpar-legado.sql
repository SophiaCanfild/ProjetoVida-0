-- ============================================================
-- VIDA+ — LIMPEZA OPCIONAL DAS TABELAS DO MODELO ANTIGO
-- ------------------------------------------------------------
-- Use APENAS depois de rodar supabase/schema.sql com sucesso.
--
-- O schema.sql NÃO apaga nada: ele renomeia as tabelas do
-- modelo antigo para *_legado (ex.: pacientes_legado).
-- Este arquivo serve para remover essas sobras quando você já
-- confirmou que não precisa mais dos dados antigos.
--
-- ⚠️ FAÇA BACKUP ANTES (Supabase → Database → Backups, ou pg_dump).
-- ⚠️ Este script NÃO toca nas tabelas do app (pacientes, usuarios,
--    consultas, agendamentos, notificacoes...). Ele só remove
--    objetos cujo nome TERMINA em _legado.
-- ============================================================


-- ============================================================
-- 1) O QUE EXISTE HOJE (rode primeiro, só leitura)
-- ============================================================
SELECT c.relname AS tabela_legado,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS tamanho,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = c.relname) AS colunas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname LIKE '%\_legado%'
ORDER BY c.relname;

-- Contagem de linhas de cada tabela legada (para decidir se vale guardar)
DO $$
DECLARE
    r record;
    qtd bigint;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '%\_legado%'
        ORDER BY c.relname
    LOOP
        EXECUTE format('SELECT count(*) FROM public.%I', r.relname) INTO qtd;
        RAISE NOTICE 'public.% -> % registro(s)', r.relname, qtd;
    END LOOP;
END $$;


-- ============================================================
-- 2) REMOVER AS TABELAS LEGADAS
-- ------------------------------------------------------------
-- Descomente o bloco abaixo (selecione da linha "DO $$" até
-- "END $$;" e remova os "--") e rode.
-- ============================================================

-- DO $$
-- DECLARE
--     r record;
-- BEGIN
--     FOR r IN
--         SELECT c.relname
--         FROM pg_class c
--         JOIN pg_namespace n ON n.oid = c.relnamespace
--         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE '%\_legado%'
--         ORDER BY c.relname
--     LOOP
--         EXECUTE format('DROP TABLE public.%I CASCADE', r.relname);
--         RAISE NOTICE 'Removida: public.%', r.relname;
--     END LOOP;
-- END $$;

-- O CASCADE remove apenas dependências dessas próprias tabelas
-- (FKs, índices e views antigas apontando para elas). As tabelas
-- novas do app não dependem de nenhuma tabela *_legado.


-- ============================================================
-- 3) CONFERÊNCIA FINAL
-- ============================================================
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
