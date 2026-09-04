/* global pdfjsLib */

// Carga y dibuja páginas de cómic en PDF sobre un <canvas>. Lo comparten el
// modal de la portada (js/script.js) y las páginas individuales
// (js/persona.js) para no duplicar la integración con PDF.js.
(function (global) {
  "use strict";

  if (global.pdfjsLib && global.pdfjsLib.GlobalWorkerOptions) {
    global.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }

  const documentCache = new Map();

  function available() {
    return Boolean(global.pdfjsLib);
  }

  function loadDocument(url) {
    if (!available() || !url) return Promise.resolve(null);
    if (!documentCache.has(url)) {
      const promise = global.pdfjsLib.getDocument(url).promise.catch(() => null);
      documentCache.set(url, promise);
    }
    return documentCache.get(url);
  }

  // Dibuja pageNumber (1-based) de pdfDoc en un <canvas> nuevo, ajustado a
  // targetWidth y ampliado si options.zoomed es true. Devuelve el canvas.
  async function renderPage(pdfDoc, pageNumber, options = {}) {
    const targetWidth = Math.max(120, options.targetWidth || 520);
    const zoomFactor = options.zoomed ? 2.2 : 1;
    const page = await pdfDoc.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = (targetWidth / baseViewport.width) * zoomFactor;
    const viewport = page.getViewport({ scale });

    const canvas = global.document.createElement("canvas");
    canvas.className = "comic-page-canvas";
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
  }

  global.ComicViewer = { available, loadDocument, renderPage };
})(window);
