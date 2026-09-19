# Dolarfy — Aplicación Web Financiera en Tiempo Real

Dolarfy es una aplicación Web (SPA) ligera, rápida y moderna para consultar cotizaciones del dólar y euro oficial (BCV) en tiempo real en Venezuela, monitor de mercado USDT (Binance P2P), calculadora conversora de divisas y análisis de tendencias.

---

## Características Principales

* **Dólar y Euro Oficial (BCV)**: Conexión directa en tiempo real con los datos oficiales del Banco Central de Venezuela.
* **USDT (Binance P2P)**: Consulta en vivo de las órdenes de compra del mercado Binance P2P C2C las 24 horas del día.
* **Sección de Pronóstico Oficial (Mañana)**:
  - La pestaña de pronóstico está siempre visible con la etiqueta del siguiente día hábil (por ejemplo, **Lunes** durante el fin de semana).
  - Permanece **deshabilitada** hasta que el Banco Central de Venezuela (BCV) publica oficialmente la tasa Fecha Valor para el siguiente día hábil.
  - Al confirmarse la publicación real vía API, se habilita automáticamente y muestra las cotizaciones oficiales de mañana (con punto de aviso si la publicación no se ha visto aún).
* **Calculadora Financiera**: Conversor de divisas instantáneo en tiempo real.
* **Arquitectura Web Pura**: Construida con HTML5, Vanilla CSS, Javascript ES modules e interfaz progresiva (PWA).

---

## Ejecución Local

1. **Servir la aplicación**:
   Puedes abrir `index.html` directamente en cualquier navegador moderno o servirla desde XAMPP / Apache / Nginx / Live Server.

2. **Generar el bundle JavaScript (opcional)**:
   ```bash
   npm run build
   ```

---

## Créditos y Licencia

Desarrollado y mantenido por Adrián Bello.
