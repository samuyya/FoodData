# CLAUDE.md — Módulo "CaseritosN&S" (despensa del hogar)

> Este archivo es **independiente** del `CLAUDE.md` de FoodData. Su ubicación final será
> `FoodData/modulos/foodsaver/CLAUDE.md` (Claude Code lo carga solo cuando se trabaja dentro de esa carpeta).
> Viaja con el módulo si algún día se separa de FoodData. **No agregar nada de esto al `CLAUDE.md` raíz de FoodData.**
> Estado actual (2026-11-12): **construido completo** en `modulos/foodsaver/`, con 24 pruebas propias pasando y las 112 de FoodData intactas.
> Probado en el navegador contra una base de datos en memoria. **Falta**: probar las notificaciones en los iPhones reales y configurar las variables de entorno en Render (sección 16).

> **Nota para Claude:** el usuario es estudiante de desarrollo (nivel principiante). Responde **en español**, con
> explicaciones claras, y explica lo que vas a hacer antes de tocar archivos de FoodData fuera de `modulos/foodsaver/`.
> La interfaz va en español **con ñ y tildes**; los identificadores de código y campos de base de datos van **sin tildes**.

## 1. Qué es y para qué sirve

Una despensa digital para el hogar, escondida dentro de FoodData. Evita que la comida se dañe por olvido y responde
cuatro preguntas del día a día:

1. ¿Qué tengo en la nevera, el congelador y la alacena?
2. ¿Qué se me va a vencer primero?
3. ¿Qué puedo cocinar hoy con lo que tengo?
4. ¿Qué me falta comprar?

Lo usan la familia del dueño y, más adelante, otras familias (cada una con su propia cuenta). Es un **proyecto
personal**: no se muestra a clientes de FoodData, no se menciona en la landing ni en ningún documento público.

Nombre visible del módulo: **CaseritosN&S** (una sola constante `NOMBRE_MODULO` en `modulos/foodsaver/config.js`).

## 2. Reglas de oro

1. **Secreto:** ningún cliente de FoodData debe poder ver ni sospechar que existe. Ver sección 5.
2. **Aislamiento entre hogares:** toda consulta filtra por `empresa_id` tomado **de la sesión**, nunca del cuerpo ni de
   la URL. Un hogar jamás ve datos de otro.
3. **Separable:** todo el código del módulo vive en `modulos/foodsaver/`. Se conecta con FoodData solo en los
   "puntos de contacto" de la sección 4. Separarlo debe ser: borrar la carpeta y deshacer esos puntos.
4. **No poner en riesgo FoodData:** FoodData tiene un cliente real en producción. Se trabaja en una rama
   (`feature/foodsaver`), se corre `npm test` antes de unir a `main`, y se prueba primero en local.
5. **Sin datos sensibles en el repositorio:** el código secreto, las llaves de notificaciones y los tokens van en
   variables de entorno (`.env` local y Render). Nunca en el código ni en este archivo.

## 3. Qué NO hace (decisiones tomadas, no reabrir sin preguntar)

- **No descuenta cantidades al cocinar.** No hay botón "Cocinar esto" que reste ingredientes.
- **No lleva cantidades exactas.** La cantidad y unidad se anotan al comprar solo como referencia.
- **No tiene "resumen del mes"** (usado contra botado). Se descartó.
- **No usa WhatsApp** (la API es de pago) ni cuentas por persona (es una cuenta por familia).
- **No escanea códigos de barras** ni se conecta a supermercados.

## 4. Dónde vive y puntos de contacto con FoodData

FoodData es una app Node + Express + MongoDB (Mongoose), con login por empresa, módulos por empresa
(`modulosActivos`), PWA con `sw.js`, tests con Jest y despliegue en Render. Léelo en el `CLAUDE.md` raíz si necesitas
detalles generales (sesiones, `requireEmpresa`, `requireModulo`, límites de peticiones, CSP sin scripts inline,
logger, backups). **Excepción:** la sección de estilo de código del raíz no aplica a este módulo; aquí el código se
escribe claro y normal (ver sección 14).

