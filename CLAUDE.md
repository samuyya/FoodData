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
- `server.js` — arranque: helmet (CSP, HSTS, frameguard), cors, body-parser con `limit: 256kb`, middleware anti-NoSQL, sesión con `connect-mongo` (pendiente), estáticos, rutas, `seedSuperadmin()`, `sincronizarIndicesRegistro()`, `googleSheets.inicializar()`. Error handler global. Maneja `EADDRINUSE` con mensaje claro.
- `db.js` — conexión Mongoose.
- `formatos.js` — catálogo de **9 formatos** (`FORMATOS`, `getFormato`).
- `festivos.js` + `public/js/festivos.js` — módulo de festivos colombianos (algoritmo Meeus para Pascua + Ley Emiliani + religiosos). Cache por año.
- `empresaConfig.js` — `getConfigEmpresa(empresaId)` → `{ activos, carpetas: { cocina, salon, administracion }, compartidos }`. Helper `carpetaCanonica(formatoId, carpeta, config)` (legacy, ya no se usa en registros pero sí en Excel/GS para detectar formatos compartidos).
- `models/` — Empresa, Administrador, EmpleadoLista, Registro, Superadmin, Asistencia, **Documento** (programa N de la empresa X).
- `routes/` — auth, superadmin, formatos, admin, registros, empleados, asistencia, **documentos**.
- `middleware/` — `sesion.js` (`requireEmpresa`, `requireSuperadmin`, **`requireModulo(nombre)`**), `limites.js` (rate limiters).
- `servicios/` — `excel.js`, `googleSheets.js`, `almacenamiento.js` (guarda fotos en disco + documentos de programa; intercambiable a Cloudinary).
- `public/` — páginas .html, `css/styles.css`, `js/*`, `img/`, `manifest.json`, `sw.js`. **`js/util.js`** inyecta skip-link + focus trap global + PWA.
- `datos/` — `excel/{empresaId}/Registros - {slug}.xlsx`, `asistencia/{empresaId}/{anio-mes}/`, **`documentos/{empresaId}/programa-{n}/`** (no versionado).
- `scripts/` — utilitarios de mantenimiento: `diagnostico-registros.js`, `limpiar-registros-mes.js` (exige `empresaId`, ver abajo), `diagnostico-google-sheets.js`, `ensuciar.js` (mantiene el estilo "humano" del código), `backup.js` / `restore.js` (ver sección Backups).
- `.claude/skills/impeccable/` — skill instalada (no versionada). Ver sección "Skill impeccable" más abajo.

## Roles y autenticación
- **Login único** (`POST /api/auth/login`, email+password): detecta superadmin o empresa. `session.regenerate()` al login (anti session fixation) + compare contra hash falso si email no existe (anti timing attack).
- **Superadmin:** crea empresas y administradores; edita/desactiva/elimina empresas; gestiona documentos de programas por empresa. Panel en `/superadmin/dashboard.html`. Una empresa **desactivada** no puede iniciar sesión. Eliminación definitiva solo si está desactivada y escribiendo el nombre exacto.
- **Empresa** = rol "empleado" por defecto en la sesión.
- **Administrador:** no tiene login propio; se verifica por **contraseña** (hay 1+ `Administrador` por empresa). Se usa para: entrar a la carpeta Administración, ver historial de meses anteriores, corregir asistencia, llenar formatos atrasados.
- **Marcadores en sesión:** `adminCarpetaAdministracion` (al entrar a esa carpeta), `adminHistorial` (meses anteriores), `adminAtrasado` (llenar días atrasados — **por carpeta, una verificación por carpeta y por sesión**: cocina, salón y administración llevan su propia validación).

## Módulos del menú principal (controlados por empresa)
Cada botón aparece u oculta según `empresa.modulosActivos`:
- 📋 **Formatos** → `/formatos.html` (módulo `formatos`)
- 📅 **Asistencia** → `/asistencia.html` (módulo `asistencia`)
- 🎓 **Capacitaciones** → placeholder (módulo `capacitaciones`, sin contenido aún)
- 🗂️ **Programas** → `/programas.html` (módulo `programas`, **con contenido funcional**)

