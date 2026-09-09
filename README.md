# Dolarfy

Dolarfy es una aplicacion movil y web para consultar cotizaciones del dolar en tiempo real en Venezuela, convertir divisas y calcular operaciones financieras.

---

## Descargas y Releases

La ultima version disponible de la aplicacion en formato APK para Android se encuentra lista para instalacion directa en la seccion de Releases oficiales de GitHub.

### Ultima Version

* **Version**: v1.1.0 (Latest)
* **Descarga Directa**: [dolarfy-v1.1.0.apk](https://github.com/adrianjesus1209-beep/dolarfy-app/releases/download/v1.1.0/dolarfy-v1.1.0.apk)
* **Releases Oficiales**: [Ver todas las versiones en GitHub Releases](https://github.com/adrianjesus1209-beep/dolarfy-app/releases)

---

## Historial de Versiones (Changelog)

### v1.1.0 (Latest)

#### Novedades
* Notificaciones locales reales de la tasa BCV (recordatorio diario 5:05 p.m. y alerta al publicar la tasa).
* Offline y funcionamiento sin conexion: assets locales (Tailwind, Lucide, ApexCharts, fuentes) y Service Worker.
* Fuentes de tasas corregidas: BCV directo, DolarApi oficial/paralelo, Euro BCV y USDT P2P, con etiquetas de origen (en vivo / cache / sin conexion).
* Cache de tasas regenerado (v11) y limpieza automatica de cache obsoleta.

#### Assets
* [dolarfy-v1.1.0.apk](https://github.com/adrianjesus1209-beep/dolarfy-app/releases/download/v1.1.0/dolarfy-v1.1.0.apk)

---

### v1.0.3

#### Novedades
* Selector de fecha en la calculadora (Hoy vs Prediccion de siguiente dia habil).
* Sincronizacion limpia de assets nativos compilados con Capacitor.
* Limpieza automatica de cache al actualizar o instalar la app.

#### Assets
* [dolarfy-v1.0.3.apk](https://github.com/adrianjesus1209-beep/dolarfy-app/releases/download/v1.0.3/dolarfy-v1.0.3.apk)

---

### v1.0.2

#### Correcciones
* Corregida la seleccion de tasa activa y pill Paralelo en la Calculadora.
* Reactividad ante eventos de actualizacion en mockEngine.

#### Assets
* [dolarfy-v1.0.2.apk](https://github.com/adrianjesus1209-beep/dolarfy-app/releases/download/v1.0.2/dolarfy-v1.0.2.apk)

---

### v1.0.1

#### Mejoras
* Depuracion agresiva de cache local en almacenamiento.
* Ajuste de tasa inicial por defecto BCV a 813.74.
* Mejora en el soporte de proxies CORS para peticiones bancarias.

#### Assets
* [dolarfy-v1.0.1.apk](https://github.com/adrianjesus1209-beep/dolarfy-app/releases/download/v1.0.1/dolarfy-v1.0.1.apk)

---

### v1.0.0

#### Lanzamiento Inicial
* Primera version de Dolarfy compilada para Android mediante Capacitor.

#### Assets
* [dolarfy-v1.0.apk](https://github.com/adrianjesus1209-beep/dolarfy-app/releases/download/v1.0.0/dolarfy-v1.0.apk)

---

## Instrucciones de Instalacion

1. Descarga el archivo `.apk` correspondiente a la version deseada desde la seccion Releases.
2. Abre el archivo descargado en tu dispositivo Android.
3. Si el sistema lo requiere, habilita la opcion "Instalar aplicaciones de fuentes desconocidas".
4. Presiona "Instalar" para completar el proceso.

---

## Caracteristicas Principales

* **Cotizaciones en Tiempo Real**: BCV Oficial, Dolar Paralelo, Euros y otras divisas.
* **Tasa de Prediccion**: Consulta y realiza calculos con la tasa oficial publicada para el proximo dia habil.
* **Calculadora y Conversor**: Conversiones entre distintas monedas locales e internacionales.
* **Historial de Operaciones**: Guardado y consulta de calculos recientes.
* **Analisis y Tendencias**: Graficos e historico de variaciones.
* **Modo Oscuro y Claro**: Interfaz adaptable.

---

## Tecnologias Utilizadas

* HTML5 & Vanilla CSS
* JavaScript (ES6+)
* Capacitor (Android)

---

## Desarrollo Local

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/adrianjesus1209-beep/dolarfy-app.git
   ```
2. Abrir `index.html` en el navegador o mediante un servidor local.

### Sincronizacion con Capacitor (Android)

```powershell
Copy-Item -Path index.html, manifest.json, sw.js, package.json, js, assets -Destination www -Recurse -Force
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

---

## Licencia

Proyecto creado por Adrian Bello.
