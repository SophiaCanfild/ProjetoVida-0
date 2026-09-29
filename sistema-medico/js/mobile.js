/* ============================================================
   VIDA+ - SISTEMA MÉDICO — Comportamento mobile
   ------------------------------------------------------------
   • Injeta o botão de menu (hambúrguer) na topbar
   • Abre/fecha a sidebar como gaveta (drawer) no celular
   • Fecha ao tocar no fundo escuro, no item do menu ou no ESC
   • Não faz nada em telas grandes (desktop continua igual)
   ============================================================ */

(function () {
  'use strict';

  function init() {
    var topbarLeft = document.querySelector('.topbar-left');
    if (!topbarLeft || document.querySelector('.menu-toggle')) return;

    /* Botão hambúrguer, antes do título da página */
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-toggle';
    btn.setAttribute('aria-label', 'Abrir menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<i class="fas fa-bars"></i>';
    topbarLeft.insertBefore(btn, topbarLeft.firstChild);

    /* Fundo escuro atrás da gaveta */
    var scrim = document.createElement('div');
    scrim.className = 'scrim';
    document.body.appendChild(scrim);

    function aberto() { return document.body.classList.contains('menu-aberto'); }

    function setAberto(v) {
      document.body.classList.toggle('menu-aberto', v);
      btn.setAttribute('aria-expanded', String(v));
      btn.setAttribute('aria-label', v ? 'Fechar menu' : 'Abrir menu');
      btn.innerHTML = v ? '<i class="fas fa-xmark"></i>' : '<i class="fas fa-bars"></i>';
    }

    btn.addEventListener('click', function () { setAberto(!aberto()); });
    scrim.addEventListener('click', function () { setAberto(false); });

    /* Fecha depois de escolher uma opção do menu */
    var itens = document.querySelectorAll('.sidebar .menu-item');
    for (var i = 0; i < itens.length; i++) {
      itens[i].addEventListener('click', function () { setAberto(false); });
    }

    /* Tecla ESC fecha */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && aberto()) setAberto(false);
    });

    /* Se a janela crescer (girar tablet / redimensionar), limpa o estado */
    var mq = window.matchMedia('(min-width: 769px)');
    function onMq(e) { if (e.matches) setAberto(false); }
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
