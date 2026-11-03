/**
 * Cloudflare Worker: Disparador de Alta Precisión para Dolarfy
 * Se ejecuta automáticamente al segundo exacto en la red global de Cloudflare (100% gratuito).
 * Despierta el monitor de GitHub Actions sin retrasos de cola.
 */

export default {
  // Cron Trigger: se ejecuta en la ventana del BCV de lunes a viernes
  async scheduled(event, env, ctx) {
    ctx.waitUntil(triggerGitHubMonitor(env));
  },

  // Endpoint HTTP para pruebas manuales desde el navegador
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/trigger' || url.pathname === '/check') {
      const res = await triggerGitHubMonitor(env);
      return new Response(JSON.stringify(res, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response('Dolarfy Cloudflare Worker activo. Usa /trigger para forzar.');
  }
};

async function triggerGitHubMonitor(env) {
  const token = env.GITHUB_PAT;
  if (!token) {
    return { error: 'GITHUB_PAT no configurado en Cloudflare' };
  }

  const url = 'https://api.github.com/repos/adrianjesus1209-beep/dolarfy-app/actions/workflows/bcv-monitor.yml/dispatches';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Cloudflare-Worker-Dolarfy'
    },
    body: JSON.stringify({ ref: 'main' })
  });

  return {
    status: response.status,
    ok: response.ok,
    timestamp: new Date().toISOString()
  };
}
