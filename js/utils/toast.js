export function showToast(message, title = 'Dolarfy', icon = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-5 left-1/2 -translate-x-1/2 z-[200] w-full max-w-xs space-y-2 pointer-events-none px-4';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto bg-[#111622]/95 border border-cyan-500/30 text-white rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl flex items-start space-x-3 animate-fade-in transition-all duration-300 transform scale-100';

  toast.innerHTML = `
    <div class="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0 mt-0.5">
      <i data-lucide="${icon}" class="w-4 h-4"></i>
    </div>
    <div class="flex-1 min-w-0 pr-1">
      <h4 class="text-xs font-extrabold text-white">${title}</h4>
      <p class="text-[11px] text-gray-300 font-medium leading-snug mt-0.5">${message.replace(/\n/g, '<br>')}</p>
    </div>
    <button type="button" class="text-gray-500 hover:text-white p-1 text-xs shrink-0 cursor-pointer">
      <i data-lucide="x" class="w-3.5 h-3.5"></i>
    </button>
  `;

  const closeBtn = toast.querySelector('button');
  const removeToast = () => {
    toast.classList.add('opacity-0', 'scale-95', '-translate-y-2');
    setTimeout(() => toast.remove(), 300);
  };

  closeBtn?.addEventListener('click', removeToast);
  container.appendChild(toast);

  if (window.lucide) window.lucide.createIcons();

  setTimeout(removeToast, 4000);
}

export function showDialogModal({ title, body, icon = 'info' }) {
  let container = document.getElementById('dialog-modal-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'dialog-modal-container';
    document.body.appendChild(container);
  }

  container.innerHTML = `
    <div id="dialog-backdrop" class="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <div class="w-full max-w-sm bg-[#111622] border border-cyan-500/30 rounded-3xl shadow-2xl p-5 space-y-4 animate-scale-up">
        
        <div class="flex items-center space-x-3">
          <div class="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
            <i data-lucide="${icon}" class="w-5 h-5"></i>
          </div>
          <div>
            <h3 class="text-base font-extrabold text-white">${title}</h3>
          </div>
        </div>

        <div class="text-xs text-gray-300 leading-relaxed bg-black/40 p-3.5 rounded-2xl border border-white/5 space-y-2 max-h-60 overflow-y-auto">
          ${body.replace(/\n/g, '<br>')}
        </div>

        <button id="close-dialog-btn" type="button" class="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs shadow-md transition-all active:scale-95 cursor-pointer">
          Entendido
        </button>

      </div>
    </div>
  `;

  if (window.lucide) window.lucide.createIcons();

  const backdrop = document.getElementById('dialog-backdrop');
  const closeBtn = document.getElementById('close-dialog-btn');

  const close = () => { container.innerHTML = ''; };
  backdrop?.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  closeBtn?.addEventListener('click', close);
}
