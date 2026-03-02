# HTML → PDF (Puppeteer + Express)

Herramienta web ultra simple para subir un `.html` y descargar un `output.pdf`.

## Qué hace

- Frontend mínimo en `/public` para subir 1 archivo HTML.
- Endpoint `POST /render` con `multipart/form-data` (campo `html`).
- Render fiable con Chromium headless (Puppeteer):
  - Espera `document.fonts.ready`.
  - Espera a que todas las imágenes terminen de cargar.
  - Si existe `Chart`, desactiva animaciones antes de capturar.
  - Ejecuta 2x `requestAnimationFrame` antes del render.
- Modo de salida:
  - Si existen elementos `.slide`, captura cada slide a PNG y compone 1 página por slide con `pdf-lib`.
  - Si no existen `.slide`, usa `page.pdf()` en A4 landscape.
- Seguridad:
  - Límite de upload: 15MB.
  - Limpieza de temporales al finalizar.
- Compatible con Render Free Web Service.

## Requisitos

- Node.js >= 18

## Uso local

```bash
npm install
npm start
```

Luego abrir `http://localhost:3000`.

## Deploy paso a paso en Render

1. Sube este repositorio a GitHub.
2. En Render, clic en **New +** → **Web Service**.
3. Conecta tu cuenta de GitHub y selecciona el repositorio.
4. Configura:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
5. Crea el servicio y espera el primer deploy.
6. Abre la URL pública de Render y usa el formulario para subir un `.html`.

## Scripts

- `npm start` → ejecuta `node server.js`

## Notas técnicas Render

El servicio usa Puppeteer con flags recomendadas para entornos containerizados:

- `--no-sandbox`
- `--disable-setuid-sandbox`
- `--disable-dev-shm-usage`

El puerto se toma desde `process.env.PORT`.