### Puntos de contacto

En los archivos de servidor se marcan con el comentario `// foodsaver:contacto`. Los archivos **públicos** (`public/...`) no llevan
esa marca a propósito, para no delatar el módulo: ahí el código es genérico y se reconoce por su comentario.

| # | Archivo de FoodData | Qué se agregó |
|---|---|---|
| 1 | `server.js` | `require('./modulos/foodsaver')(app)` después de `/api/contar` |
| 2 | `models/Empresa.js` | Campo `oculta` y `MODULOS_OCULTOS = ['foodsaver']` en el validador. `MODULOS_VALIDOS` (lo usan los formularios normales) **no** cambió |
| 3 | `routes/superadmin.js` | `VISIBLES` y `buscarVisible()`: la lista y todas las rutas `/empresas/:id` y `/administradores` tratan un hogar como si no existiera (404) |
| 4 | `routes/auth.js` (`/me`) | Devuelve `extras` desde `app.locals.menuExtras` (cada módulo registra su botón) |
| 5 | `public/js/menu.js` + `public/menu.html` (`?v=5`) + `public/css/styles.css` (`.menu-portada`) | `pintarExtras()`: dibuja botones extra con su insignia y, si traen `portada`, cambia la tarjeta del establecimiento por la foto. Sin marca (archivo público) |
| 6 | `public/js/superadmin-dashboard.js` | Al final: el campo "Google Sheets" del formulario de crear empresa manda valores cortos a `/api/superadmin/verificar-campo` y, si responde `script`, lo carga. Sin marca (archivo público) |
| 7 | `public/sw.js` | `try { importScripts('/sw-avisos.js'); } catch (e) {}`. Sin marca (archivo público) |
| 8 | `models/todos.js` | `...require('../modulos/foodsaver/modelos')` (backup y restore) |
| 9 | `package.json` | Dependencia `web-push` (^3.6.7) |
| 10 | `.github/workflows/foodsaver-avisos.yml` | Tarea diaria de los avisos |

Borrar un hogar no pasa por `routes/superadmin.js`: lo hace el panel Hogares (`rutas/hogares.js`), que borra también sus datos `Fs*` y su foto.

### Estructura de la carpeta

```
modulos/foodsaver/
  CLAUDE.md               este archivo
  index.js                registra rutas, páginas y sirve los archivos protegidos
  config.js               NOMBRE_MODULO, días de aviso por defecto, constantes
  contexto.js             ÚNICO archivo que sabe quién es el hogar: getHogarId(req) y tieneModulo(req)
  zona.js                 fechas en America/Bogota: hoyColombia(), diasHasta(fecha)
  modelos/                FsIngrediente, FsCompra, FsSuscripcion, FsAjuste, FsReceta (solo recetas propias)
  rutas/                  despensa.js, recetas.js, compras.js, avisos.js, hogares.js (panel secreto)
  servicios/              ingredientes.js (estados y avisos), recetas.js (coincidencias y orden), push.js
  datos/                  recetas-base.js, catalogo-ingredientes.js
  web/                    index.html, app.js, estilos.css, panel-hogares.js  (NO van en public/)
  assets/                 imagen de referencia del hogar
  tests/                  pruebas Jest
```

`contexto.js` es la costura con FoodData: si Food Saver se vende por separado, se reemplaza solo ese archivo por el
login propio del comprador.

## 5. Acceso secreto y panel "Hogares"

### Idea
El superadmin de FoodData no muestra nada del módulo. Al escribir un **código secreto** en un campo existente se
desbloquea, durante la sesión, un panel **"Hogares"** para crear y administrar las empresas ocultas.

### Cómo se desbloquea
- **Campo disparador:** "ID de Google Sheet" del formulario de crear empresa (campo de texto visible, casi sin uso).
- Al salir del campo o pulsar Enter, si el texto tiene entre 4 y 64 caracteres y no contiene `/`, el navegador lo
  envía a `POST /api/superadmin/verificar-campo` (nombre neutro a propósito).
