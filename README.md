# Itinerario Brasil 2026

Aplicación web progresiva (PWA) para planificar y consultar el viaje a Brasil: **São Paulo · Rio de Janeiro · Foz do Iguaçu**, del 8 al 20 de julio de 2026.

**URL de producción:** https://ales-birthday.pages.dev

---

## Características

### Secciones de contenido

| Sección | Descripción | Ciudades |
|---|---|---|
| ✈️ Vuelos | 3 segmentos con estado en tiempo real | — |
| 🏨 Alojamientos | 4 hospedajes (08–20 jul) | SP · RJ · Foz |
| 🗺️ Actividades | +60 actividades curadas | SP · RJ |
| 🏛️ Museos | 20 museos con horarios y precios | SP · RJ |
| 🛍️ Shoppings | 21 shoppings con horarios | SP · RJ |
| 🍽️ Comidas | 151 locales (rating ≥ 4.4) | SP · RJ |
| ☁️ Clima | Pronóstico en tiempo real (7 días) | Posadas · Foz · SP · RJ |
| 💬 Frases | 31 frases en portugués (saludos, restaurante, pagos) | — |
| 📍 Mapa | Mapa interactivo con POIs filtrables | SP · RJ |
| 💱 Conversor | R$ · USD · ARS con cotización en vivo + OCR | — |

### Comidas — desglose por categoría

| Categoría | Cantidad |
|---|---|
| Restaurante | 46 |
| Bar | 47 |
| Café | 48 |
| Heladería | 10 |
| **Total** | **151** |

Todos los locales cumplen **rating ≥ 4.4** y están validados contra listas de referencia (Michelin, 50 Best, etc.).

### Funcionalidades interactivas

- **"Abierto ahora"** — filtra en tiempo real lo que está abierto en el momento actual, en todas las secciones de listado
- **Búsqueda por texto** — filtra por nombre, tipo, zona o nota en actividades, museos, shoppings y comidas
- **Filtro por categoría** — selector multiselección para comidas y filtro por ciudad en actividades
- **Estado de vuelos** — consulta en vivo del estado de cada vuelo vía AeroDataBox (actualización cada 5 min, cacheado)
- **Cotización BRL** — tipo de cambio R$ · ARS y R$ · USD en tiempo real desde Cocos (cache 5 min)
- **OCR de precios** — escáner de cámara que reconoce precios en reales con IA (Cloudflare Workers AI / Llama 3.2 Vision)
- **Clima en tiempo real** — Open-Meteo API, temperatura actual, pronóstico 7 días, íconos por código WMO
- **Mapa interactivo** — Leaflet.js con capas por tipo (hoteles, restaurantes, museos, actividades), filtrable
- **Navegación por swipe** — deslizar horizontalmente cambia de sección; deslizar hacia abajo vuelve al dashboard
- **Modo oscuro** — toggle con persistencia en localStorage, adaptado por color de acento
- **Tweaks panel** — modo oscuro, color de acento personalizable (5 opciones), toggle de hero

---

## Arquitectura

```
ales-birthday.pages.dev          itinerario-proxy.*.workers.dev
┌─────────────────────────┐      ┌──────────────────────────────┐
│  Cloudflare Pages       │      │  Cloudflare Worker           │
│                         │      │                              │
│  main.html ─────────────┼─────▶│  POST /generate-otp          │
│  (React 18 SPA, ~320KB) │      │  POST /verify-otp            │
│                         │      │  GET  /flight/:num/:date     │
│  vendor/                │      │  GET  /brl-rate              │
│    react.min.js         │      │  POST /ocr-price             │
│    react-dom.min.js     │      │                              │
│                         │      │  Workers AI binding          │
│  sw.js (cache-first)    │      │  (Llama 3.2 Vision / LLaVA) │
└─────────────────────────┘      └──────────────────────────────┘
```

### Decisiones de diseño

