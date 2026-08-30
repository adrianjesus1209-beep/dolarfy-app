import { DashboardView } from './components/dashboard.js';
import { CalculatorView } from './components/calculator.js';
import { AnalyticsView } from './components/analytics.js';
import { SettingsView } from './components/settings.js';
import { CountryModal } from './components/countryModal.js';
import { NotificationModal } from './components/notificationModal.js';
import { notificationService } from './notificationService.js';
import { mockEngine } from './mockData.js';

class App {
  constructor() {
    this.currentView = null;
    this.activeTab = 'dashboard'; // 'dashboard', 'calculator', 'analytics', 'settings'
    this.countryModal = new CountryModal(() => this.onCountryChanged());
    this.notificationModal = new NotificationModal();
    this.init();
  }

  init() {
    this.bindNavigation();
    this.bindCountrySelector();
    this.bindNotificationBell();
    this.updateHeaderCountryUI();
    this.updateHeaderBellUI();
    this.navigateTo(this.activeTab);

    // Suscribir a cambios globales en mockEngine
    mockEngine.subscribe((rates, updatedRateId, action) => {
      const currentCountry = mockEngine.getCurrentCountry();

      if (action === 'rates_refreshed' || action === 'country_change') {
        notificationService.checkDailyUpdate(currentCountry, rates);
        this.updateHeaderCountryUI();
        this.navigateTo(this.activeTab, true); // re-render view con tasas reales
      }
    });

    // Escuchar toggle de notificaciones
    document.addEventListener('dolarfy:notification_toggled', () => {
      this.updateHeaderBellUI();
    });
  }

  bindCountrySelector() {
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('#header-country-btn, .country-selector-trigger, #dash-country-badge');
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        this.countryModal.open();
      }
    });
  }

  bindNotificationBell() {
    document.addEventListener('click', (e) => {
      const bellBtn = e.target.closest('#header-bell-btn');
      if (bellBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.notificationModal.open();
      }
    });
  }

  updateHeaderCountryUI() {
    const current = mockEngine.getCurrentCountry();
    const flagImgEl = document.getElementById('header-country-flag-img');
    const codeEl = document.getElementById('header-country-code');

    if (flagImgEl && current.flagUrl) {
      flagImgEl.src = current.flagUrl;
      flagImgEl.alt = current.name;
    }
    if (codeEl) codeEl.textContent = current.id;
  }

  updateHeaderBellUI() {
    const isEnabled = notificationService.isEnabled();
    const dotEl = document.getElementById('header-bell-dot');
    if (dotEl) {
      dotEl.style.display = isEnabled ? 'block' : 'none';
    }
  }

  onCountryChanged() {
    this.updateHeaderCountryUI();
    this.navigateTo(this.activeTab, true);
  }

  bindNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = item.getAttribute('data-tab');
        if (tab && tab !== this.activeTab) {
          this.navigateTo(tab);
        }
      });
    });
  }

  navigateTo(tab, forceReload = false) {
    if (!forceReload && this.activeTab === tab && this.currentView) {
      return;
    }

    if (this.currentView && typeof this.currentView.destroy === 'function') {
      this.currentView.destroy();
    }

    this.activeTab = tab;
    this.updateBottomNavUI(tab);

    const mainContainer = 'app-view-container';
    
    switch (tab) {
      case 'dashboard':
        this.currentView = new DashboardView(mainContainer);
        break;
      case 'calculator':
        this.currentView = new CalculatorView(mainContainer);
        break;
      case 'analytics':
        this.currentView = new AnalyticsView(mainContainer);
        break;
      case 'settings':
        this.currentView = new SettingsView(mainContainer);
        break;
      default:
        this.currentView = new DashboardView(mainContainer);
    }

    this.currentView.render();
  }

  updateBottomNavUI(activeTab) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const tab = item.getAttribute('data-tab');
      const label = item.querySelector('span');

      if (tab === activeTab) {
        item.className = 'nav-item flex flex-col items-center justify-center text-cyan-400 font-bold transition-all relative';
        if (label) label.className = 'text-[11px] font-bold mt-1 text-cyan-400';
      } else {
        item.className = 'nav-item flex flex-col items-center justify-center text-gray-500 hover:text-gray-300 font-medium transition-all';
        if (label) label.className = 'text-[11px] font-medium mt-1 text-gray-500';
      }
    });
  }
}

// Inicializar la aplicación de forma segura si el DOM ya está listo
const startApp = () => {
  if (!window.dolarfyApp) {
    window.dolarfyApp = new App();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}
