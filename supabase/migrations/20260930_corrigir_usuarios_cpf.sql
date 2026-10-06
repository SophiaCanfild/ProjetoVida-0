-- Corrige bancos criados com uma versão antiga do Vida+.
-- Execute no Supabase: SQL Editor -> New query -> Run.

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS nome VARCHAR(160),
    ADD COLUMN IF NOT EXISTS cpf VARCHAR(11);

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS email VARCHAR(120),
    ADD COLUMN IF NOT EXISTS senha_hash TEXT,
    ADD COLUMN IF NOT EXISTS perfil VARCHAR(20),
    ADD COLUMN IF NOT EXISTS registro_profissional VARCHAR(30),
    ADD COLUMN IF NOT EXISTS crm VARCHAR(30),
    ADD COLUMN IF NOT EXISTS coren VARCHAR(30),
    ADD COLUMN IF NOT EXISTS especialidade VARCHAR(100),
    ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS criado_em TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_usuarios_cpf
    ON public.usuarios(cpf);

-- Faz o PostgREST reconhecer a coluna imediatamente.
NOTIFY pgrst, 'reload schema';