-- 002_dni_unique_and_rls.sql
-- Reglas críticas para garantizar que no haya dos niños con el mismo DNI.
-- Este SQL debe ejecutarse después de resolver duplicados existentes.

BEGIN;

-- 1) Normalizar DNI para comparar solo números.
ALTER TABLE public.ninos
  ADD COLUMN IF NOT EXISTS dni_normalizado text;

UPDATE public.ninos
SET dni_normalizado = regexp_replace(trim(dni), '[^0-9]', '', 'g')
WHERE dni_normalizado IS NULL OR trim(dni_normalizado) = '';

-- 2) Resolver duplicados existentes sin borrarlos automáticamente.
--    Se deja un aviso visible para que el admin corrija registros antes de cerrar la migración.
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
  LOOP
    RAISE NOTICE 'DNI duplicado detectado: %, registros: %', rec.dni_normalizado, rec.total;
  END LOOP;
END $$;

-- 3) Crear la restricción única de DNI a nivel de base.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ninos_dni_unico
  ON public.ninos (lower(regexp_replace(trim(dni), '[^0-9]', '', 'g')))
  WHERE trim(coalesce(dni, '')) <> '';

-- 4) Crear un check para proteger datos inválidos.
ALTER TABLE public.ninos
  DROP CONSTRAINT IF EXISTS ninos_edad_check;

ALTER TABLE public.ninos
  ADD CONSTRAINT ninos_edad_check CHECK (edad >= 0 AND edad <= 17);

ALTER TABLE public.ninos
  DROP CONSTRAINT IF EXISTS ninos_sexo_check;

ALTER TABLE public.ninos
  ADD CONSTRAINT ninos_sexo_check CHECK (sexo IN ('Femenino', 'Masculino', 'Otro'));

-- 5) Índices para búsquedas frecuentes.
CREATE INDEX IF NOT EXISTS idx_ninos_apellido_nombre
  ON public.ninos (apellido, nombre);

CREATE INDEX IF NOT EXISTS idx_ninos_barrio_edad
  ON public.ninos (barrio_id, edad);

-- 6) RLS (Row Level Security) recomendado.
ALTER TABLE public.ninos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barrios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ninos_select_admin" ON public.ninos;
CREATE POLICY "ninos_select_admin"
  ON public.ninos FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "ninos_insert_admin" ON public.ninos;
CREATE POLICY "ninos_insert_admin"
  ON public.ninos FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "ninos_update_admin" ON public.ninos;
CREATE POLICY "ninos_update_admin"
  ON public.ninos FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "ninos_delete_admin" ON public.ninos;
CREATE POLICY "ninos_delete_admin"
  ON public.ninos FOR DELETE
  USING (true);

DROP POLICY IF EXISTS "barrios_select_admin" ON public.barrios;
CREATE POLICY "barrios_select_admin"
  ON public.barrios FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "barrios_insert_admin" ON public.barrios;
CREATE POLICY "barrios_insert_admin"
  ON public.barrios FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "barrios_update_admin" ON public.barrios;
CREATE POLICY "barrios_update_admin"
  ON public.barrios FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "barrios_delete_admin" ON public.barrios;
CREATE POLICY "barrios_delete_admin"
  ON public.barrios FOR DELETE
  USING (true);

COMMIT;
