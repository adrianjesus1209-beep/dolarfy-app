class ThemeService {
  constructor() {
    this.STORAGE_KEY = 'dolarfy_theme';
    this.currentTheme = 'dark';
    try {
      if (typeof localStorage !== 'undefined') {
        this.currentTheme = localStorage.getItem(this.STORAGE_KEY) || 'dark';
      }
    } catch (e) {
      console.warn('Error leyendo tema guardado:', e);
    }
  }

  init() {
    this.applyTheme(this.currentTheme);
  }

  getTheme() {
    return this.currentTheme;
  }

  setTheme(theme) {
    if (theme !== 'dark' && theme !== 'light') return;
    this.currentTheme = theme;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY, theme);
      }
    } catch (e) {
      console.warn('Error guardando tema:', e);
    }
    this.applyTheme(theme);
    
    document.dispatchEvent(new CustomEvent('dolarfy:theme_changed', {
      detail: { theme }
    }));
  }

  toggleTheme() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme);
  }

  applyTheme(theme) {
    const htmlEl = document.documentElement;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');

    if (theme === 'light') {
      htmlEl.classList.remove('dark');
      htmlEl.classList.add('light');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', '#F4F6F9');
      }
    } else {
      htmlEl.classList.remove('light');
      htmlEl.classList.add('dark');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', '#0B0E14');
      }
    }
  }
}

export const themeService = new ThemeService();
