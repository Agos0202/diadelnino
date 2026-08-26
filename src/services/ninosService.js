import { assertSupabaseConfigured } from '../supabaseClient';

const TABLA_NINOS = 'diadelnino';

export const SEXOS_VALIDOS = ['Femenino', 'Masculino', 'Otro'];

export const normalizarDni = (value) => {
  return String(value ?? '')
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/[^0-9]/g, '');
};

export const validarDni = (dni) => {
  const dniNormalizado = normalizarDni(dni);

  if (!dniNormalizado) {
    throw new Error('El DNI es obligatorio.');
  }

  if (dniNormalizado.length < 7 || dniNormalizado.length > 9) {
    throw new Error('El DNI debe tener entre 7 y 9 números.');
  }

  return dniNormalizado;
};

export const normalizarTexto = (value) => String(value ?? '').trim();

export const normalizarDiscapacidad = (value) => {
  const texto = normalizarTexto(value).toLowerCase();
  return ['si', 'sí', 'true', '1', 'x', 'verdadero'].includes(texto);
};

export const prepararNinoParaGuardar = (nino) => {
  const dni = validarDni(nino?.dni);

  return {
    nombre: normalizarTexto(nino?.nombre),
    apellido: normalizarTexto(nino?.apellido),
    dni,
    edad: Number.parseInt(nino?.edad, 10),
    sexo: SEXOS_VALIDOS.includes(nino?.sexo) ? nino.sexo : 'Otro',
    barrio_id: normalizarTexto(nino?.barrio_id),
    nombre_tutor: normalizarTexto(nino?.nombre_tutor),
    observaciones: normalizarTexto(nino?.observaciones),
    discapacidad: normalizarDiscapacidad(nino?.discapacidad),
  };
};

export const validarNinoFormulario = (nino) => {
  const nombre = normalizarTexto(nino?.nombre);
  const apellido = normalizarTexto(nino?.apellido);
  const edad = Number.parseInt(nino?.edad, 10);
  const sexo = nino?.sexo;
  const barrioId = normalizarTexto(nino?.barrio_id);

  if (!nombre) {
    throw new Error('El nombre es obligatorio.');
  }

  if (!apellido) {
    throw new Error('El apellido es obligatorio.');
  }

  validarDni(nino?.dni);

  if (!Number.isInteger(edad) || edad < 0 || edad > 17) {
    throw new Error('La edad debe ser un número entero entre 0 y 17 años.');
  }

  if (!sexo || !SEXOS_VALIDOS.includes(sexo)) {
    throw new Error('Debe seleccionar un sexo válido.');
  }

  if (!barrioId) {
    throw new Error('Debe seleccionar un barrio.');
  }

  return prepararNinoParaGuardar(nino);
};

export const parsearCsv = (contenido) => {
  const lineas = contenido
    .split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter(Boolean);

  if (lineas.length < 2) {
    throw new Error('El CSV no tiene filas de datos.');
  }

  const delimitador = lineas[0].includes(';') && !lineas[0].includes(',') ? ';' : ',';
  const limpiarCabecera = (valor) => valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const parsearLinea = (linea) => {
    let valorActual = '';
    let dentroDeComillas = false;
    const columnas = [];

    for (let i = 0; i < linea.length; i += 1) {
      const caracter = linea[i];

      if (caracter === '"') {
        if (dentroDeComillas && linea[i + 1] === '"') {
          valorActual += '"';
          i += 1;
        } else {
          dentroDeComillas = !dentroDeComillas;
        }
        continue;
      }

      if (caracter === delimitador && !dentroDeComillas) {
        columnas.push(valorActual.trim());
        valorActual = '';
        continue;
      }

      valorActual += caracter;
    }

    columnas.push(valorActual.trim());
    return columnas;
  };

  const encabezados = parsearLinea(lineas[0]).map(limpiarCabecera);

  return lineas.slice(1).map((linea) => {
    const valores = parsearLinea(linea);
    const fila = {};

    encabezados.forEach((encabezado, index) => {
      fila[encabezado] = valores[index] || '';
    });

    return fila;
  });
};

