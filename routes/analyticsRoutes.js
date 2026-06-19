const express = require('express');
const router = express.Router();
const {
  getSummary,
  getSegments,
  getForecasts,
  getInsights,
  getTopProducts,
  getRevenueByCategory,
} = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect); // All analytics routes require auth

router.get('/:datasetId/summary', getSummary);
router.get('/:datasetId/segments', getSegments);
router.get('/:datasetId/forecasts', getForecasts);
router.get('/:datasetId/insights', getInsights);
router.get('/:datasetId/top-products', getTopProducts);
router.get('/:datasetId/categories', getRevenueByCategory);

module.exports = router;
