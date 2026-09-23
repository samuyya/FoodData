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

function dibujarTabla(doc, columnas, filas) {
  const anchoUtil = doc.page.width - MARGEN * 2;
  const anchoCol = anchoUtil / columnas.length;
  const abajoPagina = doc.page.height - MARGEN;

  function dibujarEncabezado(y) {
    doc.font('Helvetica-Bold').fontSize(FUENTE_ENCABEZADO);
    let x = MARGEN;
    columnas.forEach(c => {
      doc.rect(x, y, anchoCol, 16).fill('#ecf9f5');
      doc.fillColor('#333').text(c.header, x + PAD_CELDA, y + 4, { width: anchoCol - PAD_CELDA * 2 });
      x += anchoCol;
    });
    return y + 16;
  }

  let y = dibujarEncabezado(doc.y);

  doc.font('Helvetica').fontSize(FUENTE_CELDA);
  filas.forEach(fila => {
    const alturas = columnas.map(c => doc.heightOfString(String(fila[c.key] ?? ''), { width: anchoCol - PAD_CELDA * 2 }));
    const altoFila = Math.max(14, ...alturas.map(h => h + PAD_CELDA * 2));

    if (y + altoFila > abajoPagina) {
      doc.addPage();
      y = dibujarEncabezado(MARGEN);
      doc.font('Helvetica').fontSize(FUENTE_CELDA);
    }

    let x = MARGEN;
    columnas.forEach(c => {
      doc.rect(x, y, anchoCol, altoFila).stroke('#cccccc');
      doc.fillColor('#222').text(String(fila[c.key] ?? ''), x + PAD_CELDA, y + PAD_CELDA, { width: anchoCol - PAD_CELDA * 2 });
      x += anchoCol;
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