export const normalizarFilaNinoDesdeCsv = (fila) => ({
  nombre: fila.nombre || fila.nombre_nino || fila.first_name || '',
  apellido: fila.apellido || fila.apellido_nino || fila.last_name || '',
  dni: fila.dni || fila.documento || fila.documento_nro || '',
  edad: fila.edad || fila.age || fila._edad || '0',
  sexo: fila.sexo || fila.genero || 'Masculino',
  barrio: fila.barrio || fila.barrio_id || fila.barrio_nombre || '',
  barrio_id: fila.barrio_id || fila.barrio || fila.barrio_nombre || '',
  nombre_tutor: fila.nombre_tutor || fila.tutor || fila.tutor_nombre || '',
  observaciones: fila.observaciones || fila.observacion || '',
  discapacidad: fila.discapacidad || fila.tiene_discapacidad || '',
});

const mapRowToNino = (row) => ({
  ...row,
  id: row.id || row.uuid || row._id,
  dni: normalizarDni(row.dni ?? row.documento ?? row.dni_nino),
  nombre: normalizarTexto(row.nombre ?? row.nombre_nino),
  apellido: normalizarTexto(row.apellido ?? row.apellido_nino),
  sexo: row.sexo || 'Otro',
  edad: Number.parseInt(row.edad ?? row.age, 10) || 0,
  barrio_id: normalizarTexto(row.barrio_id || row.barrio),
  nombre_tutor: normalizarTexto(row.nombre_tutor ?? row.tutor ?? row.tutor_nombre),
  observaciones: normalizarTexto(row.observaciones ?? row.observacion),
  discapacidad: Boolean(row.discapacidad),
});

export const verificarDniDuplicado = async (dni, excluirId = null) => {
  const dniNormalizado = normalizarDni(dni);

  if (!dniNormalizado) {
    return false;
  }

  const client = assertSupabaseConfigured();
  const { data, error } = await client
    .from(TABLA_NINOS)
    .select('id, dni')
    .eq('dni', dniNormalizado)
    .limit(1);

  if (error) {
    throw error;
  }

  if (!data || data.length === 0) {
    return false;
  }

  return data.some((row) => !(excluirId && row.id === excluirId));
};

const TAMANO_PAGINA = 1000;

const obtenerTodasLasFilas = async (client, aplicarFiltros) => {
  const filas = [];
  let desde = 0;

  while (true) {
    let query = client.from(TABLA_NINOS).select('*');
    if (aplicarFiltros) {
      query = aplicarFiltros(query);
    }

    const { data, error } = await query
      .order('apellido', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error) {
      throw error;
    }

    const filasObtenidas = data || [];
    filas.push(...filasObtenidas);

    if (filasObtenidas.length === 0) {
      break;
    }

    desde += filasObtenidas.length;
  }

  return filas;
};

export const obtenerNinos = async () => {
  const client = assertSupabaseConfigured();
  const filas = await obtenerTodasLasFilas(client);
  return filas.map(mapRowToNino);
};

export const listarNinos = obtenerNinos;

export const obtenerNinoPorId = async (id) => {
  const client = assertSupabaseConfigured();
  const { data, error } = await client
    .from(TABLA_NINOS)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapRowToNino(data) : null;
};

export const crearNino = async (nino) => {
  const payload = validarNinoFormulario(nino);
  const client = assertSupabaseConfigured();

  const { data: existente, error: errorExistente } = await client
    .from(TABLA_NINOS)
    .select('id')
    .eq('dni', payload.dni)
    .maybeSingle();

  if (errorExistente) {
    throw errorExistente;
  }

  if (existente) {
    throw new Error('Ya existe un niño registrado con ese DNI.');
  }

  const { data, error } = await client
    .from(TABLA_NINOS)
    .insert({
      nombre: payload.nombre,
      apellido: payload.apellido,
      dni: payload.dni,
      edad: payload.edad,
      sexo: payload.sexo,
      barrio: payload.barrio_id || null,
      nombre_tutor: payload.nombre_tutor || null,
      observaciones: payload.observaciones || null,
      discapacidad: payload.discapacidad,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapRowToNino(data);
};

export const guardarNino = crearNino;

const TAMANO_LOTE_INSERCION = 500;

const dividirEnLotes = (items, tamano) => {
  const lotes = [];
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano));
  }
  return lotes;
};