**Sistema de módulos:**
- Modelo `Empresa.modulosActivos: [String]` — default: los 4 habilitados
- Middleware `requireModulo(nombre)` en `middleware/sesion.js`: el superadmin pasa siempre; las empresas reciben 403 si el módulo está deshabilitado
- Aplicado en `server.js` a las rutas: `/api/formatos`, `/api/registros`, `/api/empleados` (módulo `formatos`), `/api/asistencia` (módulo `asistencia`), `/api/documentos` (módulo `programas`, chequeado dentro del route porque el superadmin debe poder subir aunque la empresa no lo tenga)
- En el menú principal, `aplicarModulos(modulos)` esconde los botones de módulos no activos
- Si el superadmin cambia los módulos a una empresa que ya está logueada, la empresa **debe reloguearse** para que aplique al menú (el cache vive en `req.session.empresa.modulosActivos`)

## Formatos
- 9 en el catálogo: `recepcion_materias_primas`, `calidad_agua`, `control_temperatura`, `control_plagas`, `limpieza_salon`, `limpieza_bano`, `limpieza_campana_trampa`, `manejo_residuos`, `presentacion_personal`.
- Cada formato del catálogo (`formatos.js`) lleva metadatos institucionales: `codigo`, `version`, `fechaVersion`, `plan`, `programa`, `titulo`, `nota`.
- **Carpetas** (Cocina/Salón/Administración): el superadmin asigna cada formato a 1+ carpetas. La carpeta Administración pide contraseña de admin para entrar (una vez por sesión). Un mismo formato en dos carpetas tiene **registros independientes** (el modelo `Registro` indexa por `empresa_id + formato + carpeta + año + mes + día`).
- **Formatos compartidos:** el superadmin puede marcar un formato (que esté en 2+ carpetas) como "compartido" (`empresa.formatosCompartidos`). En modo compartido los **registros siguen siendo independientes por carpeta** (cada carpeta lleva su propia secuencia de días/pendientes), pero en **Excel/Sheets se ven en UNA sola hoja sin sufijo**, con una columna extra "Carpeta" que distingue de cuál vino cada fila. Default: duplicado (hojas separadas por carpeta).
- **Plantillas de UI por formato:** cada formato tiene su `iniciarFormX(infoInicial)` registrado en `PLANTILLAS` dentro de `public/js/formato.js`. El HTML del form vive en `public/formato.html`. Helpers compartidos: `postRegistro`, `configurarResponsableEsCarpetaAdmin`, `pintarBanners`, `mostrarBannerExito`.
- **Encabezado institucional de los formatos (norma):** dentro del card del formato hay un bloque `<section class="enc-inst">` que muestra Plan / Programa / Título (tomados del catálogo). **NO lleva logo** (el logo va solo en la `.sub-topbar`). **NO lleva caja de Código/Versión/Fecha/Página** a la derecha. El contenido va **centrado** ocupando todo el ancho del card, sin líneas divisorias internas. Esta es la estructura para todo formato nuevo.
- **Días pendientes:** hay que llenar en orden cronológico los días faltantes del mes en curso antes del día de hoy; el servidor decide qué día se guarda. Llenar un día **atrasado** exige contraseña de admin (`adminAtrasado` se setea **una sola vez por sesión** y vale para cualquier formato).
- **Historial:** mes actual visible para todos; meses anteriores requieren contraseña de admin (`adminHistorial`).
- **Festivos colombianos** (`festivos.js` + `public/js/festivos.js`): la **casilla del día** se pinta turquoise con tooltip "Día feriado" en tabla de registros, tabla de asistencia, Excel y Google Sheets.
- **Excel:** un solo archivo por empresa `datos/excel/{empresaId}/Registros - {slug}.xlsx`, **una hoja por (formato, carpeta)**, **organizado por meses** apilados dentro de la hoja. Festivos resaltados solo en la celda del día. Reconstruye en cada guardado.
- **Encabezado de cada hoja de Excel/Google Sheets (norma):** la primera fila es el **título institucional** (`formato.titulo`) merged a lo ancho, fuente 14 bold, color oscuro, centrado. La segunda fila es el subtítulo merged: `Plan · Programa · Código XX-F-NN` (en gris cursiva, tamaño 10, centrado, `wrapText: true`). **NO incluir "Versión" ni "Fecha"** en el subtítulo. Después una fila vacía y empiezan los meses apilados.
- **Google Sheets:** misma estructura (hoja por instancia, meses apilados, festivos). Sync por API con la cuenta de servicio.
- **Multi-ítems por día (recepción):** cuando un formato necesita varias filas por día (`recepcion_materias_primas`), `columnasYFila()` devuelve `{ columnas, expandirFilas }` en lugar de `{ columnas, fila }`. `expandirFilas(r)` regresa un array; el día solo aparece en la primera fila del bloque.
- **Reporte de seguimiento de formatos:** botón "📄 Generar reporte de formatos" en `formatos.html` (arriba de la lista de carpetas). Se ve en pantalla, no genera ningún archivo ni guarda nada — botón principal "este mes" (día 1 a hoy) o un rango de fechas personalizado, y un botón "Imprimir / Guardar como PDF" que usa `window.print()` (con `@media print` en `styles.css`). Backend: `GET /api/registros/reporte?desde=&hasta=` en `routes/registros.js`, reutiliza `getConfigEmpresa`. Por carpeta (Cocina/Salón/Administración, se omite si no tiene formatos rastreables) muestra días registrados/pendientes/% cumplimiento por formato, y las **novedades justo debajo de esa carpeta** (cualquier `Registro` del rango con `observaciones` no vacío, con quién fue el responsable). `presentacion_personal` se excluye (no tiene formulario diario). No es cálculo de nómina ni de inspección oficial, es una referencia para el administrador.

