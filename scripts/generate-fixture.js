// One-off script to generate tests/fixtures/sample.pdf using pdfkit
// Run: node scripts/generate-fixture.js
//
// NOTE: pdf-parse v1.1.1 ships multiple pdf.js versions; the default (v1.10.100)
// has an xref parser that rejects pdfkit 0.18 output. We therefore:
//  1. Generate the PDF using pdfkit with compress:false, pdfVersion:'1.4'
//  2. Verify using pdf-parse with { version: 'v1.10.88' } — which is what
//     pdfParser.ts also passes.
'use strict'

const PDFDocument = require('pdfkit')
const fs = require('fs')
const path = require('path')

const outputPath = path.resolve(__dirname, '../tests/fixtures/sample.pdf')

const doc = new PDFDocument({ margin: 50, compress: false, pdfVersion: '1.4' })
const stream = fs.createWriteStream(outputPath)
doc.pipe(stream)

doc.fontSize(14).text('Abstract')
doc.moveDown(0.5)
doc.fontSize(12).text('This is a sample manuscript abstract about widget reliability and validity.')
doc.moveDown(1)
doc.fontSize(14).text('Introduction')
doc.moveDown(0.5)
doc.fontSize(12).text('We study widgets in depth across many conditions.')
doc.moveDown(1)
doc.fontSize(14).text('Methods')
doc.moveDown(0.5)
doc.fontSize(12).text('We measured widgets carefully.')
doc.end()

stream.on('finish', () => {
  console.log('PDF written to', outputPath)

  const pdfParse = require('pdf-parse/lib/pdf-parse.js')
  const buf = fs.readFileSync(outputPath)

  // Use Uint8Array to ensure byteOffset=0 (same fix used by pdfParser.ts)
  // Node.js Buffers from readFileSync may share an internal pool with non-zero
  // byteOffset, which confuses pdf.js's xref offset arithmetic.
  pdfParse(new Uint8Array(buf)).then(data => {
    const text = data.text
    console.log('Extracted text:', JSON.stringify(text.slice(0, 300)))
    if (!text.includes('Abstract')) {
      console.error('ERROR: text does not contain "Abstract"')
      process.exit(1)
    }
    if (!text.includes('widgets')) {
      console.error('ERROR: text does not contain "widgets"')
      process.exit(1)
    }
    console.log('VERIFICATION PASSED: text contains "Abstract" and "widgets"')
  }).catch(err => {
    console.error('ERROR parsing PDF:', err.message, err.details || '')
    process.exit(1)
  })
})

stream.on('error', err => {
  console.error('Error writing PDF:', err)
  process.exit(1)
})
