# FoodData — Contexto del proyecto

## Estilo de código (IMPORTANTE)
El proyecto es de un estudiante; el código debe verse hecho por estudiante, no por máquina. Reglas:
- **NO uses banners grandes** tipo `// ====== SECCIÓN ======`. Si necesitas separar, una línea con `// nombre breve` basta.
- **NO comentes lo obvio.** No pongas `// Recoger datos` arriba de `recogerDatos()`. Solo comenta el *porqué*, no el *qué*.
- **Mensajes al usuario en español natural**, no técnico: `"Algo salió mal, intenta de nuevo"` mejor que `"Server returned 500: internal error"`. Si hay detalle técnico útil, va aparte.
- **Funciones cortas** con nombres claros pero no exagerados (`recoger()` mejor que `recogerDatosCompletosDelFormulario()`).
- **Permite mezcla y pequeñas inconsistencias** entre archivos (un `let` aquí, un `const` allá; abreviar variables locales como `r`, `d`, `cb`). Si el código respira humano, mejor.
- **No exageres con validaciones defensivas.** Si el llamador siempre pasa un array, no chequees `Array.isArray()`. Confiar en el caller está bien.
- **Comentarios cortos en español, conversacionales.** `// ojo: esto se queda viejo si cambias el modelo`, no `// Note: This must be updated when…`.
- **Errores se loguean con `console.log` o `console.warn`,** no con stack traces formales. `console.log('no se pudo escribir excel:', err.message)`.
- **JSDoc: no.** Si la función es clara con su nombre y firma, sobra.



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
- 9 en el catálogo: `recepcion_materias_primas`, `calidad_agua`, `control_temperatura`, `control_plagas`, `limpieza_salon`, `limpieza_bano`, `limpieza_campana_trampa`, `manejo_residuos`, `presentacion_personal`.
- Cada formato del catálogo (`formatos.js`) lleva metadatos institucionales: `codigo`, `version`, `fechaVersion`, `plan`, `programa`, `titulo`, `nota`.
- **Carpetas** (Cocina/Salón/Administración): el superadmin asigna cada formato a 1+ carpetas. La carpeta Administración pide contraseña de admin para entrar (una vez por sesión). Un mismo formato en dos carpetas tiene **registros independientes** (el modelo `Registro` indexa por `empresa_id + formato + carpeta + año + mes + día`).
- **Plantillas de UI por formato:** cada formato tiene su `iniciarFormX(infoInicial)` registrado en `PLANTILLAS` dentro de `public/js/formato.js`. El HTML del form vive en `public/formato.html`. Helpers compartidos: `postRegistro`, `configurarResponsableEsCarpetaAdmin`, `pintarBanners`, `mostrarBannerExito`.
- **Encabezado institucional de los formatos (norma):** dentro del card del formato hay un bloque `<section class="enc-inst">` que muestra Plan / Programa / Título (tomados del catálogo). **NO lleva logo** (el logo va solo en la `.sub-topbar`). **NO lleva caja de Código/Versión/Fecha/Página** a la derecha. El contenido va **centrado** ocupando todo el ancho del card, sin líneas divisorias internas. Esta es la estructura para todo formato nuevo.
- **Días pendientes:** hay que llenar en orden cronológico los días faltantes del mes en curso antes del día de hoy; el servidor decide qué día se guarda. Llenar un día **atrasado** exige contraseña de admin (`adminAtrasado` se setea **una sola vez por sesión** y vale para cualquier formato).
- **Historial:** mes actual visible para todos; meses anteriores requieren contraseña de admin (`adminHistorial`).
- **Festivos colombianos** (`festivos.js` + `public/js/festivos.js`): la **casilla del día** se pinta turquoise con tooltip "Día feriado" en tabla de registros, tabla de asistencia, Excel y Google Sheets.
- **Excel:** un solo archivo por empresa `datos/excel/{empresaId}/Registros - {slug}.xlsx`, **una hoja por (formato, carpeta)**, **organizado por meses** apilados dentro de la hoja. Festivos resaltados solo en la celda del día. Reconstruye en cada guardado.
- **Google Sheets:** misma estructura (hoja por instancia, meses apilados, festivos). Sync por API con la cuenta de servicio.
- **Multi-ítems por día (recepción):** cuando un formato necesita varias filas por día (`recepcion_materias_primas`), `columnasYFila()` devuelve `{ columnas, expandirFilas }` en lugar de `{ columnas, fila }`. `expandirFilas(r)` regresa un array; el día solo aparece en la primera fila del bloque.

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
- helmet con CSP (no hay scripts inline en el front), HSTS en prod, `frameAncestors: 'none'` anti-clickjacking, `referrerPolicy: same-origin`.
- express-rate-limit (login 15/15min, verificaciones admin 20/15min), CORS con lista blanca (`ALLOWED_ORIGINS`).
- bcryptjs con 12 rounds para hashes nuevos. Cookie `fd.sid` `httpOnly`/`sameSite: lax`/`secure` en producción + `rolling: true` (refresca 8h en cada request).
- Login con `req.session.regenerate()` (anti session fixation) + comparación contra hash falso si el email no existe (anti timing attack).
- Body parser limitado a `256kb`. Middleware global sanitiza llaves con `$` o `.` en body/query/params (anti NoSQL injection).
- Error handler global no expone stacks al cliente (`"Algo salió mal"` para 500).
- En producción el server **revienta al arrancar** si `SESSION_SECRET` no existe o tiene <32 caracteres. `app.set('trust proxy', 1)` activo en prod.
- Aislamiento multiempresa: **toda consulta filtra por `empresa_id`** a nivel de aplicación (manual, revisado; no hay inyección automática en Mongoose).
- Upload de logos: solo `png/jpg/webp` (SVG fuera porque puede traer `<script>`), validación de extensión Y `mimetype`, máx 2MB.
- Fotos de asistencia: privadas, servidas por endpoint con check de `empresa_id` + bloqueo de `..` en path.

