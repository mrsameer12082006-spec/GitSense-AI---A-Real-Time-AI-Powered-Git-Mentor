import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import ragService from '../services/rag.js';

const router = Router();

// Store file in memory to avoid writing temporary files to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF documents are allowed.'));
    }
  }
});

router.use(authenticate);

// ── POST /api/kb/upload ──────────────────────────────────────
// Upload and index a Git/GitHub PDF reference manual
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload a PDF file.' });
    }

    console.log(`[KB] Upload request for: "${req.file.originalname}" (${req.file.size} bytes)`);
    const chunkCount = await ragService.addDocument(req.file.originalname, req.file.buffer);

    res.json({
      success: true,
      message: `Document "${req.file.originalname}" parsed and split into ${chunkCount} chunks successfully.`,
      filename: req.file.originalname,
      chunks: chunkCount
    });
  } catch (err) {
    console.error('[KB] Upload failed:', err);
    res.status(500).json({
      error: err.message || 'Failed to process and index the PDF manual.'
    });
  }
});

export default router;
