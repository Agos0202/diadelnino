const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const { v2: cloudinary } = require('cloudinary');

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || process.env.PORT || 4000;
const CLOUDINARY_DB_PUBLIC_ID = process.env.CLOUDINARY_DB_PUBLIC_ID || 'comuna_asistencias_db';
const ADMIN_USER = 'FloridaLuisiana';
const ADMIN_PASSWORD = 'Comuna2026*';
const CLOUDINARY_CLOUD_NAME = (process.env.CLOUDINARY_CLOUD_NAME || '').trim().toLowerCase();
const CLOUDINARY_API_KEY = (process.env.CLOUDINARY_API_KEY || '').trim();
const CLOUDINARY_API_SECRET = (process.env.CLOUDINARY_API_SECRET || '').trim();
const placeholderPattern = /^(tu_|example|replace_me|placeholder|changeme)/i;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const hasRealSupabaseConfig = Boolean(
  SUPABASE_URL &&
  SUPABASE_SERVICE_ROLE_KEY &&
  !placeholderPattern.test(SUPABASE_URL) &&
  !placeholderPattern.test(SUPABASE_SERVICE_ROLE_KEY)
);
const supabase = hasRealSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

app.use(cors());
app.use(express.json());

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const getErrorMessage = (error, fallback) => {
  return error?.error?.message || error?.message || fallback;
};

const normalizarDni = (value) => {
  return String(value ?? '').replace(/\D/g, '');
};

const parseNumeroSorteo = (value) => {
  const numero = Number.parseInt(value, 10);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
};

const obtenerMaxNumeroSorteo = (asistencias) => {
  let maxNumero = 0;

  asistencias.forEach((item) => {
    const numero = parseNumeroSorteo(item.numeroSorteo);
    if (numero && numero > maxNumero) {
      maxNumero = numero;
    }
  });

  return maxNumero;
};

const normalizarDb = (dbRaw) => {
  if (Array.isArray(dbRaw)) {
    const maxNumero = obtenerMaxNumeroSorteo(dbRaw);
    return {
      asistencias: dbRaw,
      ultimoNumeroSorteo: maxNumero,
    };
  }

  const asistencias = Array.isArray(dbRaw?.asistencias) ? dbRaw.asistencias : [];
  const ultimoNumero = parseNumeroSorteo(dbRaw?.ultimoNumeroSorteo);
  const maxNumero = obtenerMaxNumeroSorteo(asistencias);

  return {
    asistencias,
    ultimoNumeroSorteo: ultimoNumero && ultimoNumero > maxNumero ? ultimoNumero : maxNumero,
  };
};

const asegurarNumerosSorteo = async (db) => {
  const { asistencias } = db;
  let siguienteNumero = db.ultimoNumeroSorteo;
  let huboCambios = false;

  asistencias.forEach((item) => {
    const numero = parseNumeroSorteo(item.numeroSorteo);
    if (!numero) {
      siguienteNumero += 1;
      item.numeroSorteo = siguienteNumero;
      huboCambios = true;
    }
  });

  if (db.ultimoNumeroSorteo !== siguienteNumero) {
    db.ultimoNumeroSorteo = siguienteNumero;
    huboCambios = true;
  }

  if (huboCambios) {
    await saveDb(db);
  }
};

const isCloudinaryNotFound = (error) => {
  const httpCode = error?.http_code || error?.error?.http_code;
  const message = error?.message || error?.error?.message || '';

  return httpCode === 404 || (typeof message === 'string' && message.toLowerCase().includes('not found'));
};

