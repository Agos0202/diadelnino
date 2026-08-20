-- 001_create_ninos_barrios.sql
-- Migración segura para adaptar el sistema a la gestión de niños del Día del Niño.
-- No elimina registros existentes ni borra datos; solo crea/ajusta estructura y protege DNI.

BEGIN;

-- 1) Crear tabla de barrios si no existe.
CREATE TABLE IF NOT EXISTS public.barrios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_barrios_nombre_unique
  ON public.barrios (lower(trim(nombre)))
  WHERE activo = true;

-- 2) Crear tabla de niños si no existe.
CREATE TABLE IF NOT EXISTS public.ninos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  apellido text NOT NULL,
  dni text NOT NULL,
  edad integer NOT NULL CHECK (edad >= 0 AND edad <= 17),
  sexo text NOT NULL CHECK (sexo IN ('Femenino', 'Masculino', 'Otro')),
  barrio_id uuid REFERENCES public.barrios(id),
  nombre_tutor text,
  telefono_tutor text,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3) Si ya existe una tabla vinculada a la fiesta (por ejemplo diadelniño / diadelnino / asistencias),
--    se intenta adaptar la estructura sin borrar información.
DO $$
DECLARE
  tabla_actual text;
  columnas_existentes text[];
  existe_barrio_id boolean := false;
BEGIN
  FOR tabla_actual IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('diadelniño', 'diadelnino', 'ninos', 'niños', 'asistencias')
      AND table_type = 'BASE TABLE'
  LOOP
    -- Verifica si existe una columna barrio_id.
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = tabla_actual
        AND column_name = 'barrio_id'
    ) INTO existe_barrio_id;

    IF NOT existe_barrio_id THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS barrio_id uuid', tabla_actual);
    END IF;

    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS nombre_tutor text', tabla_actual);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS telefono_tutor text', tabla_actual);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS observaciones text', tabla_actual);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()', tabla_actual);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()', tabla_actual);
  END LOOP;
END $$;

-- 4) Normalización de DNI y protección a nivel de base.
--    El campo dni se guarda como texto, pero se valida contra la concat de solo números.
ALTER TABLE public.ninos
  ADD COLUMN IF NOT EXISTS dni_normalizado text;

UPDATE public.ninos
SET dni = regexp_replace(trim(dni), '[^0-9]', '', 'g'),
    dni_normalizado = regexp_replace(trim(dni), '[^0-9]', '', 'g')
WHERE dni IS NOT NULL;

UPDATE public.ninos
SET dni_normalizado = regexp_replace(trim(dni), '[^0-9]', '', 'g')
WHERE dni_normalizado IS NULL;

ALTER TABLE public.ninos
  ALTER COLUMN dni TYPE text,
  ALTER COLUMN dni SET NOT NULL;

-- 5) Detección de duplicados existentes antes de crear la restricción definitiva.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT dni_normalizado, COUNT(*) AS total
    FROM public.ninos
    WHERE trim(coalesce(dni_normalizado, '')) <> ''
    GROUP BY dni_normalizado
    HAVING COUNT(*) > 1
    ORDER BY dni_normalizado
  LOOP
    RAISE WARNING 'DNI duplicado detectado en public.ninos: % (registros: %). Resolver antes de crear la restricción UNIQUE.', rec.dni_normalizado, rec.total;
  END LOOP;
END $$;

-- 6) Crear un índice único sobre el DNI normalizado para evitar duplicados físicos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ninos_dni_unique
  ON public.ninos (regexp_replace(trim(dni), '[^0-9]', '', 'g'))
  WHERE trim(coalesce(dni, '')) <> '';

-- 7) Crear índices normalmente consultados para búsqueda y filtros.
CREATE INDEX IF NOT EXISTS idx_ninos_apellido
  ON public.ninos (apellido);

CREATE INDEX IF NOT EXISTS idx_ninos_nombre
  ON public.ninos (nombre);

CREATE INDEX IF NOT EXISTS idx_ninos_edad
  ON public.ninos (edad);

CREATE INDEX IF NOT EXISTS idx_ninos_sexo
  ON public.ninos (sexo);

CREATE INDEX IF NOT EXISTS idx_ninos_created_at
  ON public.ninos (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ninos_barrio_id
  ON public.ninos (barrio_id);

-- 8) Si hay una tabla antigua con datos de niños/invitados, se recomienda migrarlos con un script de adaptación manual,
--    que debe revisarse antes de eliminar o mezclar registros.
--    No se hace borrado automático porque la prioridad es no perder información.

COMMIT;

-- Observación:
-- La regla más importante es la restricción UNIQUE sobre DNI normalizado.
-- Si se detectan duplicados en la base actual, deben resolverse antes de declarar la migración como finalizada.
