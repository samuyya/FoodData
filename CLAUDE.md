# FoodData — Contexto del proyecto

App **web (PWA)** para digitalizar formatos de control de calidad e inocuidad
alimentaria exigidos por sanidad en **Colombia**. Multiempresa: cada empresa
(restaurante, cafetería, etc.) tiene su propia sesión y solo ve sus datos.

> **Nota para Claude:** el usuario es estudiante de desarrollo (nivel principiante).
> Responde **en español**, con explicaciones claras. La UI va en español **con ñ y
> tildes**; los identificadores de código y campos de BD van **sin tildes** (ej. `anio`, no `año`).

## Ubicación y ejecución
- Carpeta: `C:\Users\samue\OneDrive\Escritorio\FoodData` (antes se llamó "Seal Zenith" / "app-inocuidad-alimentaria").
- Correr: `npm install` y luego `npm run dev` (nodemon) o `npm start`. Servidor en `http://localhost:3000`.
- Requiere `.env` (no versionado): `PORT`, `MONGODB_URI`, `SESSION_SECRET`, `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `GOOGLE_CREDENTIALS_PATH` (opcional), `ALLOWED_ORIGINS` (opcional).
- `google-credentials.json` en la raíz (opcional, para Google Sheets; no versionado).

## Stack
- **Backend:** Node.js + Express.
- **BD:** MongoDB Atlas + Mongoose.
- **Frontend:** HTML + CSS + JS plano (SIN React todavía — migración planeada).
- **PWA:** `public/manifest.json` + `public/sw.js`.
- **Deps:** bcryptjs, cors, dotenv, exceljs, express, express-rate-limit, express-session, googleapis, helmet, mongoose, multer. Dev: nodemon.

## Estructura
- `server.js` — arranque: helmet (CSP), cors, sesión, estáticos, rutas, `seedSuperadmin()`, `googleSheets.inicializar()`. Maneja `EADDRINUSE` con mensaje claro.
- `db.js` — conexión Mongoose.
- `formatos.js` — catálogo de **6 formatos** (`FORMATOS`, `getFormato`).
- `empresaConfig.js` — `getConfigEmpresa(empresaId)` → `{ activos, restringidos }` (con fallback para empresas viejas).
- `models/` — Empresa, Administrador, EmpleadoLista, Registro, Superadmin, Asistencia.
- `routes/` — auth, superadmin, formatos, admin, registros, empleados, asistencia.
- `middleware/` — `sesion.js` (requireEmpresa, requireSuperadmin), `limites.js` (rate limiters).
- `servicios/` — `excel.js`, `googleSheets.js`, `almacenamiento.js` (guarda fotos en disco; intercambiable a Cloudinary).
- `public/` — páginas .html, `css/styles.css`, `js/*`, `img/`, `manifest.json`, `sw.js`.
- `datos/` — `excel/{empresaId}/`, `asistencia/{empresaId}/{anio-mes}/` (no versionado).

## Roles y autenticación
- **Login único** (`POST /api/auth/login`, email+password): detecta superadmin o empresa.
- **Superadmin:** crea empresas y administradores; edita/desactiva/elimina empresas. Panel en `/superadmin/dashboard.html`. Una empresa **desactivada** no puede iniciar sesión. Eliminación definitiva solo si está desactivada y escribiendo el nombre exacto.
- **Empresa** = rol "empleado" por defecto en la sesión.
- **Administrador:** no tiene login propio; se verifica por **contraseña** (hay 1+ `Administrador` por empresa). Se usa para: abrir formatos restringidos, ver historial de meses anteriores, corregir asistencia, y llenar formatos atrasados.
- **Marcadores en sesión:** `adminPendiente` (por formato, para entrar a restringidos), `adminHistorial` (meses anteriores), `adminAtrasado` (llenar días atrasados — **una sola vez por sesión**).

## Módulos del menú principal
- 📋 **Formatos** → `/formatos.html`
- 📅 **Asistencia** → `/asistencia.html`
- 🎓 **Capacitaciones** → placeholder (sin contenido aún)
- 🗂️ **Programas** → placeholder (sin contenido aún)

## Formatos
- 6 en el catálogo: `calidad_agua`, `control_plagas`, `presentacion_personal`, `control_temperatura`, `limpieza_desinfeccion`, `manejo_residuos`. (Se eliminó `capacitacion_continua`.)
- Por empresa: `formatosActivos` (cuáles usa) y `formatosRestringidos` (cuáles piden contraseña de admin). El menú los **renumera dinámicamente** por empresa.
- **El contenido interno (preguntas/checks) NO está construido** — solo la base: campo Responsable, Observaciones, botón Guardar. Pendiente: armar los formularios (el usuario enviará los modelos; se empieza con uno de prueba).
- **Días pendientes:** hay que llenar en orden cronológico los días faltantes del mes en curso antes del día de hoy; el servidor decide qué día se guarda. Llenar un día **atrasado** exige contraseña de admin (una vez por sesión en no-restringidos; los restringidos usan el marcador de entrada).
- **Historial:** mes actual visible para todos; meses anteriores requieren contraseña de admin.
- Al guardar: sincroniza Excel (`datos/excel/{empresa}/{anio-mes}.xlsx`, una hoja por formato) y, si la empresa tiene `googleSheetId`, sincroniza Google Sheets.

## Asistencia
- El empleado selecciona su nombre (de `EmpleadoLista`), toma una foto (cámara, comprimida ~100KB). 1ª foto del día = ingreso, 2ª = salida, 3ª bloqueada.
- Fotos en `datos/asistencia/` (privadas, servidas por `/api/asistencia/foto`). Almacenamiento vía `servicios/almacenamiento.js` (intercambiable a Cloudinary).
- **Registro mensual por empleado:** tabla Día / Entrada / Salida / Horas / Evidencia + total. Día incompleto (sin salida) → solo el admin lo corrige (contraseña). **Sin cálculo de horas extra** (aplazado).
- Descarga mensual en Excel: una hoja por empleado + hoja "Resumen".
- Empleados (lista del Formato 3 `presentacion_personal`) se gestionan dentro de ese formato; requiere admin si ese formato está restringido para la empresa.

## Sistema de diseño FoodData
Tokens en `public/css/styles.css` (`:root`): `--color-primario: #16c2a3` (turquoise), `--color-primario-oscuro: #11a98d`, `--color-fondo: #f3faf8`, `--color-borde: #d8e7e1`, `--radio: 14px`, sombra suave verdosa.
- **Verdes de marca:** `#16c2a3` (acento turquoise), `#a4ddcd` (menta), `#c8ede2`/`#ecf9f5` (más claros), `#0e3a31` (texto verde oscuro).
- **Login:** fondo degradado menta, tarjeta blanca, logo `logo-fooddata.png` (lockup con lema), botón turquoise.
- **Menú:** fondo blanco; cabecera **verde difuminada** (`linear-gradient(180deg, #a4ddcd, #fff)`) con `logo-solo.fooddata.png`; **tarjeta del establecimiento** (logo + etiqueta "RESTAURANTE" + nombre); botones blancos con borde verde claro y hover turquoise.
- **Subpáginas** (formato, formatos, registros, asistencia, registro-asistencia, superadmin): cabecera verde difuminada (`.sub-topbar` > `.sub-topbar-inner`), botón(es) "Volver" arriba-izquierda, tarjeta del establecimiento a la derecha (el superadmin lleva el logo de FoodData en vez de la tarjeta). Contenido en `.sub-main`. Logout solo existe en menú y superadmin (no en subpáginas).
- **Logos en `public/img/`:** `logo-fooddata.png` (lockup con lema — login), `logo-solo.fooddata.png` (solo wordmark — cabeceras), `icon-fooddata.png` (ícono PWA). Logos de empresas (subidos) en `public/img/logos/`.

## Servicios externos
- **MongoDB Atlas** — Network Access en `0.0.0.0/0`.
- **Google Sheets** (cuenta de servicio): una hoja por empresa (`googleSheetId`), una pestaña por formato. Si no hay credenciales, la app funciona y solo omite esta sincronización.
- **PWA:** `sw.js` usa red-primero para estáticos, **nunca cachea `/api/`** (datos siempre frescos), respaldo offline.

## Seguridad
- helmet con CSP (no hay scripts inline en el front), express-rate-limit (login y verificaciones de admin), cors con lista blanca (`ALLOWED_ORIGINS`), bcryptjs para hashes, cookie de sesión `httpOnly`/`sameSite: lax`/`secure` en producción.
- Aislamiento multiempresa: **toda consulta filtra por `empresa_id`** a nivel de aplicación (manual, revisado; no hay inyección automática en Mongoose).

## Pendiente / roadmap
- **Contenido de los formularios** de cada formato (empezar con uno de prueba; el usuario enviará los modelos).
- **Capacitaciones:** contenido del módulo + estudiar hacerlo un **servicio público pago** (cualquiera entra, ve la capacitación, paga, recibe certificado BPM) → requiere acceso público, pasarela de pago (Wompi/MercadoPago/PayU en Colombia) y certificados en PDF.
- **Programas:** definir contenido.
- **Migración a React** (planeada).
- **Despliegue** (host recomendado: Render). Antes hay que: `app.set('trust proxy', 1)`, sesiones en MongoDB (`connect-mongo`), credenciales de Google por variable de entorno, y mover fotos/logos a **Cloudinary** (el disco de los hosting gratis es efímero).

## Gotchas
- Si "Could not connect to MongoDB Atlas": agregar la IP actual o usar `0.0.0.0/0` en Network Access.
- Si `EADDRINUSE` (puerto 3000 ocupado): cerrar el otro `node` (en **PowerShell**, no CMD) o reiniciar; el servidor ya muestra un mensaje claro.
- Comandos como `Get-Process` son de PowerShell, no de CMD.