## Programas
- 11 programas del Plan de Saneamiento Básico colombiano, hardcoded en `public/js/programas.js` (catálogo `PROGRAMAS`: Limpieza y Desinfección, Residuos Sólidos, Plagas, Agua Potable, Capacitaciones, Mantenimiento, Trazabilidad, Proveedores, Muestreo, PQRS, Recall).
- **Documentos por programa** (modelo `Documento`): cada empresa tiene N documentos por cada uno de los 11 programas (PDF, imagen, Word, Excel, txt — máx 10MB c/u). Almacenamiento en disco: `datos/documentos/{empresaId}/programa-{n}/{timestamp}-{nombre}`.
- **Solo el superadmin sube/borra** desde `/superadmin/documentos.html?empresa={id}` (botón "📎 Documentos" en cada empresa del dashboard).
- **La empresa solo lee los suyos** desde el modal del programa en `/programas.html`. Requiere módulo `programas` activo (validado dentro de `routes/documentos.js`).
- Endpoint de descarga: `GET /api/documentos/:id/descargar` — verifica `empresa_id` de la sesión contra el del documento (o superadmin pasa siempre).

## Asistencia
- El empleado selecciona su nombre (de `EmpleadoLista`), toma una foto (cámara, comprimida ~100KB). 1ª foto del día = ingreso, 2ª = salida, 3ª bloqueada.
- Fotos en `datos/asistencia/` (privadas, servidas por `/api/asistencia/foto`). Almacenamiento vía `servicios/almacenamiento.js` (intercambiable a Cloudinary).
- **Registro mensual por empleado:** tabla Día / Entrada / Salida / Horas / Evidencia + total. Día incompleto (sin salida) → solo el admin lo corrige (contraseña).
- **Horas extra semanales (dato de referencia, NO es cálculo de nómina oficial):** `servicios/horasExtra.js` calcula, semana a semana (lunes-domingo), las horas por encima de la jornada legal de 42h. Se identifican día por día en orden cronológico: en cuanto el acumulado semanal cruza 42, el excedente de ese día es "extra" (contado desde el final del turno hacia atrás). Se clasifica en 4 categorías — diurnas (6am-7pm), con recargo dominical, nocturnas (7pm-6am), dominicales nocturnas — tratando festivo (`festivos.js`) igual que domingo. Una semana solo se muestra una vez que termina completamente (se "activa" el lunes siguiente). Si una semana cruza de mes, cada día se atribuye a su propio mes (el umbral de 42h se calcula sobre la semana completa). Se ve en `registro-asistencia.html` debajo del total del mes, con detalle expandible por semana.
- Descarga mensual en Excel: una hoja por empleado + hoja "Resumen".
- Empleados (lista del Formato 3 `presentacion_personal`) se gestionan dentro de ese formato; requiere admin si ese formato está restringido para la empresa.
- **Saldo persistente de horas extra (`models/SaldoHorasExtra.js` + `servicios/saldoHorasExtra.js`):** un documento por empleado con las 4 categorías acumuladas para siempre (no se resetea por mes). Cada vez que se pide (panel resumen o detalle) se llama `actualizarSaldo()`, que solo procesa las semanas cerradas nuevas desde `ultimaSemanaProcesada` — no recalcula todo el historial cada vez. Si una semana cerrada da ≥42h, suma al saldo (mismo cálculo que arriba); si da <42h, resta del saldo en la categoría que corresponda, sin bajar de 0 por categoría (el sobrante de una categoría no pasa a otra).
- **Jornada esperada:** `Empresa.jornadaEsperada` (horas esperadas por día de la semana, default 7h todos los días) es lo que define cuánto es "menos de lo normal" en un día concreto para calcular la resta. Configurable por el superadmin al crear/editar la empresa. Empresas creadas antes de este campo lo reciben por default de Mongoose al leer (sin migración manual), siempre que la consulta NO use `.lean()`.
- **Limitación conocida (a propósito, no es un bug):** una vez que una semana queda procesada, corregir su salida (`corregir-salida`) o cambiar la jornada esperada después NO recalcula el saldo con retroactividad — mismo criterio que el resto del sistema ("no es nómina oficial").
- **Panel resumen (`GET /api/asistencia/resumen-empleados?anio=&mes=`):** tabla en `registro-asistencia.html` con todos los empleados, horas del mes y saldo total, con botón "Ver detalle" hacia la vista existente por empleado (que ahora también muestra el saldo acumulado por categoría y, semana a semana, si sumó o restó, con nota explicando el descuento).
- **Reporte de formatos protegido:** desde este cambio, `GET /api/registros/reporte` pide contraseña de administrador la primera vez por sesión (`adminReporteActivo` en `routes/admin.js`, mismo patrón que `adminHistorial`/`adminAtrasado`).

