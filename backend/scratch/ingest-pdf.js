import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Resolve __dirname in ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import ragService from '../src/services/rag.js';

async function ingestFile(filePath) {
  const filename = path.basename(filePath);
  console.log(`[CLI] Reading "${filename}"...`);
  const buffer = fs.readFileSync(filePath);
  const chunkCount = await ragService.addDocument(filename, buffer);
  console.log(`🎉 Success! Successfully parsed and indexed "${filename}". Created ${chunkCount} chunks.`);
  return chunkCount;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('Usage: node scratch/ingest-pdf.js <path-to-pdf-file-or-directory>');
    process.exit(1);
  }

  const targetPath = path.resolve(args[0]);
  if (!fs.existsSync(targetPath)) {
    console.error(`Error: Path not found at ${targetPath}`);
    process.exit(1);
  }

  const stats = fs.statSync(targetPath);
  try {
    if (stats.isFile()) {
      if (path.extname(targetPath).toLowerCase() !== '.pdf') {
        console.error('Error: Provided file is not a PDF.');
        process.exit(1);
      }
      await ingestFile(targetPath);
    } else if (stats.isDirectory()) {
      console.log(`[CLI] Scanning directory "${targetPath}" for PDFs...`);
      const files = fs.readdirSync(targetPath);
      const pdfFiles = files.filter(f => path.extname(f).toLowerCase() === '.pdf');

      if (pdfFiles.length === 0) {
        console.log('No PDF files found in directory.');
        process.exit(0);
      }

      console.log(`Found ${pdfFiles.length} PDF files. Starting ingestion...`);
      let totalChunks = 0;
      for (const file of pdfFiles) {
        const fullPath = path.join(targetPath, file);
        try {
          const chunks = await ingestFile(fullPath);
          totalChunks += chunks;
        } catch (err) {
          console.error(`❌ Failed to ingest "${file}":`, err.message);
        }
      }
      console.log(`\n🎉 Ingestion complete! Processed ${pdfFiles.length} PDFs, created ${totalChunks} total chunks.`);
    }
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Ingestion failed:', err.message);
    process.exit(1);
  }
}

main();
