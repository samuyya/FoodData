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