export const crearNinosEnLote = async (ninos) => {
  const client = assertSupabaseConfigured();
  const insertados = [];
  const fallidos = [];
  const filasParaInsertar = [];

  ninos.forEach((nino) => {
    try {
      const payload = validarNinoFormulario(nino);
      filasParaInsertar.push({
        nombre: payload.nombre,
        apellido: payload.apellido,
        dni: payload.dni,
        edad: payload.edad,
        sexo: payload.sexo,
        barrio: payload.barrio_id || null,
        nombre_tutor: payload.nombre_tutor || null,
        observaciones: payload.observaciones || null,
        discapacidad: payload.discapacidad,
      });
    } catch (error) {
      fallidos.push({ nino, message: error.message || 'Registro inválido.' });
    }
  });

  const lotes = dividirEnLotes(filasParaInsertar, TAMANO_LOTE_INSERCION);

  for (const lote of lotes) {
    const { data, error } = await client.from(TABLA_NINOS).insert(lote).select();

    if (!error) {
      insertados.push(...(data || []).map(mapRowToNino));
      continue;
    }

    // El lote completo falló (p. ej. un DNI duplicado dentro del lote):
    // se reintenta fila por fila para no perder el resto de los registros válidos.
    for (const fila of lote) {
      const { data: filaInsertada, error: errorFila } = await client
        .from(TABLA_NINOS)
        .insert(fila)
        .select()
        .single();

      if (errorFila) {
        fallidos.push({ nino: fila, message: errorFila.message || 'No se pudo importar el registro.' });
      } else {
        insertados.push(mapRowToNino(filaInsertada));
      }
    }
  }

  return { insertados, fallidos };
};

export const actualizarNino = async (id, nino) => {
  const payload = validarNinoFormulario(nino);
  const client = assertSupabaseConfigured();

  const { data: existente, error: errorExistente } = await client
    .from(TABLA_NINOS)
    .select('id')
    .eq('dni', payload.dni)
    .neq('id', id)
    .maybeSingle();

  if (errorExistente) {
    throw errorExistente;
  }

  if (existente) {
    throw new Error('Ya existe otro niño registrado con ese DNI.');
  }

  const { data, error } = await client
    .from(TABLA_NINOS)
    .update({
      nombre: payload.nombre,
      apellido: payload.apellido,
      dni: payload.dni,
      edad: payload.edad,
      sexo: payload.sexo,
      barrio: payload.barrio_id || null,
      nombre_tutor: payload.nombre_tutor || null,
      observaciones: payload.observaciones || null,
      discapacidad: payload.discapacidad,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapRowToNino(data);
};

export const eliminarNino = async (id) => {
  const client = assertSupabaseConfigured();
  const { error } = await client
    .from(TABLA_NINOS)
    .delete()
    .eq('id', id);

  if (error) {
    throw error;
  }

  return true;
};

const TAMANO_LOTE_ELIMINACION = 100;

export const eliminarNinosEnLote = async (ids) => {
  const client = assertSupabaseConfigured();
  const idsValidos = (ids || []).map((id) => String(id ?? '').trim()).filter(Boolean);
  const eliminados = [];
  const fallidos = [];

  const lotes = dividirEnLotes(idsValidos, TAMANO_LOTE_ELIMINACION);

  for (const lote of lotes) {
    const { error } = await client.from(TABLA_NINOS).delete().in('id', lote);

    if (!error) {
      eliminados.push(...lote);
      continue;
    }

    // El lote falló: se reintenta id por id para no perder las eliminaciones válidas del resto.
    for (const id of lote) {
      const { error: errorId } = await client.from(TABLA_NINOS).delete().eq('id', id);
      if (errorId) {
        fallidos.push({ id, message: errorId.message || 'No se pudo eliminar el registro.' });
      } else {
        eliminados.push(id);
      }
    }
  }

  return { eliminados, fallidos };
};

export const buscarNinos = async (termino) => {
  const texto = normalizarTexto(termino).toLowerCase();

  if (!texto) {
    return obtenerNinos();
  }

  const client = assertSupabaseConfigured();
  const filas = await obtenerTodasLasFilas(client, (query) =>
    query.or(`apellido.ilike.%${texto}%,nombre.ilike.%${texto}%,dni.ilike.%${texto}%`)
  );

  return filas.map(mapRowToNino);
};