## Sistema de diseño FoodData
**Tokens semánticos en `:root`** (`public/css/styles.css`):
- **Marca:** `--color-primario: #16c2a3` (turquoise), `--color-primario-oscuro: #11a98d`
- **Superficies:** `--color-fondo`, `--color-superficie`, `--color-superficie-alt`, `--color-superficie-suave`
- **Texto (todos WCAG AA sobre blanco):** `--color-texto` (17:1, body), `--color-texto-medio` (11:1), `--color-texto-suave` (7.5:1, hints), `--color-texto-debil` (4.83:1, límite AA — solo meta sutil)
- **Bordes:** `--color-borde`, `--color-borde-suave`
- **Estados:** `--color-error`/`--color-error-bg`/`--color-error-borde`, `--color-ok`/`--color-ok-bg`/`--color-ok-borde`, `--color-aviso`/`--color-aviso-bg`/`--color-aviso-borde`
- `--radio: 14px`, `--sombra: 0 4px 14px rgba(15, 40, 32, .06)`

**Verdes de marca:** `#16c2a3` (turquoise), `#a4ddcd` (menta), `#c8ede2`/`#ecf9f5`/`#f3faf8` (más claros), `#0e3a31` (verde oscuro).

**Estilo visual general (después de impeccable quieter + audit harden):**
- **Sin gradients decorativos en headers de modales** — color sólido por programa
- **Sin side-tab borders** (`border-left: 4px solid color`) — el anti-pattern más común de AI slop
- **Sin animaciones de entrada decorativas** (`keyframes ...Entrada` eliminadas)
- **Sin marca de agua de números** (los `programa-card-numero` 3rem semi-transparentes fueron eliminados)
- **Cards con `border: 1px solid` en vez de `box-shadow` glow** (más Linear/Stripe, menos SaaS-2024)
- **Hover sutil:** cambio de border-color, no `transform: translateY`

**Pantallas con identidad de marca preservada:**
- **Login:** fondo degradado menta, tarjeta blanca, logo `logo-fooddata.png` (lockup con lema), botón turquoise.
- **Menú principal:** cabecera **verde difuminada** (`linear-gradient(180deg, #a4ddcd, #fff)`) con `logo-solo.fooddata.png` y botón "Cerrar sesión"; tarjeta del establecimiento (logo grande + "RESTAURANTE" + nombre); botones del menú blancos con icono + texto + flecha y badge "Hay formatos pendientes por llenar"/"✓ al día".
- **Subpáginas:** misma cabecera verde difuminada (`.sub-topbar`), botón(es) "Volver" arriba-izquierda, tarjeta del establecimiento **compacta** a la derecha (logo 96×80px, nombre 1.5rem). Logout solo existe en menú y superadmin.
- **Encabezado institucional del formato:** `<details>` colapsable — abierto la 1ra vez, cerrado después (recordado por formato en `localStorage`). Indicador visual ▼/▲ que rota.

