const buscar = document.querySelector('#buscar-cliente');
const actualizar = document.querySelector('#actualizar-clientes');
const estado = document.querySelector('#estado-clientes');
const filas = document.querySelector('#filas-clientes');
const anterior = document.querySelector('#clientes-anterior');
const siguiente = document.querySelector('#clientes-siguiente');
const indicador = document.querySelector('#clientes-pagina');
let pagina = 0, demora, consulta;

async function consultar(paginaNueva = 0) {
  consulta?.abort();
  const solicitud = new AbortController();
  consulta = solicitud;
  anterior.disabled = siguiente.disabled = true;
  estado.textContent = 'Consultando el maestro…';
  try {
    const parametros = new URLSearchParams({ buscar: buscar.value, pagina: paginaNueva });
    const respuesta = await fetch('/api/clientes?' + parametros, { signal: solicitud.signal });
    const datos = await respuesta.json();
    if (solicitud.signal.aborted) return;
    if (!respuesta.ok) throw new Error(datos.error);
    const paginas = Math.max(1, Math.ceil(datos.total / 40));
    if (paginaNueva >= paginas) return consultar(paginas - 1);
    filas.replaceChildren();
    for (const cliente of datos.clientes) {
      const fila = filas.insertRow();
      fila.insertCell().textContent = cliente.codigo;
      fila.insertCell().textContent = cliente.nombres.join(' / ');
      const domicilios = fila.insertCell();
      for (const { codigo, direccion } of cliente.domicilios) {
        const linea = document.createElement('div');
        linea.textContent = [codigo || 'Sin código', direccion].filter(Boolean).join(' · ');
        domicilios.append(linea);
      }
      if (!cliente.domicilios.length) domicilios.textContent = 'Sin domicilios registrados';
    }
    pagina = paginaNueva;
    indicador.textContent = datos.total ? `Página ${pagina + 1} de ${paginas}` : '';
    anterior.disabled = pagina === 0;
    siguiente.disabled = pagina + 1 >= paginas;
    const cantidad = datos.total ? `${datos.total.toLocaleString('es-AR')} clientes encontrados` : 'No hay clientes que coincidan con la búsqueda';
    estado.textContent = `${cantidad} · Copia local del ${new Date(datos.fecha).toLocaleString('es-AR')}.`;
  } catch (error) {
    if (solicitud.signal.aborted) return;
    filas.replaceChildren();
    indicador.textContent = '';
    estado.textContent = error.message;
  }
}

buscar.addEventListener('input', () => {
  clearTimeout(demora);
  demora = setTimeout(() => consultar(), 250);
});
anterior.addEventListener('click', () => consultar(pagina - 1));
siguiente.addEventListener('click', () => consultar(pagina + 1));
actualizar.addEventListener('click', async () => {
  clearTimeout(demora);
  consulta?.abort();
  actualizar.disabled = buscar.disabled = anterior.disabled = siguiente.disabled = true;
  estado.textContent = 'Actualizando el maestro desde el FTP…';
  try {
    const respuesta = await fetch('/api/clientes/actualizar', { method: 'POST' });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error);
    await consultar();
  } catch (error) {
    await consultar(pagina);
    estado.textContent = `${error.message} ${estado.textContent}`;
  } finally {
    actualizar.disabled = buscar.disabled = false;
  }
});
consultar();