const mapAsistenciaToSupabaseRow = (item) => ({
  id: String(item.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
  nombre: String(item.nombre ?? '').trim(),
  apellido: String(item.apellido ?? '').trim(),
  telefono: String(item.telefono ?? '').trim(),
  dni: String(item.dni ?? item.email ?? '').trim(),
  email: String(item.email ?? item.dni ?? '').trim(),
  numero_sorteo: Number(item.numeroSorteo ?? 0),
  estado_asistencia: ['presente', 'ausente', 'pendiente'].includes(item.estadoAsistencia)
    ? item.estadoAsistencia
    : 'pendiente',
  fecha_confirmacion: item.fechaConfirmacion || new Date().toISOString(),
});

const mapSupabaseRowToAsistencia = (item) => ({
  ...item,
  id: String(item.id),
  nombre: String(item.nombre ?? '').trim(),
  apellido: String(item.apellido ?? '').trim(),
  telefono: String(item.telefono ?? '').trim(),
  dni: String(item.dni ?? item.email ?? '').trim(),
  email: String(item.email ?? item.dni ?? '').trim(),
  numeroSorteo: Number(item.numero_sorteo ?? item.numeroSorteo ?? 0),
  estadoAsistencia: ['presente', 'ausente', 'pendiente'].includes(item.estado_asistencia)
    ? item.estado_asistencia
    : 'pendiente',
  fechaConfirmacion: item.fecha_confirmacion || item.fechaConfirmacion || new Date().toISOString(),
});

const getDbFromSupabase = async () => {
  const { data, error } = await supabase.from('asistencias').select('*').order('numero_sorteo', { ascending: true });

  if (error) {
    throw error;
  }

  return normalizarDb((data || []).map(mapSupabaseRowToAsistencia));
};

const getDbFromCloudinary = async () => {
  try {
    const resource = await cloudinary.api.resource(CLOUDINARY_DB_PUBLIC_ID, { resource_type: 'raw' });
    const bustCacheUrl = `${resource.secure_url}?t=${Date.now()}`;
    const response = await fetch(bustCacheUrl, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error('No se pudo leer la base desde Cloudinary.');
    }

    const json = await response.json();
    return normalizarDb(json);
  } catch (error) {
    if (isCloudinaryNotFound(error)) {
      return {
        asistencias: [],
        ultimoNumeroSorteo: 0,
      };
    }
    throw error;
  }
};

const getDb = async () => {
  if (supabase) {
    return getDbFromSupabase();
  }

  return getDbFromCloudinary();
};

const saveDbToSupabase = async (db) => {
  const rows = (db.asistencias || []).map(mapAsistenciaToSupabaseRow);

  const { error: deleteError } = await supabase.from('asistencias').delete().neq('id', '');
  if (deleteError) {
    throw deleteError;
  }

  if (rows.length === 0) {
    return;
  }

  const { error } = await supabase.from('asistencias').insert(rows);
  if (error) {
    throw error;
  }
};

const saveDbToCloudinary = async (db) => {
  const payload = Buffer.from(
    JSON.stringify({
      asistencias: db.asistencias,
      ultimoNumeroSorteo: db.ultimoNumeroSorteo,
    }, null, 2),
    'utf8'
  );

  await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        public_id: CLOUDINARY_DB_PUBLIC_ID,
        overwrite: true,
        invalidate: true,
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );

    uploadStream.end(payload);
  });
};

