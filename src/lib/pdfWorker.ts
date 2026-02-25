import { pdfjs } from 'react-pdf'

// Serve the worker from /public as a static asset.
// The file public/pdf.worker.min.mjs is a copy of
// node_modules/pdfjs-dist/build/pdf.worker.min.mjs (v5.4.296).
// This avoids the unreliable `new URL(..., import.meta.url)` pattern
// which Turbopack does not handle correctly.
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