- El servidor compara con `process.env.FOODSAVER_CODIGO` usando `crypto.timingSafeEqual`.
  - **Si coincide:** guarda en la sesión del superadmin el marcador `ocultoDesbloqueado` (dura 8 horas, se limpia al
    cerrar sesión y en `/limpiar`, igual que los demás marcadores de FoodData), responde `{ ok: true }`, el navegador
    **vacía el campo** y aparece el panel.
  - **Si no coincide:** responde `{ ok: false }` con el mismo tiempo y **sin ningún mensaje visible**. No se registra
    el valor probado en logs.
- Límite de intentos con el limitador de FoodData (mismo criterio que `limiteAdmin`).
- Si `FOODSAVER_CODIGO` no existe en el entorno, el desbloqueo queda deshabilitado (siempre `ok: false`).
- Botón "Ocultar de nuevo" en el panel que borra el marcador.

### La ocultación vive en el servidor
- La lista normal de empresas del superadmin **no incluye** las que tienen `oculta: true`. Revisar con búsqueda
  **todos** los lugares donde se listan o cuentan empresas (listas, selectores de "crear administrador", contadores,
  paneles por empresa) y excluir las ocultas en cada uno.
- Los endpoints del panel Hogares responden `404` si el marcador no está activo (no `401` ni `403`).
- `panel-hogares.js` **no es un archivo estático público**: se sirve desde una ruta que exige el marcador, y el
  disparador público es genérico (no menciona hogares ni el módulo).

### Panel "Hogares"
- Lista de hogares (empresas ocultas): nombre, correo, estado (activo/desactivado) y botón editar.
- Crear hogar: nombre interno, correo, contraseña (mínimo 8 caracteres, igual que las empresas) e imagen de portada.
  Lo creado nace con `oculta: true` y `modulosActivos: ['foodsaver']` **únicamente** (Formatos, Asistencia,
  Capacitaciones, Programas e Inventarios apagados).
- Editar: nombre, imagen, contraseña nueva, activar o desactivar. Nunca se borra desde aquí sin escribir el nombre
  exacto (mismo criterio de FoodData para empresas).
- Los hogares inician sesión por el login normal de FoodData con su correo y contraseña.
- Los formularios normales de crear y editar empresa **no pueden** activar este módulo: el servidor lo rechaza
  aunque alguien manipule la petición.

## 6. Cómo se ve para el hogar (menú)

- Encabezado verde de FoodData **como siempre** (logo de FoodData y "Cerrar sesión").
- Debajo, en lugar de la tarjeta del establecimiento (logo pequeño + "RESTAURANTE" + nombre), una **imagen de portada
  centrada y grande** (la de la familia). Proporción de la original: aproximadamente 3:2, ancho máximo cercano a 520 px
  en computador, ancho completo con márgenes en celular.
- Justo debajo, "Menú principal" con **un solo botón: CaseritosN&S**, con la insignia de avisos
  (por ejemplo "2 vencen pronto") cuando corresponda.
- La imagen se sube con el mismo mecanismo que el logo de empresa (`png/jpg/webp`, máx. 2 MB). **Decisión del
  usuario: pública**, igual que los logos de FoodData. El archivo de la portada es `assets/logo-hogar.jpeg`
  (1535 × 1024 px); usar ese tal cual, sin recortarlo.
- El nombre "CaseritosN&S" contiene `&`: mostrarlo siempre con `textContent`.
- **Sin rastro en archivos públicos:** `menu.js` no debe contener "foodsaver". El servidor (`/me`) manda, solo a esa
  empresa, algo como `extras: [{ etiqueta, ruta, insignia }]` y `portada: { imagen }`; el menú los dibuja de forma
  genérica. Las demás empresas reciben esos campos vacíos.
- La página del módulo vive en la ruta `/despensa`. Responde `404` si no hay sesión de empresa con el módulo activo.
  Sus archivos (`app.js`, `estilos.css`) también se sirven por una ruta protegida con lista de nombres permitidos.
  La única excepción pública es `/sw-avisos.js` (sin datos sensibles, ver sección 10).

## 7. Datos

