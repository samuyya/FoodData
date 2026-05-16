async function conBotonCargando(boton, textoCargando, accion) {
  if (!boton) return accion();
  const textoOriginal = boton.textContent;
  const estabaDeshabilitado = boton.disabled;
  boton.disabled = true;
  boton.textContent = textoCargando;
  try {
    return await accion();
  } finally {
    boton.textContent = textoOriginal;
    boton.disabled = estabaDeshabilitado;
  }
}
