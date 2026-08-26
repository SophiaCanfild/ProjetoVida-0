/* ================================================
   VIDA+ - SISTEMA MÉDICO
   Configuração — usa o banco compartilhado (DB)
   ================================================ */

// ============================================
// COMPATIBILIDADE: Funções que os HTMLs antigos usam
// Agora lêem do banco compartilhado (DB)
// ============================================

// Verificar login (usado pelas telas de login)
function verificarLogin(cpf, senha) {
    return DB.verificarLogin(cpf, senha);
}

// Verificar se é admin
function isAdmin(cpf) {
    const usuario = DB.getUsuarioPorCpf(cpf);
    return usuario && usuario.tipo === 'admin';
}

// Obter usuário por CPF
function getUsuario(cpf) {
    return DB.getUsuarioPorCpf(cpf);
}

// Obter paciente por ID
function getPaciente(id) {
    return DB.getPacientePorId(id);
}

// Obter triagem por paciente ID (busca nas consultas)
function getTriagemPaciente(pacienteId) {
    const consultas = DB.getConsultas().filter(c => c.paciente_id === pacienteId && c.triagem);
    return consultas.length ? consultas[0].triagem : null;
}

// Obter consultas por paciente ID
function getConsultasPaciente(pacienteId) {
    return DB.getConsultas().filter(c => c.paciente_id === pacienteId);
}

// Formatar data
function formatarData(data) {
    if (!data) return "-";
    const partes = data.split("-");
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return data;
}

// Formatar data e hora
function formatarDataHora(data) {
    if (!data) return "-";
    return data;
}

// Obter iniciais do nome
function getInitials(nome) {
    if (!nome) return "?";
    return nome.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
}

// Obter nome do paciente por ID
function getNomePaciente(id) {
    const paciente = DB.getPacientePorId(id);
    return paciente ? paciente.nome : "Paciente não encontrado";
}

// Obter classificação visual
function getClassificacaoBadge(classificacao) {
    const badges = {
        vermelho: '<span class="badge badge-vermelho">Emergência</span>',
        laranja: '<span class="badge badge-laranja">Muito Urgente</span>',
        amarelo: '<span class="badge badge-amarelo">Urgente</span>',
        verde: '<span class="badge badge-verde">Pouco Urgente</span>',
        azul: '<span class="badge badge-azul">Não Urgente</span>'
    };
    return badges[classificacao] || '<span class="badge badge-secondary">-</span>';
}

// Calcular IMC
function calcularIMC(peso, altura) {
    if (!peso || !altura) return "-";
    const alturaM = altura / 100;
    const imc = peso / (alturaM * alturaM);
    return imc.toFixed(1);
}

// Mostrar mensagem toast
function mostrarToast(mensagem, tipo = "success") {
    const existente = document.querySelector('.toast-container');
    if (existente) existente.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-container animate-slideUp';
    toast.style.cssText = 'position:fixed;top:80px;right:24px;z-index:9999;';
    
    const icones = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
    const cores = {
        success: { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
        error: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
        warning: { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
        info: { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' }
    };
    
    const cor = cores[tipo] || cores.success;
    
    toast.innerHTML = `
        <div class="alert alert-${tipo === 'success' ? 'success' : tipo === 'error' ? 'danger' : tipo}" 
             style="background:${cor.bg};color:${cor.color};border:1px solid ${cor.border};min-width:300px;box-shadow:0 10px 25px rgba(0,0,0,0.15);padding:14px;border-radius:10px;display:flex;align-items:center;gap:10px;">
            <i class="fas fa-${icones[tipo] || icones.success}"></i>
            <span>${mensagem}</span>
        </div>`;
    
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// Salvar usuário logado na sessão
function salvarSessao(usuario) {
    sessionStorage.setItem('usuarioLogado', JSON.stringify(usuario));
}

// Obter usuário logado
function getUsuarioLogado() {
    const data = sessionStorage.getItem('usuarioLogado');
    return data ? JSON.parse(data) : null;
}

// Verificar se está logado
function isLogged() {
    return sessionStorage.getItem('usuarioLogado') !== null;
}

// Fazer logout — volta para o portal principal
function logout() {
    sessionStorage.removeItem('usuarioLogado');
    window.location.href = '../../index.html';
}

// Verificar acesso e redirecionar
function verificarAcesso(tipoPermitido) {
    const usuario = getUsuarioLogado();
    
    if (!usuario) {
        window.location.href = '../login/funcionario.html';
        return false;
    }
    
    if (tipoPermitido !== 'all' && usuario.tipo !== tipoPermitido) {
        mostrarToast('Você não tem permissão para acessar esta área', 'error');
        window.location.href = '../../index.html';
        return false;
    }
    
    return true;
}

// Atualizar info do usuário na sidebar
function atualizarInfoUsuario() {
    const usuario = getUsuarioLogado();
    if (!usuario) return;
    
    const nameEl = document.getElementById('userName');
    const roleEl = document.getElementById('userRole');
    const avatarEl = document.getElementById('userAvatar');
    
    if (nameEl) nameEl.textContent = usuario.nome;
    if (roleEl) roleEl.textContent = usuario.cargo;
    if (avatarEl) avatarEl.textContent = getInitials(usuario.nome);
}

// Inicializar dados demo ao carregar
DB.seedDemo();