Todas las colecciones llevan prefijo `Fs` y el campo `empresa_id` (obligatorio, con índice). Fechas como texto
`AAAA-MM-DD`; marcas de tiempo con `timestamps`.

**FsIngrediente**
- `nombre` (obligatorio, máx. 60), `cantidad` (número > 0, solo referencia), `unidad` (kg, g, lb, L, ml, und,
  paquete, caja, botella, lata, bolsa, otro), `ubicacion` (nevera | congelador | alacena | otro).
- `perecedero` (Boolean) y `vence` (`AAAA-MM-DD`; obligatorio si es perecedero, vacío si no).
- `nivel`: `lleno` | `poco`. `activo` (Boolean). Al archivar: `archivadoEn` y `motivo` (`acabado` | `botado`).
- `aviso1`, `aviso2` (Boolean): si ya se mandó cada aviso para este ingrediente.

**FsCompra** (lista de compras): `nombre`, `nota`, `hecho` (Boolean), `origen` (`manual` | `acabado` | `poco` | `receta`).

**FsSuscripcion** (dispositivos con notificaciones): `endpoint` (único), `claves`, `agente`, `creadoEn`.

**FsAjuste** (uno por hogar): `diasAviso1` (por defecto 5), `diasAviso2` (por defecto 2), validando
`diasAviso1 > diasAviso2 >= 0`.

**FsReceta** (solo las recetas propias de la familia): `nombre`, `categoria`, `ingredientes[]`
(`nombre`, `texto` de cantidad, `opcional`), `pasos[]`, `porciones`.
Las recetas base **no** están en la base de datos: viven en `datos/recetas-base.js` (solo lectura).

## 8. Funcionamiento por pantallas

Entrada: el hogar inicia sesión en FoodData y el menú le muestra su portada y el botón del módulo.
Navegación interna con pestañas: **Hoy · Despensa · Recetas · Compras · Ajustes**.

### 8.1 Estados de un ingrediente (se calculan en el servidor con la fecha de Bogotá)
Sea `d` los días que faltan para `vence`:

| Estado | Regla | Cómo se ve |
|---|---|---|
| Vencido | `d < 0` | ✕ rojo, sección aparte |
| Urgente | `0 <= d <= diasAviso2` (por defecto 2; "vence hoy" es `d = 0`) | ⚠ naranja |
| Pronto | `diasAviso2 < d <= diasAviso1` (por defecto 5) | ⚠ amarillo |
| Bien | `d > diasAviso1` o no perecedero | ✓ verde |

El estado siempre se muestra con **ícono y texto**, no solo con color.

### 8.2 Hoy
- Tres contadores: **Vencen pronto**, **Vencidos**, **Total en casa**.
- Franja de aviso dentro de la app con la lista de lo que vence pronto (amarilla) y lo urgente (roja).
- **Sugerencia destacada:** la mejor receta que aproveche algo urgente o pronto (ver 8.4).
  Texto de ejemplo: "La leche vence en 2 días. Puedes hacer arroz con leche. Te falta: canela".
  Si nada vence pronto: "Nada vence pronto. ¡Todo en orden!".
- Estado vacío (sin ingredientes): "Todavía no hay nada en la despensa. Agrega tu primer ingrediente."

### 8.3 Despensa
- Lista de ingredientes activos ordenada por fecha de vencimiento (lo más urgente arriba; los no perecederos al final).
  Cada fila: nombre, cantidad con unidad, ubicación, "vence en N días" o "No vence", estado (8.1) y marca "Queda poco".
- **Vencidos** en su propia sección, siempre aparte y **excluidos de las recetas**.
- Filtro por ubicación (nevera, congelador, alacena) y buscador por nombre.
- **Agregar ingrediente:** nombre (con sugerencias del catálogo, pero se permite texto libre), cantidad, unidad,
  ubicación, casilla **"No perecedero"** (oculta la fecha) y fecha de vencimiento.
  Validaciones con mensajes amables, en el servidor y en el navegador:
  - Nombre vacío: "Escribe el nombre del ingrediente."
  - Cantidad vacía, cero, negativa o con letras: "La cantidad debe ser un número mayor que cero."
  - Perecedero sin fecha: "Indica la fecha de vencimiento o marca No perecedero."
  - Fecha mal escrita: "Esa fecha no es válida."
  - Se permite una fecha ya pasada (entra directo como vencido). Se permiten nombres repetidos (lotes distintos).
