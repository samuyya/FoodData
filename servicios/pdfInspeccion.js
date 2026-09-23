// arma el PDF adjunto de "formatos para inspeccion" -- mismos datos que ya
// arma armarDatosInspeccion() en routes/registros.js, pero en PDF real para
// que a quien reciba el correo le sea facil imprimirlo (no depende de que
// el cliente de correo del destinatario respete el html/css del cuerpo)
const PDFDocument = require('pdfkit');

const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const MARGEN = 28;
const FUENTE_ENCABEZADO = 7;
const FUENTE_CELDA = 7.5;
const PAD_CELDA = 3;

// el ancho de cada columna sale de "width" (el mismo dato que ya trae cada
// columna desde columnasYFila() en servicios/excel.js, pensado originalmente
// para Excel) en vez de repartir el ancho parejo entre todas -- si no,
// "Fecha" quedaba tan angosta como "Olor" y el texto se envolvia de mas
function dibujarTabla(doc, columnas, filas) {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const pesoTotal = columnas.reduce((s, c) => s + (c.width || 15), 0);
  const anchos = columnas.map(c => (c.width || 15) / pesoTotal * anchoUtil);
  const abajoPagina = doc.page.height - MARGEN;

  function dibujarEncabezado(y) {
    doc.font('Helvetica-Bold').fontSize(FUENTE_ENCABEZADO);
    const altos = columnas.map((c, i) => doc.heightOfString(c.header, { width: anchos[i] - PAD_CELDA * 2 }));
    const alto = Math.max(16, ...altos.map(h => h + PAD_CELDA * 2));
    let x = MARGEN;
    columnas.forEach((c, i) => {
      doc.rect(x, y, anchos[i], alto).fill('#ecf9f5');
      doc.fillColor('#333').text(c.header, x + PAD_CELDA, y + PAD_CELDA, { width: anchos[i] - PAD_CELDA * 2 });
      x += anchos[i];
    });
    return y + alto;
  }

  let y = dibujarEncabezado(doc.y);

  doc.font('Helvetica').fontSize(FUENTE_CELDA);
  filas.forEach(fila => {
    const alturas = columnas.map((c, i) => doc.heightOfString(String(fila[c.key] ?? ''), { width: anchos[i] - PAD_CELDA * 2 }));
    const altoFila = Math.max(14, ...alturas.map(h => h + PAD_CELDA * 2));

    if (y + altoFila > abajoPagina) {
      doc.addPage();
      y = dibujarEncabezado(MARGEN);
      doc.font('Helvetica').fontSize(FUENTE_CELDA);
    }

    let x = MARGEN;
    columnas.forEach((c, i) => {
      doc.rect(x, y, anchos[i], altoFila).stroke('#cccccc');
      doc.fillColor('#222').text(String(fila[c.key] ?? ''), x + PAD_CELDA, y + PAD_CELDA, { width: anchos[i] - PAD_CELDA * 2 });
      x += anchos[i];
    });
    y += altoFila;
  });

  doc.y = y + 10;
}

function construirPdfInspeccion({ empresaNombre, anio, mes, carpetas }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGEN });
    const partes = [];
    doc.on('data', p => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0e3a31')
      .text(`Formatos de ${empresaNombre}`, MARGEN, MARGEN);
    doc.font('Helvetica').fontSize(11).fillColor('#555')
      .text(`${NOMBRES_MES[mes - 1]} de ${anio} · generado por FoodData para inspección de sanidad`);

    carpetas.forEach(c => {
      c.formatos.forEach(formato => {
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#0e3a31').text(`${c.nombre} — ${formato.titulo}`);
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666')
          .text(`${formato.plan} · ${formato.programa} · Código ${formato.codigo}`);
        doc.moveDown(0.5);
        dibujarTabla(doc, formato.columnas, formato.filas);
      });
    });

    doc.end();
  });
}

module.exports = { construirPdfInspeccion };
