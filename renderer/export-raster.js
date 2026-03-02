const { PDFDocument } = require('pdf-lib');

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFontsAndImages(page, timeoutMs = 15000) {
  await page.setDefaultTimeout(timeoutMs);

  await page.evaluate(async () => {
    try {
      await document.fonts.ready;
    } catch (_) {
      // ignore
    }

    const images = Array.from(document.images || []);
    await Promise.all(
      images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      })
    );
  });
}

async function stabilizeCharts(page) {
  await page.evaluate(() => {
    if (!window.Chart) return;

    const chartInstances = [];

    if (window.Chart.instances) {
      if (typeof window.Chart.instances.values === 'function') {
        for (const chart of window.Chart.instances.values()) {
          chartInstances.push(chart);
        }
      } else {
        chartInstances.push(...Object.values(window.Chart.instances));
      }
    }

    chartInstances.forEach((chart) => {
      if (!chart) return;
      chart.options = chart.options || {};
      chart.options.animation = false;
      if (chart.options.animations) {
        chart.options.animations = false;
      }
      if (typeof chart.update === 'function') {
        chart.update('none');
      }
    });
  });
}

async function injectCaptureCss(page) {
  await page.addStyleTag({
    content: `
      html, body { scroll-behavior: auto !important; }
      .presentation { scroll-snap-type: none !important; }
      .slide { scroll-snap-align: none !important; }
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
      }
    `,
  });
}

async function buildSlidesPdf(page, timeoutMs, logger = console) {
  await waitForFontsAndImages(page, timeoutMs);
  await stabilizeCharts(page);
  await sleep(150);
  await stabilizeCharts(page);
  await injectCaptureCss(page);

  const slides = await page.$$('.slide');
  const pdfDoc = await PDFDocument.create();

  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];
    logger.info(`[render] Capturando slide ${index + 1}/${slides.length}.`);

    await slide.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await stabilizeCharts(page);
    await sleep(150);
    await stabilizeCharts(page);

    let pngBuffer;
    try {
      pngBuffer = await slide.screenshot({ type: 'png' });
    } catch (error) {
      logger.warn(`[render] Falló screenshot slide ${index + 1}, reintentando una vez.`);
      await sleep(500);
      await stabilizeCharts(page);
      pngBuffer = await slide.screenshot({ type: 'png' });
    }

    const pngImage = await pdfDoc.embedPng(pngBuffer);
    const pageWidth = pngImage.width;
    const pageHeight = pngImage.height;

    if (!pageWidth || !pageHeight) {
      logger.warn(`[render] Slide ${index + 1} con tamaño inválido, se omite.`);
      continue;
    }

    const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);
    pdfPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
    });
  }

  return Buffer.from(await pdfDoc.save());
}

async function renderHtmlToPdf({ browser, url, timeoutMs = 45000, logger = console }) {
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

    logger.info(`[render] Cargando URL: ${url}`);

    await page.goto(url, {
      waitUntil: ['domcontentloaded', 'networkidle0'],
      timeout: timeoutMs,
    });

    const hasSlides = await page.$('.slide');

    if (hasSlides) {
      logger.info('[render] Detectadas .slide, render en modo raster por slide.');
      return await buildSlidesPdf(page, timeoutMs, logger);
    }

    logger.info('[render] No hay .slide, generando page.pdf() en A4 landscape.');
    await waitForFontsAndImages(page, timeoutMs);
    await stabilizeCharts(page);
    await sleep(150);
    await stabilizeCharts(page);

    return await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      preferCSSPageSize: false,
      timeout: timeoutMs,
    });
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = {
  renderHtmlToPdf,
};
