-- VIDA+ — diagnóstico somente de leitura para o módulo de rotas
-- Execute no SQL Editor do projeto Supabase de destino. Este arquivo NÃO cria,
-- altera ou apaga tabelas, dados, permissões ou políticas.
-- Analise cada resultado; nenhuma consulta abaixo demonstra que o acesso é seguro.

-- 1. A tabela existente deve estar presente.
SELECT to_regclass('public.configuracoes') AS tabela_configuracoes;

-- 2. Colunas usadas pelo editor e pelos vínculos de consultório.
-- Esperado: chave (texto, até 100 caracteres), valor (texto), descricao (texto)
-- e atualizado_em (timestamp com fuso). O ID gerado automaticamente é desejável.
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'configuracoes'
  AND column_name IN ('id', 'chave', 'valor', 'descricao', 'atualizado_em')
ORDER BY ordinal_position;

-- 3. Deve existir uma restrição ou índice UNIQUE em chave, sem filtro parcial.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'configuracoes';

-- 4. RLS habilitada não significa que ela esteja protegendo os dados.
SELECT n.nspname AS esquema, c.relname AS tabela,
       c.relrowsecurity AS rls_habilitada, c.relforcerowsecurity AS rls_forcada
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'configuracoes';

-- 5. Confira TODAS as políticas: políticas permissivas são combinadas com OR.
-- USING (true) ou WITH CHECK (true) para anon/authenticated pode liberar acesso
-- entre unidades. É preciso revisar também permissões e políticas das tabelas
-- clínicas, de usuários, consultas e dos demais módulos.
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'configuracoes'
ORDER BY policyname;

-- 6. Permissões declaradas para os papéis usados pela API.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'configuracoes'
  AND grantee IN ('PUBLIC', 'anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- IMPORTANTE: a ausência de linhas pode decorrer das permissões do usuário que
-- executa o diagnóstico. Não habilite políticas de demonstração nem remova
-- políticas existentes como solução rápida. A migração para Supabase Auth e
-- RLS requer identidades e vínculos de cada usuário/dispositivo por unidade;
-- aplicá-la antes de migrar os acessos pode interromper o sistema existente.
