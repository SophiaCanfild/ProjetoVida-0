-- ============================================================
-- Vida+ — ATESTADOS: MOTIVO OPCIONAL + HORÁRIO DE PERMANÊNCIA
-- Data: 23/11/2026
--
-- 1) O motivo do atestado deixa de ser obrigatório.
-- 2) Atestados de COMPARECIMENTO e ACOMPANHAMENTO passam a
--    registrar o horário em que o paciente (ou o acompanhante)
--    permaneceu na unidade.
--
-- Como aplicar: Supabase → SQL Editor → cole este arquivo → Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) Motivo opcional
-- ------------------------------------------------------------
ALTER TABLE public.atestados ALTER COLUMN motivo DROP NOT NULL;

-- Bancos antigos podem ter o motivo gravado como texto vazio.
UPDATE public.atestados SET motivo = NULL WHERE btrim(COALESCE(motivo, '')) = '';

-- ------------------------------------------------------------
-- 2) Horário de permanência (comparecimento / acompanhamento)
-- ------------------------------------------------------------
ALTER TABLE public.atestados ADD COLUMN IF NOT EXISTS hora_inicio TIME;
ALTER TABLE public.atestados ADD COLUMN IF NOT EXISTS hora_fim    TIME;

COMMENT ON COLUMN public.atestados.hora_inicio IS
    'Hora de entrada na unidade — usada nos atestados de comparecimento e acompanhamento';
COMMENT ON COLUMN public.atestados.hora_fim IS
    'Hora de saída da unidade — usada nos atestados de comparecimento e acompanhamento';

-- Garante coerência quando as duas horas são informadas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'atestados_horario_ordem'
    ) THEN
        ALTER TABLE public.atestados
            ADD CONSTRAINT atestados_horario_ordem CHECK (
                hora_inicio IS NULL OR hora_fim IS NULL OR hora_inicio <= hora_fim);
    END IF;
END $$;

-- ------------------------------------------------------------
-- Conferência
-- ------------------------------------------------------------
SELECT 'atestados' AS tabela,
       COUNT(*) FILTER (WHERE hora_inicio IS NOT NULL) AS com_horario,
       COUNT(*) FILTER (WHERE btrim(COALESCE(motivo, '')) = '') AS sem_motivo,
       COUNT(*) AS total
FROM public.atestados;

-- DESFAZER (opcional):
--   ALTER TABLE public.atestados DROP CONSTRAINT IF EXISTS atestados_horario_ordem;
--   ALTER TABLE public.atestados DROP COLUMN IF EXISTS hora_fim;
--   ALTER TABLE public.atestados DROP COLUMN IF EXISTS hora_inicio;
--   -- (motivo NOT NULL não é restaurado automaticamente)
