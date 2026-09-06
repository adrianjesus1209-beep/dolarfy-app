# Dolarfy 📱💵

**Dolarfy** es una aplicación móvil y web moderna diseñada para consultar cotizaciones del dólar en tiempo real en Venezuela, convertir divisas y calcular operaciones financieras de forma rápida, sencilla y precisa.

---

## 📲 Descargar la App (Android)

¡Ya puedes instalar Dolarfy en tu dispositivo Android! Descarga la última versión o consulta el historial completo de versiones:

🔥 **[Descargar Última Versión: Dolarfy APK v1.0.3 (Descarga Directa)](https://raw.githubusercontent.com/adrianjesus1209-beep/dolarfy-app/main/releases/dolarfy-v1.0.3.apk)**

---

## 📦 Historial de Versiones y Descargas APK

| Versión | Estado | Novedades y Cambios Principales | Enlace de Descarga Directa |
| :--- | :---: | :--- | :---: |
| **v1.0.3** | 🟢 **Última** | Selector de tasa en calculadora (**Hoy** vs **Predicción de siguiente día hábil**), sincronización limpia de assets nativos y depuración de caché. | [📥 Descargar v1.0.3](https://raw.githubusercontent.com/adrianjesus1209-beep/dolarfy-app/main/releases/dolarfy-v1.0.3.apk) |
| **v1.0.2** | ⚪ Estable | Corrección de tasa activa y pill Paralelo en Calculadora, reactividad a eventos en `mockEngine`. | [📥 Descargar v1.0.2](https://raw.githubusercontent.com/adrianjesus1209-beep/dolarfy-app/main/releases/dolarfy-v1.0.2.apk) |
| **v1.0.1** | ⚪ Estable | Depuración agresiva de caché local, tasa inicial BCV ajustada y mejor soporte de proxies CORS. | [📥 Descargar v1.0.1](https://raw.githubusercontent.com/adrianjesus1209-beep/dolarfy-app/main/releases/dolarfy-v1.0.1.apk) |
| **v1.0.0** | ⚪ Lanzamiento | Versión inicial de la aplicación empaquetada con Capacitor para Android. | [📥 Descargar v1.0.0](https://raw.githubusercontent.com/adrianjesus1209-beep/dolarfy-app/main/releases/dolarfy-v1.0.apk) |

---

### 📋 Pasos para instalar el APK en tu celular Android:
1. Haz clic en el enlace de la versión deseada para descargar el archivo `.apk` en tu celular.
2. Abre el archivo `.apk` descargado desde el panel de notificaciones o tu carpeta de *Descargas*.
3. Si Android te lo solicita, activa la casilla de **"Permitir instalar aplicaciones de fuentes desconocidas"** en la configuración de tu teléfono.
4. Presiona **Instalar** y abre la app. ¡Disfruta de Dolarfy!

---

## ✨ Características Principales

- **📊 Cotizaciones en Tiempo Real**: BCV Oficial, Dólar Paralelo, Euros y más.
- **📅 Tasa de Predicción del Próximo Día Hábil**: Consulta y calcula con la tasa oficial publicada por el BCV para el siguiente día laboral.
- **🧮 Calculadora y Conversor de Divisas**: Realiza conversiones entre distintas monedas locales e internacionales con selector dinámico de fecha/tasa.
- **📜 Historial de Operaciones**: Guarda y consulta tus operaciones recientes.
- **📈 Análisis y Tendencias**: Visualiza variaciones históricas de precios.
- **🌙 Modo Oscuro y Claro**: Interfaz visual adaptada para cualquier momento del día.

---

## 🛠️ Tecnologías Utilizadas

- **HTML5 & Vanilla CSS**: Diseño responsivo y moderno.
- **JavaScript (ES6+)**: Lógica dinámica y arquitectura de componentes.
- **Capacitor**: Adaptador nativo para empaquetado en Android.

---

## 💻 Desarrollo Local

Si deseas probar la aplicación web localmente en tu equipo:

1. Clona este repositorio:
   ```bash
   git clone https://github.com/adrianjesus1209-beep/dolarfy-app.git
   ```
2. Abre el archivo `index.html` en tu navegador web de preferencia o utilízalo a través de un servidor local (XAMPP, Live Server, etc.).

### Sincronización con Capacitor (Android)
Si realizas cambios en el código web y deseas sincronizarlo y compilarlo para Android:
```powershell
# 1. Copiar archivos web a www
Copy-Item -Path index.html, manifest.json, package.json, js, assets -Destination www -Recurse -Force

# 2. Sincronizar Capacitor
npx cap sync android

# 3. Compilar APK
cd android
.\gradlew.bat assembleDebug
```

---

## 📄 Licencia

Este proyecto está creado y mantenido por Adrian Bello.
