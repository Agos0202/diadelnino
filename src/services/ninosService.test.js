import {
  guardarNino,
  normalizarDni,
  validarDni,
  prepararNinoParaGuardar,
  parsearCsv,
  normalizarFilaNinoDesdeCsv,
} from './ninosService';

describe('ninosService', () => {
  test('normaliza un DNI con puntos y espacios', () => {
    expect(normalizarDni('12.345.678')).toBe('12345678');
    expect(normalizarDni(' 12345678 ')).toBe('12345678');
  });

  test('valida DNI vacío y duplicado', () => {
    expect(() => validarDni('')).toThrow('El DNI es obligatorio.');
    expect(() => validarDni('12345678')).not.toThrow();
  });

  test('prepara el payload y guarda nombre y apellido limpios', () => {
    const payload = prepararNinoParaGuardar({
      nombre: '  Ana  ',
      apellido: '  Pérez ',
      dni: '12.345.678',
      edad: '8',
      sexo: 'Femenino',
      barrio_id: 'barrio-1',
      nombre_tutor: ' María ',
      observaciones: '  Niño puntual ',
    });

    expect(payload.nombre).toBe('Ana');
    expect(payload.apellido).toBe('Pérez');
    expect(payload.dni).toBe('12345678');
    expect(payload.edad).toBe(8);
    expect(payload.sexo).toBe('Femenino');
    expect(payload.observaciones).toBe('Niño puntual');
  });

  test('parsea un CSV con cabeceras y filas de niños', () => {
    const csv = [
      'nombre,apellido,dni,edad,sexo,barrio_id,nombre_tutor,observaciones',
      'Ana,Perez,12345678,8,Femenino,la-florida,María,Revisar',
      'Luis,Gomez,98765432,7,Masculino,luisiana,Pedro,',
    ].join('\n');

    const filas = parsearCsv(csv);
    expect(filas).toHaveLength(2);
    expect(normalizarFilaNinoDesdeCsv(filas[0])).toMatchObject({
      nombre: 'Ana',
      apellido: 'Perez',
      dni: '12345678',
      edad: '8',
      sexo: 'Femenino',
      barrio_id: 'la-florida',
      nombre_tutor: 'María',
    });
  });

  test('lanza un error claro si Supabase no está configurado', async () => {
    const originalUrl = process.env.REACT_APP_SUPABASE_URL;
    const originalKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

    process.env.REACT_APP_SUPABASE_URL = '';
    process.env.REACT_APP_SUPABASE_ANON_KEY = '';

    try {
      await expect(guardarNino({
        nombre: 'Ana',
        apellido: 'Pérez',
        dni: '12.345.678',
        edad: '8',
        sexo: 'Femenino',
        barrio_id: 'la-florida',
        nombre_tutor: 'María',
        observaciones: 'Sin conexión',
      })).rejects.toThrow(/Falta configurar Supabase|REACT_APP_SUPABASE/);
    } finally {
      process.env.REACT_APP_SUPABASE_URL = originalUrl;
      process.env.REACT_APP_SUPABASE_ANON_KEY = originalKey;
    }
  });
});
