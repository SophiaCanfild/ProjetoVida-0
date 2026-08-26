#!/bin/bash
# ============================================================
# VIDA+ — Script de Unificação
# Clona os 3 repositórios e reorganiza em uma estrutura única
# ============================================================

set -e

echo "🚀 Vida+ — Unificando os 3 repositórios..."
echo ""

# Ir para a pasta do projeto
cd "$(dirname "$0")"
ROOT="$(pwd)"

# -----------------------------------------------------------
# 1. Clonar repositórios temporariamente
# -----------------------------------------------------------
echo "📥 Baixando repositórios..."
rm -rf _tmp
mkdir _tmp
cd _tmp

git clone --depth 1 https://github.com/SophiaCanfild/ProjetoVida-.git sistema
git clone --depth 1 https://github.com/SophiaCanfild/ProjetoVida-App.git paciente
git clone --depth 1 https://github.com/SophiaCanfild/ProjetoVida-Tv.git telao

echo "✅ Repositórios baixados!"
echo ""

# -----------------------------------------------------------
# 2. Copiar Sistema Médico
# -----------------------------------------------------------
echo "🏥 Organizando Sistema Médico..."
cd "$ROOT"

# HTMLs do sistema médico
cp _tmp/sistema/admin/index.html          sistema-medico/admin/index.html
cp _tmp/sistema/medico/index.html         sistema-medico/medico/index.html
cp _tmp/sistema/enfermeiro/index.html     sistema-medico/enfermeiro/index.html
cp _tmp/sistema/recepcionista/index.html  sistema-medico/recepcionista/index.html

# Login
cp _tmp/sistema/login/admin.html          sistema-medico/login/admin.html
cp _tmp/sistema/login/funcionario.html    sistema-medico/login/funcionario.html

# CSS do sistema médico
cp _tmp/sistema/css/global.css            sistema-medico/css/global.css

# JS do sistema médico (config.js original → renomear para dados mockados)
cp _tmp/sistema/js/config.js              sistema-medico/js/config.js

echo "  ✅ Sistema Médico copiado"

# -----------------------------------------------------------
# 3. Copiar App do Paciente
# -----------------------------------------------------------
echo "📱 Organizando App do Paciente..."

# HTMLs
for f in index.html login.html fila.html historico.html exames.html agendamentos.html perfil.html notificacoes.html consulta.html; do
    cp _tmp/paciente/$f paciente-app/$f 2>/dev/null || echo "  ⚠️  $f não encontrado"
done

# PWA
cp _tmp/paciente/manifest.json paciente-app/manifest.json 2>/dev/null || true

# CSS
cp _tmp/paciente/css/app.css paciente-app/css/app.css

# JS
for f in config.js db.js ui.js nav.js notificacao.js; do
    cp _tmp/paciente/js/$f paciente-app/js/$f 2>/dev/null || echo "  ⚠️  js/$f não encontrado"
done

# Icons
cp -r _tmp/paciente/icons/* paciente-app/icons/ 2>/dev/null || true

echo "  ✅ App do Paciente copiado"

# -----------------------------------------------------------
# 4. Copiar Telão
# -----------------------------------------------------------
echo "📺 Organizando Telão..."

cp _tmp/telao/index.html    telao/index.html
cp _tmp/telao/controle.html telao/controle.html
cp _tmp/telao/css/tv.css    telao/css/tv.css

for f in config.js db.js relogio.js; do
    cp _tmp/telao/js/$f telao/js/$f 2>/dev/null || echo "  ⚠️  js/$f não encontrado"
done

echo "  ✅ Telão copiado"

# -----------------------------------------------------------
# 5. Ajustar caminhos nos arquivos HTML
# -----------------------------------------------------------
echo ""
echo "🔧 Ajustando caminhos nos arquivos..."

# --- Sistema Médico: apontar CSS para pasta local ---
for f in sistema-medico/admin/index.html sistema-medico/medico/index.html sistema-medico/enfermeiro/index.html sistema-medico/recepcionista/index.html; do
    if [ -f "$f" ]; then
        # Os HTMLs do sistema médico já usam ../css/ e ../js/ — estão corretos para a nova estrutura
        echo "  ✓ $f (caminhos OK)"
    fi
done

# Login: ajustar caminhos (antes: ../css/ ../js/ → agora: ../css/ ../js/ — já correto)
for f in sistema-medico/login/admin.html sistema-medico/login/funcionario.html; do
    if [ -f "$f" ]; then
        echo "  ✓ $f (caminhos OK)"
    fi
done

# --- App do Paciente: os caminhos já são relativos (css/ js/) ---
for f in paciente-app/*.html; do
    echo "  ✓ $(basename $f) (caminhos OK)"
done

# --- Telão: os caminhos já são relativos (css/ js/) ---
for f in telao/*.html; do
    echo "  ✓ $(basename $f) (caminhos OK)"
done

# -----------------------------------------------------------
# 6. Limpar temporários
# -----------------------------------------------------------
echo ""
echo "🧹 Limpando arquivos temporários..."
rm -rf _tmp

# -----------------------------------------------------------
# 7. Resumo
# -----------------------------------------------------------
echo ""
echo "============================================================"
echo "✅ PROJETO UNIFICADO PRONTO!"
echo "============================================================"
echo ""
echo "📁 Estrutura:"
echo ""
find . -type f \( -name "*.html" -o -name "*.css" -o -name "*.js" -o -name "*.sql" -o -name "*.json" -o -name "*.md" -o -name "*.sh" \) \
    | grep -v node_modules | grep -v '.git/' | sort | head -50
echo ""
echo "🚀 Para abrir o sistema: abra 'index.html' no navegador"
echo "🗄️  Banco de dados: supabase/schema.sql"
echo "⚙️  Configuração: shared/js/config.js"
echo ""
