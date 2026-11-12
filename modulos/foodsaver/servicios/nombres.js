// para comparar nombres de ingredientes escritos de formas distintas:
// "Limones" = "limón", "Cebolla de rama" = "cebolla larga", "Leche entera" cuenta como "leche"
const CATALOGO = require('../datos/catalogo-ingredientes');

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// singular sencillo, palabra por palabra. no es perfecto, pero cubre lo que se escribe en una despensa
function singular(p) {
  if (p.length > 4 && /[lrndzj]es$/.test(p)) return p.slice(0, -2);
  if (p.length > 3 && p.endsWith('s') && !p.endsWith('ss')) return p.slice(0, -1);
  return p;
}

const clave = s => norm(s).split(' ').map(singular).join(' ');

const ALIAS = new Map();
CATALOGO.forEach(c => {
  const k = clave(c.nombre);
  ALIAS.set(k, k);
  c.alias.forEach(a => ALIAS.set(clave(a), k));
});

function canonico(s) {
  const k = clave(s);
  return ALIAS.get(k) || k;
}

// "leche" (de la receta) coincide con "Leche entera" (de la despensa), pero "tomate" no con "Salsa de tomate"
function coincide(deReceta, deDespensa) {
  const r = canonico(deReceta), d = canonico(deDespensa);
  return r === d || d.startsWith(r + ' ');
}

const BASICOS = new Set(['agua', 'sal'].map(canonico));
const esBasico = s => BASICOS.has(canonico(s));

function sugerenciaCatalogo(nombre) {
  const k = canonico(nombre);
  return CATALOGO.find(c => clave(c.nombre) === k) || null;
}

module.exports = { norm, canonico, coincide, esBasico, sugerenciaCatalogo, CATALOGO };
