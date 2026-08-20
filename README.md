# Trabajo Comuna

La app ahora guarda las asistencias en Cloudinary mediante una API Node.

## Configuracion

1. Copia `.env.example` a `.env`.
2. Completa tus credenciales de Cloudinary en `.env`:

```env
CLOUDINARY_CLOUD_NAME=tu_cloud_name
CLOUDINARY_API_KEY=tu_api_key
CLOUDINARY_API_SECRET=tu_api_secret
CLOUDINARY_DB_PUBLIC_ID=comuna_asistencias_db
ADMIN_USER=FloridaLuisiana
ADMIN_PASSWORD=Comuna2026*
API_PORT=3000
```

3. Si desplegas el frontend en Netlify y la API en otro servicio, define en Netlify:

```env
REACT_APP_API_BASE_URL=https://tu-api-publica.com
```

Si no se define, el frontend usa rutas relativas (`/api/...`) en el mismo dominio.

## Scripts

- `npm run dev`: levanta frontend (puerto 3001) + API (puerto 3000)
- `npm start`: levanta solo frontend en el puerto 3001
- `npm run api`: levanta solo API en el puerto 3000
- `npm run build`: build de produccion frontend

## Flujo de datos

- El formulario de confirmacion envia asistencias a `POST /api/asistencias`.
- El panel `/administracion` usa:
	- `POST /api/admin/login`
	- `GET /api/asistencias`
	- `POST /api/asistencias`
	- `PUT /api/asistencias/:id`
	- `DELETE /api/asistencias/:id`

La base de datos se guarda como JSON en Cloudinary (recurso `raw`), usando `CLOUDINARY_DB_PUBLIC_ID`.

## Deploy de API en Render

El repo incluye `render.yaml` para publicar la API Express.

1. En Render, entra a **New +** -> **Blueprint**.
2. Conecta tu repositorio y selecciona la rama `main`.
3. Render detecta `render.yaml` y crea el servicio `trabajo-comuna-api`.
4. Carga estas variables en Render:

```env
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_DB_PUBLIC_ID=comuna_asistencias_db
ADMIN_USER=...
ADMIN_PASSWORD=...
```

5. Espera el deploy y prueba:

```txt
https://TU_API_RENDER.onrender.com/api/health
```

Debe responder `{"ok":true}`.

## Conectar Netlify con la API

En Netlify -> Site settings -> Environment variables:

```env
REACT_APP_API_BASE_URL=https://TU_API_RENDER.onrender.com
```

Luego ejecuta **Clear cache and deploy site** para que React tome la variable en build.