- **Tocar un ingrediente** abre una hoja con acciones de un solo toque:
  - **Queda poco:** `nivel = poco` y se agrega a la lista de compras (origen `poco`), sin duplicar.
  - **Se acabó:** se archiva (`motivo = acabado`), sale de la despensa y se agrega a la lista de compras (origen `acabado`).
  - **Lo volví a comprar:** renueva el ingrediente (`nivel = lleno`, pide nueva fecha si es perecedero, reinicia
    `aviso1` y `aviso2`, y lo quita de la lista de compras si estaba).
  - **Botar** (para vencidos): se archiva con `motivo = botado`. **No** se agrega a la lista de compras.
  - **Editar** y **Eliminar** (por error; borra sin dejar registro).
  - Al agregar a la lista de compras sale un aviso con "Deshacer".

### 8.4 Recetas
- **Catálogo base** de 28 recetas (sección 12): platos, bebidas, aderezos y salsas. **Recetas propias** de la familia:
  crear, editar y borrar solo las propias.
- Cada receta muestra: categoría, ingredientes (con la cantidad como texto informativo), pasos y porciones.
- **Cómo se decide qué ingredientes hay.** Un ingrediente de la receta está **disponible** si existe en la despensa
  un ingrediente activo con el mismo nombre normalizado (minúsculas, sin tildes, singular simple, usando los alias del
  catálogo), que **no esté vencido**. Si está en "Queda poco" cuenta como disponible, con una nota.
  Los ingredientes marcados `opcional` nunca cuentan como faltantes. `agua` y `sal` se consideran siempre disponibles.
- **Vista "¿Qué puedo cocinar?":**
  - Grupo **Puedes hacerla** (0 faltantes) y grupo **Casi** (1 o 2 faltantes, indicando cuáles). Botón "Ver todas".
  - Orden dentro de cada grupo: primero las que usan más ingredientes por vencer, con peso 3 por cada ingrediente
    urgente y 2 por cada uno "pronto"; después menos faltantes; después nombre.
  - Botón **"Agregar faltantes a la lista de compras"** (origen `receta`).
- No hay descuento automático: al cocinar no se toca el inventario. Opcional (fase 4): casilla "¿Se acabó algo?"
  en la receta con sus ingredientes para marcarlos de una vez; se puede ignorar.

### 8.5 Compras
- Lista de lo pendiente y de lo ya comprado (tachado). Se llena sola con "Queda poco", "Se acabó" y las recetas, o a mano.
- **Marcar como comprado:** ofrece pasarlo a la despensa (pide cantidad, unidad, y fecha o "No perecedero") o solo
  tacharlo. Botón para limpiar lo ya comprado.

### 8.6 Ajustes
- Días de los dos avisos (5 y 2 por defecto).
- Botón **"Activar avisos en este teléfono"** y lista de dispositivos suscritos con opción de quitarlos.

### 8.7 Experiencia de uso (UX)
- Pensada primero para celular (se usa en la cocina) y también cómoda en computador.
- Botones de al menos 44 px de alto, textos grandes, una acción principal clara por pantalla.
- Mensajes de error y estados vacíos en español natural, nunca técnicos
  (por ejemplo "Algo salió mal, intenta de nuevo").
- Reusar el sistema de diseño de FoodData (variables `--color-*` de `styles.css`) con clases propias prefijadas `.fs-`
  para no chocar con los estilos existentes. Respetar accesibilidad: foco visible, `Esc` cierra hojas y modales,
  `prefers-reduced-motion`.

## 9. API

Todo `/api/despensa` exige sesión de empresa con el módulo; si no, responde `404` (`contexto.soloHogar`).

