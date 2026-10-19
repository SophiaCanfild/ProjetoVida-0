-- ============================================================
-- VIDA+ — MIGRAÇÃO DO MODELO ANTIGO (OPCIONAL)
-- ------------------------------------------------------------
-- Use SOMENTE se supabase/diagnostico.sql mostrar que a tabela
-- public.pacientes tem a coluna "id_paciente" (BIGINT) e NÃO tem
-- "nome". Esse é o modelo do SQL antigo (usuarios/pacientes/
-- medicos/triagens/fila_atendimento...), que o app não lê.
--
-- O que este script faz:
--   renomeia as tabelas antigas para *_legado (os dados NÃO são
--   apagados) e libera os nomes para o schema novo do app.
--
-- ⚠️ ANTES DE RODAR:
--   1. Faça backup (Supabase → Database → Backups, ou pg_dump).
--   2. O script aborta sozinho se o banco NÃO estiver no modelo
--      antigo, então ele não estraga uma base já correta.
--   3. Depois de rodar ESTE arquivo, rode supabase/schema.sql.
-- ============================================================

DO $$
DECLARE
    tabelas text[] := ARRAY[
        'usuarios', 'pacientes', 'medicos', 'triagens', 'fila_atendimento',
        'consultas', 'prescricoes', 'encaminhamentos', 'exames', 'auditoria',
        'notificacoes', 'agendamentos', 'unidades', 'medicamentos', 'configuracoes'
    ];
    t text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pacientes'
          AND column_name = 'id_paciente'
    ) THEN
        RAISE EXCEPTION
            'Abortado: public.pacientes não está no modelo antigo. Nada foi alterado.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'pacientes'
          AND column_name = 'nome'
    ) THEN
        -- Modelo antigo confirmado: renomeia (sem apagar dados).
        FOREACH t IN ARRAY tabelas LOOP
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t
            ) AND to_regclass('public.' || t || '_legado') IS NULL THEN
                EXECUTE format('ALTER TABLE public.%I RENAME TO %I', t, t || '_legado');
                RAISE NOTICE 'Renomeada: public.% -> public.%_legado', t, t;
            END IF;
        END LOOP;
    ELSE
        RAISE EXCEPTION
            'Abortado: public.pacientes já tem a coluna "nome" (modelo novo). Nada foi alterado.';
    END IF;
END $$;

-- Confirme o resultado:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Agora rode supabase/schema.sql (cria as tabelas do app, políticas
-- de RLS e publicação de Realtime).
