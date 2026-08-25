import { DashboardView } from './components/dashboard.js';
import { CalculatorView } from './components/calculator.js';
import { AnalyticsView } from './components/analytics.js';

class App {
  constructor() {
    this.currentView = null;
    this.activeTab = 'dashboard'; // 'dashboard', 'calculator', 'analytics'
    this.init();
  }

  init() {
    this.bindNavigation();
    this.navigateTo(this.activeTab);
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

  navigateTo(tab) {
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
      default:
        this.currentView = new DashboardView(mainContainer);
    }

    this.currentView.render();
  }

  updateBottomNavUI(activeTab) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const tab = item.getAttribute('data-tab');
      const icon = item.querySelector('i');
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

// Inicializar la aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', () => {
  window.dolarfyApp = new App();
});
