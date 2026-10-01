const b = document.getElementById('copiar')
b.addEventListener('click', async () => {
  const txt = document.getElementById('correo').textContent
  try {
    await navigator.clipboard.writeText(txt)
    b.textContent = 'Copiado'
  } catch (e) {
    // si el navegador no deja, al menos queda seleccionado
    const r = document.createRange()
    r.selectNodeContents(document.getElementById('correo'))
    const s = getSelection(); s.removeAllRanges(); s.addRange(r)
    b.textContent = 'Selecciónalo y copia'
  }
  setTimeout(() => { b.textContent = 'Copiar' }, 2200)
})

// los interruptores de módulos solo son de muestra, no guardan nada
const switches = document.querySelectorAll('.switch')
function resumir() {
  const mods = ['Formatos', 'Programas']
  switches.forEach(s => { if (s.getAttribute('aria-checked') === 'true') mods.push(s.dataset.mod) })
  const ult = mods.pop()
  document.getElementById('resumen-mods').textContent = mods.join(', ') + ' y ' + ult + '.'
}
switches.forEach(s => s.addEventListener('click', () => {
  const on = s.getAttribute('aria-checked') !== 'true'
  s.setAttribute('aria-checked', on)
  s.closest('.mod').classList.toggle('apagado', !on)
  resumir()
}))
