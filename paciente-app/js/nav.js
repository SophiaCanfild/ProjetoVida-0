/* ============================================================
   VIDA+ PACIENTE — Navegação compartilhada
   ------------------------------------------------------------
   • Logo (topbar) → volta para a home dinâmica
   • Menu inferior (Início/Histórico/Exames/Agendamentos/Perfil)
   • Botão de sair → confirma e volta para a tela inicial
   • Badge do sino (notificações não lidas)
   ============================================================ */

const Nav = {

  /* Vai para a home certa conforme o estado de login:
     - deslogado  → portal principal (../index.html)
     - logado     → fila (se tiver atendimento ativo)
                  → home (se não tiver) */
  irParaHome() {
    const cpf = DB.getSessao();
    if (!cpf) { location.href = '../index.html'; return; }
    DB.getMinhaFila(cpf)
      .then(r => { location.href = r.ativa ? 'fila.html' : 'index.html'; })
      .catch(() => { location.href = 'index.html'; });
  },

  /* Sair da conta com confirmação → volta para o portal */
  sair() {
    UI.modalConfirmar({
      titulo: 'Sair da conta?',
      texto: 'Você voltará para o portal principal.',
      botao: 'Sair', perigo: true,
      onConfirmar: () => {
        DB.clearSessao();
        localStorage.removeItem('vidamais_ultimo_status');
        location.href = '../index.html';
      }
    });
  },

  /* Atualiza o contador de notificações não lidas no sino */
  atualizarBadge() {
    const badge = document.getElementById('badge-notif');
    if (!badge) return;
    const cpf = DB.getSessao();
    if (!cpf) { badge.classList.add('escondido'); return; }
    DB.naoLidas(cpf).then(n => {
      if (n > 0) {
        badge.textContent = n > 9 ? '9+' : n;
        badge.classList.remove('escondido');
      } else {
        badge.classList.add('escondido');
      }
    }).catch(() => {});
  },

  /* Liga os controles de navegação da página atual */
  iniciar() {
    // Logo (topbar) → home
    const logo = document.querySelector('.topbar .logo');
    if (logo) {
      logo.style.cursor = 'pointer';
      logo.onclick = () => Nav.irParaHome();
    }

    // Sino (topbar) → central de notificações
    const sino = document.getElementById('btn-notif');
    if (sino) sino.onclick = () => location.href = 'notificacoes.html';

    // Botão sair (topbar)
    const sair = document.getElementById('btn-sair');
    if (sair) sair.onclick = () => Nav.sair();

    // Item "Início" do menu inferior → home dinâmica
    document.querySelectorAll('.bottomnav a[data-ir-home]').forEach(a => {
      a.onclick = (e) => { e.preventDefault(); Nav.irParaHome(); };
    });

    // Badge do sino
    Nav.atualizarBadge();
    setInterval(Nav.atualizarBadge, 20000);
  }
};

/* Liga os controles assim que o DOM estiver pronto
   (funciona mesmo se o script carregar depois do DOM pronto) */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', Nav.iniciar);
} else {
  Nav.iniciar();
}

/* ============================================================
   PWA — Service Worker + botão "Instalar app"
   ------------------------------------------------------------
   • Registra o sw.js, que guarda as telas no aparelho (o app
     chega a abrir sem internet mostrando o último estado).
   • No Android/Chrome aparece uma pílula "Instalar app" quando
     o navegador oferece a instalação.
   • No iPhone/iPad (Safari) é manual: Compartilhar →
     "Adicionar à Tela de Início".
   Só ativa em contexto seguro (https ou localhost).
   ============================================================ */
(function () {
  var seguro = location.protocol === 'https:' ||
               location.hostname === 'localhost' ||
               location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || !seguro) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function (e) {
      console.warn('[Vida+] service worker não registrado:', e && e.message);
    });
  });

  var promptInstalacao = null;

  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault(); /* segura o evento para mostrar nosso próprio botão */
    promptInstalacao = ev;
    mostrarBotao();
  });

  function mostrarBotao() {
    if (document.querySelector('.pwa-instalar')) return;
    var jaApp = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
                window.navigator.standalone === true;
    if (jaApp) return; /* já aberto como app instalado: não incomoda */

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pwa-instalar';
    btn.innerHTML = '\u{1F4F2} Instalar app <span class="pwa-fechar" title="Dispensar">\u00D7</span>';
    btn.addEventListener('click', function (ev) {
      if (ev.target && ev.target.classList.contains('pwa-fechar')) {
        btn.remove();
        return;
      }
      if (!promptInstalacao) { btn.remove(); return; }
      promptInstalacao.prompt();
      promptInstalacao.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') btn.remove();
        promptInstalacao = null;
      });
    });
    document.body.appendChild(btn);
  }

  /* iOS não dispara beforeinstallprompt — só uma dica no console */
  var ehIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (ehIOS) {
    window.addEventListener('load', function () {
      console.info('[Vida+] iPhone/iPad: use Compartilhar \u2192 "Adicionar \u00E0 Tela de In\u00EDcio" para instalar o app.');
    });
  }
})();
