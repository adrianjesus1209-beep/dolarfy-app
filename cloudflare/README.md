# ⚡ Disparador de Alta Precisión Dolarfy (Cloudflare Worker)

Este Worker gratuito de Cloudflare garantiza que el monitor del BCV se ejecute **al segundo exacto** cada tarde (de lunes a viernes entre las 4:15 PM y las 5:00 PM VET), eliminando cualquier retraso de colas.

---

### Opción 1: Despliegue con 1 Clic en la Web de Cloudflare (Recomendado, 3 minutos)

1. Entra a [dash.cloudflare.com](https://dash.cloudflare.com/) (crea cuenta gratis si no tienes).
2. En el menú izquierdo ve a **Workers y Pages** > **Crear aplicación** > **Crear Worker**.
3. Ponle de nombre `dolarfy-monitor` y dale a **Implementar**.
4. Dale a **Editar código**, borra lo que haya y pega el contenido de [`worker.js`](worker.js). Haz clic en **Guardar e implementar**.
5. Ve a **Configuración** > **Variables** > **Variables de entorno**:
   - Agrega `GITHUB_PAT` con un token personal de GitHub con permisos de `actions:write` o `repo`.
6. Ve a **Configuración** > **Desencadenadores (Triggers)** > **Agregar desencadenador cron**:
   - Expresión cron: `*/3 20-21 * * 1-5` (cada 3 minutos durante la tarde venezolana).
   - ¡Listo!

---

### Opción 2: Alternativa aún más fácil sin código (cron-job.org)

1. Crea una cuenta gratis en [cron-job.org](https://cron-job.org/).
2. Haz clic en **Create Cronjob**:
   - **Title**: Dolarfy BCV Monitor
   - **URL**: `https://api.github.com/repos/adrianjesus1209-beep/dolarfy-app/actions/workflows/bcv-monitor.yml/dispatches`
   - **Request Method**: `POST`
   - **Headers**:
     - `Authorization`: `Bearer <TU_GITHUB_TOKEN>`
     - `Accept`: `application/vnd.github.v3+json`
     - `User-Agent`: `CronJob-Dolarfy`
   - **Body**: `{"ref": "main"}`
   - **Schedule**: User-defined / Every 2 minutes between 16:20 and 17:15 (Monday to Friday, America/Caracas).
3. ¡Listo! Se ejecutará al segundo exacto cada tarde.