| Decisión | Motivo |
|---|---|
| **Single HTML file** | Sin build step ni bundler; todo el código, estilos y datos en `main.html` |
| **JSX-less React** | Usa `React.createElement` directamente; editable sin transpilador |
| **React UMD self-hosted** | Elimina dependencia de CDN en runtime; archivos en `vendor/` con SRI |
| **Cloudflare Worker** | Proxy para ocultar API keys y agregar CORS, caché y rate limiting |
| **PWA** | Instalable en iOS/Android; soporte offline vía service worker |

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| **UI** | React 18.3.1 (UMD, sin JSX, sin build) |
| **Mapa** | Leaflet.js (unpkg CDN) |
| **Clima** | [Open-Meteo API](https://open-meteo.com/) (gratuita, sin key) |
| **Vuelos** | AeroDataBox via RapidAPI (proxy Worker) |
| **Tipos de cambio** | Comparapix / Cocos Capital (proxy Worker) |
| **OCR** | Cloudflare Workers AI — Llama 3.2 11B Vision (fallback: LLaVA 1.5) |
| **Email OTP** | EmailJS API (proxy Worker) |
| **Hosting** | Cloudflare Pages |
| **API proxy** | Cloudflare Worker (itinerario-proxy) |
| **Tests** | Vitest (Node.js, sin DOM) |
| **Tipografías** | Nunito (sans) · Fraunces (serif) · Space Mono (mono) — Google Fonts |

---

## Estructura del proyecto

```
itinerario_2026/
│
├── main.html               # SPA completa — UI, datos y lógica (~320 KB)
├── sw.js                   # Service worker — cache-first para assets estáticos
├── manifest.json           # PWA manifest (nombre, íconos, colores)
├── _headers                # CSP, X-Frame-Options, Referrer-Policy (Cloudflare Pages)
├── _redirects              # / → /main (SPA routing)
├── 404.html                # Página de error personalizada
│
├── icon-180.png            # Ícono PWA (180×180)
├── icon-192.png            # Ícono PWA (192×192)
├── icon-512.png            # Ícono PWA (512×512)
│
├── vendor/
│   ├── react.min.js        # React 18.3.1 UMD (self-hosted, con SRI)
│   └── react-dom.min.js    # ReactDOM 18.3.1 UMD (self-hosted, con SRI)
│
└── worker/                 # Cloudflare Worker — API proxy + auth
    ├── index.js            # Entry point con todos los endpoints
    ├── lib.js              # Helpers compartidos
    ├── frontend-utils.js   # Funciones puras (mirror de main.html, para testing)
    ├── wrangler.toml       # Config de Cloudflare Worker + AI binding
    ├── data.test.js        # Tests de integridad de datos + estructura JS
    ├── frontend.test.js    # Tests de utilidades frontend (filterAndSort, etc.)
    ├── routes.test.js      # Tests de endpoints del Worker
    └── index.test.js       # Tests adicionales del Worker
```

---

## Cloudflare Worker — API

**Base URL:** `https://itinerario-proxy.pallottagonzalosebastian-pos.workers.dev`

Todos los endpoints requieren `Origin: https://ales-birthday.pages.dev`.

### `POST /generate-otp`

Genera un OTP de 6 dígitos, lo envía por email (EmailJS) y devuelve un token HMAC-SHA256 firmado.

```json
// Request
{ "to_email": "user@example.com" }

// Response 200
{ "ok": true, "token": "<base64-payload>.<hmac-sig>" }
```

- OTP válido por **10 minutos**
- Solo acepta los emails en `ALLOWED_EMAILS`

### `POST /verify-otp`

Verifica el código ingresado contra el token firmado.

```json
// Request
{ "to_email": "user@example.com", "code": "123456", "token": "..." }

// Response
{ "ok": true }
{ "ok": false, "reason": "expired" | "wrong" | "invalid" | "rate_limited" }
```

- **Rate limit:** 10 intentos / 15 minutos por IP (429 si excede)
- Soporta `MAGIC_OTP` de emergencia (variable de entorno, bypasea token)

### `GET /flight/:number/:date`

Proxy hacia AeroDataBox (RapidAPI). Retorna estado del vuelo en tiempo real.

```
GET /flight/LA803/2026-07-09
```

- Validación de formato: número `[A-Z0-9]{2}\d{1,4}`, fecha `YYYY-MM-DD`
- Cache: `public, max-age=300` (5 minutos)

### `GET /brl-rate`

Tipo de cambio BRL/ARS y BRL/USD desde Cocos Capital vía Comparapix.

```json
{ "ok": true, "ars": 145.3, "usd": 0.18 }
```

- Cache: `public, max-age=300` (5 minutos)
- Valida que `BRLARS > 10` para detectar respuestas inválidas

### `POST /ocr-price`

Extrae un precio en reales de una imagen JPEG (base64) usando Cloudflare Workers AI.

```json
// Request
{ "image": "data:image/jpeg;base64,..." }

// Response
{ "ok": true, "price": 149.90, "raw": "149,90" }
```

- Modelo primario: Llama 3.2 11B Vision
- Fallback: LLaVA 1.5 7B
- Parsea separadores brasileños (`.` miles, `,` decimal)

---

## Seguridad

| Medida | Detalle |
|---|---|
| **Origin guard** | Worker rechaza (403) cualquier origen distinto a `ales-birthday.pages.dev` |
| **OTP rate limiting** | 10 intentos / 15 min por IP en `/verify-otp` |
| **HMAC-SHA256** | Token firmado server-side; el cliente no puede forjar ni alterar el OTP |
| **Allowlist de emails** | Solo 2 emails autorizados en `ALLOWED_EMAILS` |
| **CSP** | `Content-Security-Policy` via `_headers`; `default-src 'self'`, `worker-src 'self'` |
| **SRI** | `integrity="sha384-..."` en ambos vendor scripts (React y ReactDOM) |
| **X-Frame-Options** | `DENY` — previene clickjacking |
| **Referrer-Policy** | `strict-origin-when-cross-origin` |

---

## PWA y Offline

El service worker (`sw.js`) implementa dos estrategias:

| Tipo de request | Estrategia |
|---|---|
| Recursos estáticos (vendor, íconos, SW) | **Cache-first** → red como fallback |
| Navegación HTML y APIs externas | **Network-first** → cache como fallback |

- **Instalable** en iOS (Add to Home Screen) y Android (instalación nativa)
- **Cache name:** `itinerario-v2` (bumpar para forzar actualización)
- En install: `skipWaiting()` → activa inmediatamente sin esperar cierre de tabs
- En activate: `clients.claim()` → toma control sin necesitar recarga

---

## Tests

```bash
cd worker && npm test
```

**256 tests** distribuidos en 4 archivos:

| Archivo | Qué testea |
|---|---|
| `data.test.js` | Integridad de FLIGHTS / STAYS / ACTIVITIES / MUSEUMS / SHOPPINGS / MEALS; sintaxis JS de `main.html`; estructura CODE-07 (filterAndSort + OpenNowBtn); markup A11Y-01 |
| `frontend.test.js` | `filterAndSort`, `matchesSearch`, `momentToHours`, `isOpenNow` — edge cases y composición |
| `routes.test.js` | Todos los endpoints del Worker: auth, rate limiting, validaciones, proxies |
| `index.test.js` | Tests adicionales del Worker |

### Invariantes verificados en CI

- Todos los vuelos en julio 2026
- Todos los locales de comida con rating ≥ 4.4
- Categorías de comida dentro del set permitido (`Restaurante | Bar | Café | Heladería`)
- Momentos de comida dentro del set válido (`Mañana | Almuerzo | Brunch | Tarde | Cena | Noche`)
- Instagram handles sin prefijo `@`
- URLs de alojamientos con `https://`
- IDs únicos por dataset
- `main.html` sin errores de sintaxis JS (detecta imbalance de paréntesis antes del deploy)
- `ul` en SectionList tiene `role="list"` (A11Y VoiceOver iOS)
- `OpenNowBtn` aparece antes de `visibleCities.map` en las 4 secciones con filtro

---

## Despliegue

### Cloudflare Pages (frontend)

Push a `main` → Cloudflare Pages despliega automáticamente vía GitHub integration.

```
URL producción: https://ales-birthday.pages.dev
Ruta de entrada: / → /main (302 via _redirects)
```

### Cloudflare Worker (API proxy)

```bash
cd worker
npx wrangler deploy
```

**Variables de entorno** requeridas (configurar en Cloudflare Dashboard → Worker → Settings):

| Variable | Descripción |
|---|---|
| `OTP_SECRET` | Secreto para firmar/verificar tokens HMAC |
| `EMAILJS_SVC_ID` | Service ID de EmailJS |
| `EMAILJS_TPL_ID` | Template ID de EmailJS |
| `EMAILJS_PUB_KEY` | Public key de EmailJS |
| `EMAILJS_PRIV_KEY` | Private key de EmailJS |
| `RAPIDAPI_KEY` | Key de RapidAPI (AeroDataBox) |
| `MAGIC_OTP` | (Opcional) código de emergencia para bypasear email |

El binding `[ai]` en `wrangler.toml` activa **Cloudflare Workers AI** para el endpoint `/ocr-price`.

---

## Desarrollo local

### Frontend

No hay build step. Editar `main.html` directamente y abrir en el browser, o deployar a Cloudflare Pages para testing en dispositivos móviles.

### Worker

```bash
cd worker
npm install
npm test          # correr suite completa
npm run test:watch  # modo watch
npx wrangler dev  # servidor local en http://localhost:8787
```

> **Nota:** `worker/frontend-utils.js` es un mirror manual de las funciones puras de `main.html`. Mantener sincronizados cuando se modifique `filterAndSort` o `matchesSearch`.

---

## Historial de versiones relevantes

| PR | Descripción |
|---|---|
| #13 | `audit-fixes-4` — A11Y VoiceOver, SRI vendor, API contract `filterAndSort`, MapContent, perf |
| #12 | `audit-fixes-3` — CODE-07 (filterAndSort + OpenNowBtn), A11Y-01 ul semántico, CSP fix, íconos PWA, tests robustos |
| #11 | Límite de 3 items en "últimos movimientos" en Inicio |
| #10 | Deuda técnica ronda 2 |
| #6 | Conversor de moneda con cámara OCR (iOS live scanner) |