- `GET /estado` — todo lo que pinta la página: `ingredientes` (con `estado` y `dias`), `compras`, `recetas` (base + propias ya evaluadas y ordenadas), `ajustes`, `resumen`, `sugerencias` (ids de receta)
- `GET /catalogo`, `GET /insignia` (la usa el botón del menú)
- `POST /ingredientes` (acepta `compraId` para tacharlo de compras), `PUT /ingredientes/:id`, `DELETE /ingredientes/:id`
- `POST /ingredientes/:id/poco|acabado|botado|recomprado|restaurar` — devuelven `antes` y `compraId` para poder deshacer
- `POST /acabados { ids }` — "¿Se acabó algo al cocinar?"
- `POST /compras`, `PUT /compras/:id { hecho }`, `DELETE /compras/:id`, `POST /compras/restaurar`, `POST /compras/limpiar`
- `POST /recetas`, `DELETE /recetas/:id` (solo propias), `POST /recetas/:id/faltantes`
- `PUT /ajustes { diasAviso1, diasAviso2 }` (reinicia las marcas de aviso)
- `GET /avisos/clave`, `GET /avisos/dispositivos`, `POST /avisos/suscribir`, `DELETE /avisos/dispositivos/:id`, `POST /avisos/prueba`
- `POST /avisos/ejecutar` — **sin sesión**, con `Authorization: Bearer FOODSAVER_AVISOS_TOKEN`; sin token correcto responde 404

Panel secreto (bajo `/api/superadmin`, en `rutas/hogares.js`): `POST /verificar-campo` (responde `{ ok: false }` sin mensaje si el código no sirve; limitado a 10 intentos fallidos por 15 min), `GET /oculto/panel.js`, `GET/POST /oculto/hogares`, `PUT/DELETE /oculto/hogares/:id`, `POST /oculto/salir`. Sin el desbloqueo todo responde 404.

Páginas: `GET /despensa` y `GET /despensa/app.js|estilos.css` (con módulo; si no, el 404 normal de Express). `GET /sw-avisos.js` es público.

Errores de validación: `400 { "error": "mensaje amable en español" }`. Todo texto del usuario se muestra con
`textContent` o escapado. Sin scripts inline (CSP de FoodData).

## 10. Avisos de vencimiento

### Dentro de la app (siempre)
Franja en "Hoy" y en la lista, e insignia en el botón del menú. Se calculan en cada carga con la fecha de Bogotá; no
dependen de las marcas `aviso1` y `aviso2`.

### Notificaciones al celular (fase 5, con prueba previa)
- Tecnología: **Web Push** (estándar, con claves VAPID). En iPhone solo funciona con la web **instalada en la pantalla
  de inicio** (iOS 16.4 o superior). La familia usa iPhone con iOS 26 y 27 y ya tiene FoodData instalado, y el módulo
  vive en el mismo origen, así que sirve la misma app instalada.
- El permiso se pide con un toque del usuario ("Activar avisos en este teléfono"), nunca automáticamente.
- Variables de entorno: `FOODSAVER_VAPID_PUBLICA`, `FOODSAVER_VAPID_PRIVADA`, `FOODSAVER_VAPID_CONTACTO`
  (un `mailto:`), `FOODSAVER_AVISOS_TOKEN`, `FOODSAVER_CODIGO`.
- **Service worker:** `sw.js` de FoodData importa `/sw-avisos.js` dentro de `try/catch`, para que un fallo **nunca**
  rompa el service worker de FoodData. `sw-avisos.js` es público a propósito (el navegador debe poder bajarlo sin
  sesión), no contiene datos ni la palabra "foodsaver", y solo maneja `push` y `notificationclick`.
  **Siempre** muestra una notificación al recibir un push (iOS cancela la suscripción si llegan avisos silenciosos).
  Al tocar el aviso abre `/despensa`.
- **Tarea programada:** workflow de GitHub Actions todos los días a las 12:00 UTC (7:00 am en Colombia; puede
  retrasarse unos minutos) que llama a `POST /api/despensa/avisos/ejecutar`. Despierta a Render si está dormido.