**Logos en `public/img/`:** `logo-fooddata.png` (lockup con lema — login), `logo-solo.fooddata.png` (solo wordmark — cabeceras), `icon-fooddata.png` (ícono PWA). Logos de empresas (subidos) en `public/img/logos/`.

## Accesibilidad (WCAG AA)
- **Skip-link** "Saltar al contenido" — inyectado en todas las páginas por `util.js`, oculto excepto en focus de teclado.
- **Modales:** `role="dialog"` + `aria-modal="true"` en todos los `.modal-backdrop`. Focus trap global en `util.js` (MutationObserver detecta apertura/cierre, captura `Tab`, restaura foco al elemento que abrió). `Esc` cierra cualquier modal abierto.
- **Atajos de teclado:** `Ctrl+S`/`Cmd+S` → guarda el form visible. `Esc` → cierra modal.
- **Información no-color:** badges Cumple/No cumple muestran `✓`/`✕` además del color (con `::before content`). Festivos en tabla muestran superíndice `F` además del fondo turquoise. Daltónicos distinguen sin depender del color.
- **Touch targets:** `.radio-pill` con `min-height: 44px`, `.btn-pequeno` con `min-height: 36px` para acciones secundarias.
- **`@media (prefers-reduced-motion: reduce)`** global: animaciones y transiciones se reducen a `0.01ms`.
- **`<img alt>` siempre con texto descriptivo** ("Logo de la empresa" inicial, sobrescrito a "Logo de {nombre real}" por el JS al cargar).
- **`loading="lazy"` + `decoding="async"`** en todas las imágenes.

## Servicios externos
- **MongoDB Atlas** — Network Access en `0.0.0.0/0` (en producción restringir a IPs de Render).
- **Google Sheets** (cuenta de servicio): una hoja por empresa (`googleSheetId`), una pestaña por instancia (formato, carpeta) — o una sola sin sufijo si es compartido. Si no hay credenciales, la app funciona y solo omite esta sincronización. Diagnóstico con `node scripts/diagnostico-google-sheets.js`.
- **PWA:** `sw.js` usa red-primero para estáticos, **nunca cachea `/api/`** (datos siempre frescos), respaldo offline.

## Backups
Atlas está en el tier gratis (M0), que **no tiene backups automáticos nativos** (eso empieza en M10+, de pago). Tampoco hay redundancia real de `datos/` (fotos de asistencia, excels, documentos de programas) ni de `public/img/logos/` — viven solo en este disco.
- `node scripts/backup.js` — vuelca cada colección de Mongo a JSON (gzip) + copia `datos/` y `public/img/logos/` completos a `backups/<fecha>/`. Conserva los últimos 5 backups y borra los más viejos solo.
- `node scripts/restore.js <carpeta-backup>` — dry run por defecto (no toca nada); agrega `--confirmar` para restaurar de verdad (reemplaza TODO lo actual).
- **Pendiente:** programarlo con el Programador de tareas de Windows (ej. diario) y copiar `backups/` de vez en cuando a otro disco o a la nube — un backup que solo vive en esta máquina no protege si la máquina se daña. `backups/` ya está en `.gitignore` (contiene datos reales de clientes).

## Tests
`npm test` corre Jest + Supertest sobre los 3 flujos críticos: login (`tests/auth.test.js`), guardar formato (`tests/registros.test.js`) y marcar asistencia (`tests/asistencia.test.js`).
- Cada corrida levanta una MongoDB temporal en memoria (`mongodb-memory-server`) — **nunca toca Atlas**, ni Naiki ni "prueba 1". Se borra sola al terminar.
- `server.js` exporta `app` (Express) y solo llama a `iniciar()` — conectar a Mongo real + abrir el puerto — si se corre directo (`node server.js`/`nodemon`). Los tests hacen `require('../server')` y usan ese `app` con Supertest, sin servidor real corriendo.
- `tests/setup.js` conecta/limpia/cierra la BD de prueba. `tests/helpers.js` arma una empresa + sesión logueada (con el `agent` de Supertest, que guarda la cookie de sesión entre requests) para no repetir el login en cada test.
- Guardar un registro o marcar asistencia también escriben archivos reales (Excel, fotos) en `datos/` — cada test los borra al terminar (`fs.rm` sobre la carpeta de esa empresa de prueba).
- **Pendiente:** más flujos (superadmin, corregir asistencia, reporte de formatos) y correrlo en CI (GitHub Actions) para que cada push los corra solo.

