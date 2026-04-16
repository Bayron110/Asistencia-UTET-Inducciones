const $ = id => document.getElementById(id);

const navItems = document.querySelectorAll('.nav-item');
const tabPanels = document.querySelectorAll('.tab-panel');
const topbarTitle = $('topbarTitle');
const clockDisplay = $('clockDisplay');

const hamburgerBtn = $('hamburgerBtn');
const sidebar = $('sidebar');
const sidebarOverlay = $('sidebarOverlay');

let relojInterval = null;

const tabTitles = {
  registros: 'Registros en tiempo real',
  sesion: 'Control de Sesión',
  excel: 'Carga de Excel',
  grupos: 'Grupos de Inducción'
};

function tickClock() {
  if (!clockDisplay) return;

  clockDisplay.textContent = new Date().toLocaleTimeString('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function iniciarReloj() {
  if (relojInterval) return;

  tickClock();
  relojInterval = setInterval(tickClock, 1000);
}

function detenerReloj() {
  if (!relojInterval) return;

  clearInterval(relojInterval);
  relojInterval = null;
}

function activarTab(tab) {
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tab);
  });

  tabPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });

  if (topbarTitle) {
    topbarTitle.textContent = tabTitles[tab] || 'Panel Admin';
  }

  if (window.innerWidth <= 640) {
    closeSidebar();
  }
}

function bindTabs() {
  navItems.forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const tab = item.dataset.tab;
      if (!tab) return;
      activarTab(tab);
    });
  });
}

function openSidebar() {
  if (sidebar) sidebar.classList.add('open');
  if (sidebarOverlay) sidebarOverlay.classList.add('visible');
}

function closeSidebar() {
  if (sidebar) sidebar.classList.remove('open');
  if (sidebarOverlay) sidebarOverlay.classList.remove('visible');
}

function toggleSidebar() {
  const abierto = sidebar?.classList.contains('open');
  if (abierto) closeSidebar();
  else openSidebar();
}

function bindSidebar() {
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', toggleSidebar);
  }

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', closeSidebar);
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth > 640) {
      closeSidebar();
    }
  });
}

function iniciarInterfaz() {
  bindTabs();
  bindSidebar();
  iniciarReloj();

  const tabActiva =
    document.querySelector('.nav-item.active')?.dataset.tab ||
    'registros';

  activarTab(tabActiva);
}

function destruirInterfaz() {
  detenerReloj();
  closeSidebar();
}

export {
  iniciarInterfaz,
  destruirInterfaz,
  activarTab,
  openSidebar,
  closeSidebar,
  iniciarReloj,
  detenerReloj
};