const saveDb = async (db) => {
  if (supabase) {
    await saveDbToSupabase(db);
    return;
  }

  await saveDbToCloudinary(db);
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

const logDatabaseStatus = async () => {
  if (supabase) {
    try {
      const { error } = await supabase.from('asistencias').select('id').limit(1);
      if (error) {
        console.error('Supabase error:', getErrorMessage(error, 'Error desconocido'));
        return;
      }
      console.log('Supabase OK');
      return;
    } catch (error) {
      console.error('Supabase error:', getErrorMessage(error, 'Error desconocido'));
      return;
    }
  }

  try {
    await cloudinary.api.ping();
    console.log('Cloudinary OK');
  } catch (error) {
    console.error('Cloudinary error:', getErrorMessage(error, 'Error desconocido'));
  }
};

app.post('/api/admin/login', (req, res) => {
  const usuarioIngresado = String(req.body?.usuario || '').trim();
  const passwordIngresada = String(req.body?.password || '').trim();
  if (usuarioIngresado === ADMIN_USER && passwordIngresada === ADMIN_PASSWORD) {
    res.json({ ok: true });
    return;
  }
  res.status(401).json({ ok: false, message: 'Credenciales invalidas.' });
});

app.get('/api/asistencias', async (req, res) => {
  try {
    const db = await getDb();
    await asegurarNumerosSorteo(db);
    res.json(db.asistencias);
  } catch (error) {
    res.status(500).json({ message: getErrorMessage(error, 'No se pudo obtener asistencias.') });
  }
});

app.post('/api/asistencias', async (req, res) => {
  try {
    const { nombre, apellido, telefono, dni, email, estadoAsistencia } = req.body || {};
    const dniNormalizado = normalizarDni(dni ?? email);

    if (!nombre || !apellido || !telefono || !dniNormalizado) {
      res.status(400).json({ message: 'Todos los campos son obligatorios.' });
      return;
    }

    const db = await getDb();
    await asegurarNumerosSorteo(db);
    const { asistencias } = db;

    const yaRegistrado = asistencias.some(
      (item) => normalizarDni(item.dni ?? item.email) === dniNormalizado
    );

    if (yaRegistrado) {
      res.status(409).json({ message: 'Ya te encuentras registrado/a' });
      return;
    }

    const proximoNumeroSorteo = db.ultimoNumeroSorteo + 1;

    const nuevaAsistencia = {
      id: `${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      nombre: String(nombre).trim(),
      apellido: String(apellido).trim(),
      telefono: String(telefono).trim(),
      dni: dniNormalizado,
      numeroSorteo: proximoNumeroSorteo,
      estadoAsistencia: ['presente', 'ausente', 'pendiente'].includes(estadoAsistencia)
        ? estadoAsistencia
        : 'pendiente',
      fechaConfirmacion: new Date().toISOString(),
    };

    asistencias.push(nuevaAsistencia);
    db.ultimoNumeroSorteo = proximoNumeroSorteo;
    await saveDb(db);

    res.status(201).json({
      ...nuevaAsistencia,
      numeroLista: nuevaAsistencia.numeroSorteo,
    });
  } catch (error) {
    res.status(500).json({ message: getErrorMessage(error, 'No se pudo guardar la asistencia.') });
  }
});

app.put('/api/asistencias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, telefono, dni, email, estadoAsistencia } = req.body || {};

    const db = await getDb();
    await asegurarNumerosSorteo(db);
    const { asistencias } = db;
    const index = asistencias.findIndex((item) => item.id === id);

    if (index === -1) {
      res.status(404).json({ message: 'Asistencia no encontrada.' });
      return;
    }

    const dniNormalizado = normalizarDni(dni ?? email ?? asistencias[index].dni ?? asistencias[index].email);
    if (!dniNormalizado) {
      res.status(400).json({ message: 'El DNI es obligatorio.' });
      return;
    }

    const yaRegistrado = asistencias.some((item, itemIndex) => {
      if (itemIndex === index) {
        return false;
      }

      return normalizarDni(item.dni ?? item.email) === dniNormalizado;
    });

    if (yaRegistrado) {
      res.status(409).json({ message: 'Ya existe un invitado con ese DNI.' });
      return;
    }

    asistencias[index] = {
      ...asistencias[index],
      nombre: String(nombre ?? asistencias[index].nombre).trim(),
      apellido: String(apellido ?? asistencias[index].apellido).trim(),
      telefono: String(telefono ?? asistencias[index].telefono).trim(),
      dni: dniNormalizado,
      email: dniNormalizado,
      estadoAsistencia: ['presente', 'ausente', 'pendiente'].includes(estadoAsistencia)
        ? estadoAsistencia
        : asistencias[index].estadoAsistencia || 'pendiente',
    };

    await saveDb(db);
    res.json(asistencias[index]);
  } catch (error) {
    res.status(500).json({ message: getErrorMessage(error, 'No se pudo actualizar la asistencia.') });
  }
});

app.patch('/api/asistencias/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { estadoAsistencia } = req.body || {};

    if (!['presente', 'ausente', 'pendiente'].includes(estadoAsistencia)) {
      res.status(400).json({ message: 'Estado de asistencia invalido.' });
      return;
    }

    const db = await getDb();
    await asegurarNumerosSorteo(db);
    const { asistencias } = db;
    const index = asistencias.findIndex((item) => item.id === id);

    if (index === -1) {
      res.status(404).json({ message: 'Asistencia no encontrada.' });
      return;
    }

    asistencias[index] = {
      ...asistencias[index],
      estadoAsistencia,
    };

    await saveDb(db);
    res.json(asistencias[index]);
  } catch (error) {
    res.status(500).json({ message: getErrorMessage(error, 'No se pudo actualizar el estado de asistencia.') });
  }
});

app.delete('/api/asistencias/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    await asegurarNumerosSorteo(db);
    const { asistencias } = db;
    const siguiente = asistencias.filter((item) => item.id !== id);

    if (siguiente.length === asistencias.length) {
      res.status(404).json({ message: 'Asistencia no encontrada.' });
      return;
    }

    db.asistencias = siguiente;
    await saveDb(db);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: getErrorMessage(error, 'No se pudo eliminar la asistencia.') });
  }
});

// Exportar app para Netlify Functions
module.exports = { app };

// Escuchar solo cuando se ejecuta directamente (desarrollo local)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API escuchando en http://localhost:${PORT}`);
    logDatabaseStatus();
  });
}