## Skill impeccable (no versionada, solo local)
- Instalada en `.claude/skills/impeccable/` (en `.gitignore`). Re-instalar con `npx impeccable skills install`.
- **23 sub-comandos** disponibles. Los más útiles para FoodData (product UI):
  - `/impeccable critique` — opinión de design director, score Nielsen /40
  - `/impeccable audit` — chequeos técnicos deterministic (a11y, perf, theming, responsive, anti-patterns), score /20
  - `/impeccable quieter` — bajar volumen visual (quitar gradients, side-tabs, animaciones decorativas)
  - `/impeccable distill` / `/impeccable layout` — simplificar y mejorar jerarquía espacial
  - `/impeccable harden` — accesibilidad (role/aria, focus trap, touch targets, prefers-reduced-motion, color-no-solo)
  - `/impeccable colorize` — paleta y contraste WCAG
  - `/impeccable clarify` — copy y cadencia (em-dashes, jerga)
  - `/impeccable polish` — pulido final
- **Snapshots de critique/audit** se guardan en `.impeccable/critique/` (en `.gitignore`) para trend de scores entre runs.
- Antes de aplicar cambios de impeccable que tocan muchos archivos, hacer respaldo en `backups/` (también en `.gitignore`).

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
- [x] `npm audit` da 0 vulnerabilidades (2026-09-11). El moderate de `uuid` vía `exceljs`/`googleapis` (que exigía forzar un downgrade de `exceljs`) se resolvió con un override en `package.json` (`"overrides": { "uuid": "^11.1.1" }`) en vez de tocar la versión de `exceljs` — probado generando un excel real y llamando a `googleapis` sin errores.
- [ ] Revisar `npm audit` de vez en cuando de todas formas (dependencias nuevas pueden traer vulnerabilidades futuras)

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
- **Capacitaciones:** definir si será módulo interno por empresa o **servicio público pago** (cualquiera entra, ve la capacitación, paga, recibe certificado BPM) → requeriría acceso público, pasarela de pago (Wompi/MercadoPago/PayU en Colombia) y certificados PDF.
- **Migración a React** (postergada — vale la pena terminar features en vanilla primero).
- **Despliegue** (host recomendado: Render). **NO desplegar sin completar la sección "⚠️ ANTES DE DESPLEGAR — CHECKLIST OBLIGATORIO"** más arriba en este archivo. Faltan: `connect-mongo` (sesiones persistentes), Cloudinary (storage de fotos asistencia + logos + documentos de programa), credenciales de Google por env var, restricción de IP en Atlas, logger real (pino/winston).

## Hecho (resumen de hitos)
- 9 formatos con plantillas específicas implementadas (calidad_agua, control_temperatura, control_plagas, manejo_residuos, limpieza_salon, limpieza_bano, limpieza_campana_trampa, recepcion_materias_primas, presentacion_personal — este último sin form porque solo gestiona empleados).
- Sistema de carpetas (Cocina/Salón/Administración) con asignación por superadmin.
- Sistema de formatos compartidos (Excel consolidado con columna "Carpeta").
- Festivos colombianos resaltados en tablas y Excel.
- Excel reorganizado: un archivo por empresa, hojas por (formato, carpeta), meses apilados.
- Programas con documentos por empresa (superadmin sube, empresa lee).
- Módulos por empresa (`modulosActivos`) con middleware `requireModulo`.
- Pase de seguridad completo (NoSQL sanitization, body limit, session.regenerate, hash falso anti-timing, SVG bloqueado, etc.).
- Pase de accesibilidad completo (role/aria, focus trap, skip-link, color-no-solo, touch targets, prefers-reduced-motion).
- Pase de estilo visual (`impeccable quieter` + `harden`): eliminados gradients/side-tabs/animaciones decorativas/marca de agua de números. Score audit /20 estimado: 20/20.

## Gotchas
- Si "Could not connect to MongoDB Atlas": agregar la IP actual o usar `0.0.0.0/0` en Network Access.
- Si `EADDRINUSE` (puerto 3000 ocupado): cerrar el otro `node` (en **PowerShell**, no CMD) o reiniciar; el servidor ya muestra un mensaje claro.
- Comandos como `Get-Process` son de PowerShell, no de CMD.