- **Lógica diaria por hogar** (máximo dos notificaciones por hogar y por día):
  - **Aviso 1** (a `diasAviso1` días o menos): ingredientes perecederos activos con `d <= diasAviso1`, `d > diasAviso2`
    y `aviso1 = false`. Mensaje: "3 productos vencen pronto: leche, queso, pollo".
  - **Aviso 2** (a `diasAviso2` días o menos): `0 <= d <= diasAviso2` y `aviso2 = false`. Mensaje más urgente.
  - Algo que se agrega ya con 1 día salta directo al aviso 2 (se marcan ambos).
  - Marcar `aviso1` o `aviso2` **después** de enviar a por lo menos un dispositivo; si el hogar no tiene dispositivos,
    no marcar. Es idempotente: ejecutar dos veces el mismo día no duplica avisos.
  - Si el servicio de notificaciones responde 404 o 410, borrar esa suscripción.
  - El título de la notificación es el `NOMBRE_MODULO`, nunca "FoodData" ni "Food Saver".

### Fase 0 — prueba mínima antes de construir
Antes de invertir tiempo, comprobar que llegan notificaciones a **los dos iPhones**: un botón temporal
(solo con el marcador secreto, en una rama) que suscribe el dispositivo y manda una notificación de prueba, con la
app cerrada. Si funciona, se sigue con la fase 5. Si no, el módulo se queda con los avisos dentro de la app.

## 11. Seguridad

- `empresa_id` siempre desde la sesión (`contexto.js`). Probar con tests que un hogar no puede leer ni modificar
  ingredientes, compras ni recetas de otro hogar.
- Validar todo en el servidor; los datos de entrada se recortan y se limita su largo. Consultas siempre con el
  esquema de Mongoose (el middleware anti-NoSQL de FoodData ya limpia `$` y `.`).
- Limitar las peticiones del panel secreto, del disparador de avisos y de la suscripción a notificaciones.
- Nunca registrar en logs el código secreto, tokens ni claves. Los errores se registran con el logger de FoodData.
- Las claves VAPID, el token y el código solo en variables de entorno. Si hay que rotarlos, se cambia el valor en
  `.env` y en Render.
- Cuidar que ni los mensajes de error ni las respuestas revelen que el módulo existe (por ejemplo `404`, no `403`).

## 12. Recetas base (mínimo 24, objetivo 28)

Archivo `datos/recetas-base.js`: cada receta con `id`, `nombre`, `categoria`, `ingredientes` (`nombre`,
`texto` de cantidad, `opcional`), `pasos` (3 a 7, en español colombiano claro) y `porciones`.
Complementar con `datos/catalogo-ingredientes.js` (unos 120 ingredientes comunes en hogares colombianos):
`nombre`, `alias`, `perecedero` por defecto, `ubicacion` por defecto, y `basico` para sal y agua.
Los nombres de ingredientes de las recetas deben coincidir con el catálogo para que el cruce funcione.

**Salsas y aderezos (6):** Hogao colombiano · Ají colombiano (picante) · Guacamole · Salsa rosada · Chimichurri ·
Salsa de tomate casera.

**Bebidas (8):** Jugo de lulo · Jugo de maracuyá · Jugo de mora en leche · Jugo de guanábana · Limonada de coco ·
Aguapanela con limón · Jugo de corozo · Avena fría.

**Platos (12):** Arroz con huevo · Huevos pericos · Sudado de pollo · Arroz con pollo · Sopa de lentejas ·
Frijoles con arroz (calentado) · Patacones con hogao · Tortilla de papa · Pasta con salsa de tomate ·
Carne molida guisada · Arepa con queso · Crema de ahuyama.

**Postre (2):** Arroz con leche · Plátano maduro al horno con queso.

Las recetas deben ser reales y sencillas; si hay dudas sobre una receta, preguntar al usuario en lugar de inventar.

## 13. Estado de la construcción

Se construyó todo de una vez (decisión del usuario, 2026-11-12), sin fases: despensa, estados, acciones de un toque, Hoy,
recetas base y propias, compras, ajustes, avisos (servidor, service worker, tarea diaria), panel Hogares, portada y botón del menú.
También en `main` directamente (decisión del usuario), sin rama aparte. Nada se ha subido a GitHub ni desplegado.

