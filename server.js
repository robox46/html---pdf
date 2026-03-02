const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const puppeteer = require('puppeteer');
const { renderHtmlToPdf } = require('./renderer/export-raster');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const TMP_ROOT = path.join(os.tmpdir(), 'html-pdf-render');
const STATIC_TMP_ROUTE = '/__tmp';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(STATIC_TMP_ROUTE, express.static(TMP_ROOT));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/render', upload.single('html'), async (req, res) => {
  const startedAt = Date.now();
  let jobDir;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Falta archivo en campo "html".' });
    }

    const originalName = req.file.originalname || 'input.html';
    if (!originalName.toLowerCase().endsWith('.html')) {
      return res.status(400).json({ error: 'Solo se permite un archivo .html.' });
    }

    await fs.mkdir(TMP_ROOT, { recursive: true });
    jobDir = await fs.mkdtemp(path.join(TMP_ROOT, 'job-'));

    const htmlPath = path.join(jobDir, 'input.html');
    await fs.writeFile(htmlPath, req.file.buffer);

    const publicUrl = `http://127.0.0.1:${PORT}${STATIC_TMP_ROUTE}/${path.basename(jobDir)}/input.html`;

    console.log(`[render] Inicio job=${path.basename(jobDir)} size=${req.file.size}B`);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    let pdfBuffer;
    try {
      pdfBuffer = await renderHtmlToPdf({
        browser,
        url: publicUrl,
        timeoutMs: 45000,
        logger: console,
      });
    } finally {
      await browser.close().catch(() => {});
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="output.pdf"');
    res.status(200).send(pdfBuffer);

    console.log(`[render] OK job=${path.basename(jobDir)} ms=${Date.now() - startedAt}`);
  } catch (error) {
    console.error('[render] ERROR', error);
    if (error && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Archivo demasiado grande. Máximo 15MB.' });
    }

    res.status(500).json({ error: 'No se pudo generar el PDF.' });
  } finally {
    if (jobDir) {
      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
  }
});

app.listen(PORT, HOST, () => {
  console.log(`Servidor escuchando en http://${HOST}:${PORT}`);
});
