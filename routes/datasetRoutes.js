const express = require('express');
const router = express.Router();
const {
  uploadDataset,
  getDatasets,
  getDatasetById,
  deleteDataset,
} = require('../controllers/datasetController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.use(protect); // All dataset routes require auth

router.post('/upload', upload.single('file'), uploadDataset);
router.get('/', getDatasets);
router.get('/:id', getDatasetById);
router.delete('/:id', deleteDataset);

module.exports = router;