Lo que **no** se pudo probar todavía:
- Notificaciones en los iPhones reales: el navegador de pruebas no registra service workers. Probar con la app instalada.
- La tarea de GitHub Actions contra producción.

## 14. Forma de trabajar y estilo de código

- Rama `feature/foodsaver`. Commits pequeños y claros. No tocar `main` ni desplegar sin pasar `npm test` y sin revisar
  el resultado con el usuario.
- Cada vez que se toque un archivo de FoodData fuera de `modulos/foodsaver/`, marcarlo con `// foodsaver:contacto` y
  mantener actualizada la tabla de la sección 4.
- **Pruebas** (Jest + Supertest + Mongo en memoria, como el resto de FoodData; se pueden reusar `tests/setup.js` y
  `tests/helpers.js` de la raíz): aislamiento entre hogares; la empresa oculta no sale en la lista normal;
  código malo no desbloquea y código correcto sí; el módulo responde `404` sin permiso; cálculo de estados con
  la zona horaria de Bogotá (incluido el cambio de día); cruce y orden de recetas; avisos sin repetir; "Se acabó" y
  "Queda poco" llenan la lista de compras sin duplicar.
- Fechas con `America/Bogota`. Helper `hoyColombia()` con `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' })`
  y `diasHasta(fecha)` calculando con medianoche UTC de cada fecha `AAAA-MM-DD` para evitar errores de horario.
- Estilo: código claro, funciones cortas con una sola responsabilidad, comentarios breves en español que expliquen el
  porqué (no el qué), sin validaciones exageradas, errores del servidor con el logger de FoodData.
- Interfaz en español con ñ y tildes; identificadores y campos de base de datos sin tildes.

## 15. Separar el módulo de FoodData (si algún día se vende uno de los dos)

1. Borrar `modulos/foodsaver/`.
2. Deshacer los 10 puntos de contacto de la sección 4 (buscar `foodsaver:contacto` en el servidor; los públicos están listados en la tabla).
3. Quitar las variables `FOODSAVER_*` del entorno y la dependencia `web-push` si ya nadie la usa.
4. Las colecciones `Fs*` de MongoDB se exportan antes (backup) y se pueden borrar de FoodData.
5. Para llevar el módulo como producto aparte: copiar la carpeta a un proyecto nuevo y reemplazar solo `contexto.js`
   por el login y las sesiones del nuevo proyecto.

## 16. Para ponerlo en producción

1. Variables en Render (y en `.env` local si se quiere probar):
   - `FOODSAVER_CODIGO`: el código secreto del panel (4 a 64 caracteres, sin `/`). Lo decide el usuario; no se escribe en ningún archivo del repo.
   - `FOODSAVER_VAPID_PUBLICA` y `FOODSAVER_VAPID_PRIVADA`: se generan una sola vez con `npx web-push generate-vapid-keys`. Si se cambian, cada teléfono tiene que volver a activar los avisos.
   - `FOODSAVER_VAPID_CONTACTO`: `mailto:` de contacto (opcional, por defecto `mailto:avisos@fooddata.me`).
   - `FOODSAVER_AVISOS_TOKEN`: un texto largo al azar. El mismo valor va como secreto `FOODSAVER_AVISOS_TOKEN` en GitHub (Settings → Secrets → Actions).
2. Subir a GitHub y desplegar (Render despliega solo desde `main`).
3. Entrar al superadmin, escribir el código en "Google Sheets" del formulario de crear empresa, y crear el hogar con su foto (`assets/logo-hogar.jpeg`).
4. En cada iPhone: abrir FoodData desde el ícono de la pantalla de inicio, entrar con la cuenta del hogar, Ajustes → "Activar avisos en este teléfono" → "Enviar un aviso de prueba".
5. Probar la tarea a mano: GitHub → Actions → "Avisos del hogar" → Run workflow.

Probar en local sin tocar Atlas: las pruebas (`npx jest modulos/foodsaver --runInBand`) usan Mongo en memoria.
