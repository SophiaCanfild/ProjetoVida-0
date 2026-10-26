-- ============================================================
-- VIDA+ — MAPAS E VÍNCULOS DE MÉDICOS/CONSULTÓRIOS
-- Migração aditiva e idempotente — 2026-10-25
-- ============================================================
-- Use quando o banco JÁ existe e ainda não tem public.configuracoes.
-- A tabela guarda:
--   • mapa_hospital_*       → mapas publicados por unidade;
--   • equipe_consultorios_* → vínculos de médicos por CPF/unidade.
--
-- O SQL legado com usuarios.id_usuario BIGINT, pacientes.id_paciente,
-- medicos/triagens/fila_atendimento NÃO é convertido aqui. Para usar
-- todos os módulos do app nesse modelo, faça backup e rode o instalador
-- completo supabase/schema.sql, que preserva as tabelas antigas como
-- *_legado. Esta migração não apaga nem renomeia nenhuma tabela.
--
-- Instalação nova: supabase/schema.sql já contém esta estrutura; não
-- é necessário executar este arquivo separadamente.
--
-- SEGURANÇA: a política abaixo segue o modo demonstração do projeto,
-- com login no navegador e anon key. Para produção, substitua por
-- Supabase Auth e políticas por perfil antes de expor dados reais.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) Estrutura mínima usada por MapaHospitalStore e
--    EquipeConsultorioStore. Não depende das tabelas legadas.
CREATE TABLE IF NOT EXISTS public.configuracoes (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chave          VARCHAR(100) NOT NULL,
    valor          TEXT NOT NULL,
    descricao      VARCHAR(300),
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Repara instalações parciais sem alterar colunas já existentes.
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS id            UUID DEFAULT gen_random_uuid();
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS chave         VARCHAR(100);
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS valor         TEXT;
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS descricao     VARCHAR(300);
ALTER TABLE public.configuracoes ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ DEFAULT NOW();

-- O upsert do front-end usa onConflict: 'chave'. Se houver duplicatas
-- antigas, o erro deste índice deve ser resolvido antes de continuar;
-- não escolhemos silenciosamente qual registro seria apagado.
CREATE UNIQUE INDEX IF NOT EXISTS ux_configuracoes_chave
    ON public.configuracoes (chave);

-- 2) RLS/permissões compatíveis com o modo demo do restante do app.
ALTER TABLE public.configuracoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'configuracoes'
          AND policyname = 'demo configuracoes'
    ) THEN
        EXECUTE 'CREATE POLICY "demo configuracoes" ON public.configuracoes FOR ALL USING (TRUE) WITH CHECK (TRUE)';
    END IF;
END $$;

-- Em Supabase os papéis existem; o IF também permite validar o script
-- em um PostgreSQL comum, sem falhar por papel inexistente.
DO $$
DECLARE
    papel text;
BEGIN
    FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', papel);
            EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.configuracoes TO %I', papel);
        END IF;
    END LOOP;
END $$;

COMMENT ON TABLE public.configuracoes IS
    'Configurações VIDA+: mapas publicados e vínculos de médicos/consultórios por unidade.';

-- Faz o PostgREST enxergar a tabela sem esperar uma nova implantação.
NOTIFY pgrst, 'reload schema';

-- 3) Verificação somente leitura: deve listar as cinco colunas.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'configuracoes'
  AND column_name IN ('id', 'chave', 'valor', 'descricao', 'atualizado_em')
ORDER BY ordinal_position;
