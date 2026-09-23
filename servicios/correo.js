// envio de correo, gateado por SMTP_HOST -- si no esta configurado, la app
// sigue funcionando igual (mismo criterio que Google Sheets o Cloudinary sin
// credenciales), solo que el boton de "enviar por correo" avisa que falta.
const nodemailer = require('nodemailer');
const logger = require('../logger');
const { construirPdfInspeccion } = require('./pdfInspeccion');

const disponible = !!process.env.SMTP_HOST;
let transporter = null;

if (disponible) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: parseInt(process.env.SMTP_PORT, 10) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

function estaDisponible() { return disponible; }

const NOMBRES_CARPETA = { cocina: 'Cocina', salon: 'Salón', administracion: 'Administración' };
const ICONOS_CARPETA = { cocina: '🍳', salon: '🪑', administracion: '🔒' };

function escaparHtml(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// mismo tamaño compacto que ya usamos al imprimir (@media print en styles.css) --
// en px en vez de rem porque algunos clientes de correo (Outlook viejo, sobre todo)
// no resuelven bien las unidades relativas en estilos inline
function tablaFormato(formato) {
  const encabezados = formato.columnas.map(c => `<th style="border:1px solid #ccc;padding:2px 5px;background:#ecf9f5;text-align:left;font-size:10px;line-height:1.15;">${escaparHtml(c.header)}</th>`).join('');
  const filas = formato.filas.map(f => {
    const celdas = formato.columnas.map(c => `<td style="border:1px solid #ccc;padding:2px 5px;font-size:11px;line-height:1.15;">${escaparHtml(f[c.key])}</td>`).join('');
    return `<tr>${celdas}</tr>`;
  }).join('');

  return `
    <h3 style="margin:24px 0 4px;color:#0e3a31;">${escaparHtml(formato.titulo)}</h3>
    <p style="margin:0 0 8px;color:#555;font-size:13px;font-style:italic;">${escaparHtml(formato.plan)} · ${escaparHtml(formato.programa)} · Código ${escaparHtml(formato.codigo)}</p>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>${encabezados}</tr></thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function construirHtmlInspeccion({ empresaNombre, anio, mes, carpetas }) {
  const bloques = carpetas.map(c => `
    <h2 style="color:#16c2a3;border-bottom:2px solid #a4ddcd;padding-bottom:4px;">${ICONOS_CARPETA[c.clave] || ''} ${escaparHtml(c.nombre)}</h2>
    ${c.formatos.map(tablaFormato).join('')}
  `).join('');

  return `
    <div style="font-family:Arial,sans-serif;color:#222;">
      <h1 style="color:#0e3a31;">Formatos de ${escaparHtml(empresaNombre)} — ${NOMBRES_MES[mes - 1]} ${anio}</h1>
      <p>Generado desde FoodData para inspección de sanidad.</p>
      ${bloques}
    </div>
  `;
}

async function enviarInspeccion(destinatario, datos) {
  const html = construirHtmlInspeccion(datos);
  // el pdf va adjunto para que a quien reciba el correo le sea facil imprimirlo
  // de una, sin depender de que su cliente de correo respete el html del cuerpo
  const pdf = await construirPdfInspeccion(datos);
  const nombreArchivo = `Formatos ${datos.empresaNombre} - ${NOMBRES_MES[datos.mes - 1]} ${datos.anio}.pdf`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: destinatario,
    subject: `Formatos de ${datos.empresaNombre} — ${NOMBRES_MES[datos.mes - 1]} ${datos.anio}`,
    html,
    attachments: [{ filename: nombreArchivo, content: pdf, contentType: 'application/pdf' }]
  });
  logger.info(`correo de inspeccion enviado a ${destinatario}`);
}

module.exports = { estaDisponible, enviarInspeccion };
