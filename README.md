# Dolarfy — Tasas Financieras en Tiempo Real

Dolarfy es una aplicación móvil y web nativa para consultar cotizaciones del dólar y euro oficial (BCV) en tiempo real en Venezuela, monitor de mercado USDT (Binance P2P), calculadora conversora de divisas y análisis de tendencias.

---

## Descarga Oficial

La versión oficial de la aplicación para dispositivos Android se encuentra disponible para instalación directa en GitHub Releases.

### Versión Actual

* **Versión**: `v1.0.0`
* **Descarga Directa (APK)**: [Dolarfy-v1.0.0.apk](https://github.com/adrianjesus1209-beep/dolarfy-app/releases/download/v1.0.0/Dolarfy-v1.0.0.apk)
* **Releases en GitHub**: [Ver entregas en GitHub Releases](https://github.com/adrianjesus1209-beep/dolarfy-app/releases)

---

## Características Principales

* **Dólar y Euro Oficial (BCV)**: Conexión directa con los datos en tiempo real del Banco Central de Venezuela.
* **USDT (Binance P2P)**: Consulta en vivo de las órdenes de compra/venta del mercado Binance P2P C2C las 24 horas del día.
* **Calendario BCV y Pronóstico**: 
  - **Fines de semana**: La tasa oficial del viernes se mantiene estática en *"Hoy"*, mientras la pestaña de la Fecha Valor (*"Lunes"*) muestra el valor oficial publicado para el inicio de semana.
  - **Mercado USDT**: Cotización continua en tiempo real 24/7 sin cierre bancario.
* **Calculadora Financiera**: Conversor de divisas instantáneo con selector de fecha (*Hoy* vs *Pronóstico*).
* **Tendencias e Historial**: Gráficos de evolución histórica y registro de conversiones pasadas.
* **Cero Datos Falsos**: Sin cifras simuladas ni parches estáticos; estado inicial de carga limpio con guiones (`— — —`).

---

## Desarrollo y Compilación Local

1. **Clonar el repositorio**:
   ```bash
   git clone https://github.com/adrianjesus1209-beep/dolarfy-app.git
   ```

2. **Generar el bundle JavaScript**:
   ```bash
   node scripts/bundle.js
   ```

3. **Compilar el archivo APK para Android**:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-apk.ps1
   ```

---

## Créditos y Licencia

Desarrollado y mantenido por Adrián Bello.