## ⚠️ ANTES DE DESPLEGAR — CHECKLIST OBLIGATORIO
Cuando el usuario diga "vamos a desplegar" o "subir a producción" o "Render", **detente y revisa esta lista con él**. NO desplegar sin completar:

### 1. Variables de entorno en producción
- [ ] `SESSION_SECRET` con 32+ caracteres aleatorios (`openssl rand -base64 48`)
- [ ] `NODE_ENV=production`
- [ ] `ALLOWED_ORIGINS=https://dominio-real.com` (no `localhost`)
- [ ] `MONGODB_URI` apuntando a Atlas
- [ ] `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` con valores fuertes (cambiar los de desarrollo)
- [ ] `GOOGLE_CREDENTIALS_PATH` o las credenciales como JSON en una variable de entorno (no como archivo en el filesystem efímero)

### 2. Sesiones persistentes (CRÍTICO)
- [ ] `npm install connect-mongo`
- [ ] En `server.js` agregar `store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI, ttl: 8 * 60 * 60 })` dentro de `session({...})`
- [ ] Sin esto, **las sesiones se pierden cada deploy** de Render

### 3. Storage de archivos (CRÍTICO en Render/host gratis — disco efímero)
- [ ] Migrar `servicios/almacenamiento.js` (fotos de asistencia) a **Cloudinary** o S3
- [ ] Migrar logos de empresa (`public/img/logos/`) también a Cloudinary/S3
- [ ] El campo `logo` y `fotoIngreso/fotoSalida` deben guardar URL completa de Cloudinary, no path local

### 4. MongoDB Atlas
- [ ] Network Access: cambiar `0.0.0.0/0` por las IPs específicas de Render (no dejar abierto al mundo)
- [ ] Crear usuario de DB específico de producción (no reusar el de desarrollo)

### 5. Dependencias vulnerables
- [ ] `npm audit` — actualmente 5 moderate transitorias en `googleapis → uuid` (DoS bajo)
- [ ] Cuando salga `googleapis@150+` corre `npm update googleapis` y verifica que `npm audit` quede limpio

### 6. Logs y monitoreo
- [ ] Reemplazar `console.log` por un logger real (`pino` o `winston`) que pueda enviar a un servicio (Better Stack, Logtail)
- [ ] Agregar alertas en Render para errores 500 y caídas

### 7. Cosas que ya están parchadas en código (NO tocar)
- ✅ `passwordHash` ya no se expone en `/api/superadmin/administradores`
- ✅ Login con tiempo constante + `session.regenerate()`
- ✅ Body parser con `limit: 256kb`
- ✅ Middleware anti-NoSQL injection
- ✅ Error handler global sin stack traces al cliente
- ✅ HSTS, frameguard, referrer policy
- ✅ bcrypt rounds = 12
- ✅ SVG bloqueado en upload de logos
- ✅ Cookie `fd.sid` httpOnly/secure/sameSite + rolling

### 8. Post-deploy
- [ ] Probar login con superadmin y crear empresa de prueba
- [ ] Probar guardar un formato → verificar que Excel y Google Sheets se sincronizan
- [ ] Probar asistencia con foto → verificar que se sube a Cloudinary
- [ ] Probar logout → verificar que la sesión se invalida
- [ ] Verificar HSTS con: `curl -I https://tudominio.com` (debe haber header `strict-transport-security`)

## Pendiente / roadmap
- **Contenido de los formularios** de cada formato (empezar con uno de prueba; el usuario enviará los modelos).
- **Capacitaciones:** contenido del módulo + estudiar hacerlo un **servicio público pago** (cualquiera entra, ve la capacitación, paga, recibe certificado BPM) → requiere acceso público, pasarela de pago (Wompi/MercadoPago/PayU en Colombia) y certificados en PDF.
- **Programas:** definir contenido.
- **Migración a React** (planeada).
- **Despliegue** (host recomendado: Render). **NO desplegar sin completar la sección "⚠️ ANTES DE DESPLEGAR — CHECKLIST OBLIGATORIO"** más arriba en este archivo. Faltan: `connect-mongo` (sesiones persistentes), Cloudinary (storage), credenciales de Google por env var, restricción de IP en Atlas, logger real.

## Gotchas
- Si "Could not connect to MongoDB Atlas": agregar la IP actual o usar `0.0.0.0/0` en Network Access.
- Si `EADDRINUSE` (puerto 3000 ocupado): cerrar el otro `node` (en **PowerShell**, no CMD) o reiniciar; el servidor ya muestra un mensaje claro.
- Comandos como `Get-Process` son de PowerShell, no de CMD.
