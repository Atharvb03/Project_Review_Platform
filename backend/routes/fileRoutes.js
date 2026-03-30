import express from 'express';
import multer from 'multer';
import { uploadFileToS3 } from '../controllers/fileController.js';

const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/upload', upload.single('file'), uploadFileToS3);

export default router;
