const express = require('express');
const { param } = require('express-validator');
const S3Service = require('../services/s3Service');
const winston = require('winston');

const router = express.Router();

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

// Initialize S3 service
let s3Service;
try {
  s3Service = new S3Service();
} catch (error) {
  logger.error('Failed to initialize S3 service:', error.message);
}

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

/**
 * POST /uploads/poster
 * Upload an event poster
 */
router.post('/poster', async (req, res) => {
  try {
    if (!s3Service) {
      return res.status(500).json({
        success: false,
        error: 'S3 service not available'
      });
    }

    // Use the upload middleware from S3 service
    const uploadMiddleware = s3Service.getUploadMiddleware('poster');
    
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        logger.error('File upload error:', err);
        return res.status(400).json({
          success: false,
          error: 'File upload failed',
          message: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      try {
        // Add additional metadata
        const metadata = {
          uploadedBy: req.ip || 'unknown',
          originalName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype
        };

        // File is already uploaded by multer-s3, get the info
        const uploadResult = {
          success: true,
          key: req.file.key,
          location: req.file.location,
          originalName: req.file.originalname,
          size: req.file.size,
          mimeType: req.file.mimetype,
          uploadedAt: new Date().toISOString()
        };

        logger.info(`Poster uploaded successfully: ${uploadResult.key}`);
        
        res.status(201).json({
          success: true,
          data: uploadResult,
          message: 'Poster uploaded successfully'
        });
      } catch (error) {
        logger.error('Error processing uploaded file:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to process uploaded file',
          message: error.message
        });
      }
    });
  } catch (error) {
    logger.error('Error in poster upload route:', error);
    res.status(500).json({
      success: false,
      error: 'Upload failed',
      message: error.message
    });
  }
});

/**
 * GET /uploads/poster/:filename
 * Get a poster image by filename
 */
router.get('/poster/:filename', [
  param('filename').isString().withMessage('Filename must be a string')
], handleValidationErrors, async (req, res) => {
  try {
    const { filename } = req.params;
    const key = `posters/${filename}`;

    // Check cache first
    const cacheKey = `poster:${filename}`;
    const cachedImage = req.cache.get(cacheKey);
    
    if (cachedImage) {
      logger.info(`Returning cached poster: ${filename}`);
      res.set('Content-Type', cachedImage.contentType);
      res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      return res.send(cachedImage.data);
    }

    const fileData = await s3Service.getFile(key);
    
    // Cache the image
    req.cache.set(cacheKey, {
      data: fileData.data,
      contentType: fileData.contentType
    });
    
    res.set('Content-Type', fileData.contentType);
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(fileData.data);
  } catch (error) {
    logger.error(`Error fetching poster ${req.params.filename}:`, error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Poster not found',
        message: 'The requested poster does not exist'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch poster',
      message: error.message
    });
  }
});

/**
 * DELETE /uploads/poster/:filename
 * Delete a poster image
 */
router.delete('/poster/:filename', [
  param('filename').isString().withMessage('Filename must be a string')
], handleValidationErrors, async (req, res) => {
  try {
    const { filename } = req.params;
    const key = `posters/${filename}`;

    await s3Service.deleteFile(key);
    
    // Remove from cache
    const cacheKey = `poster:${filename}`;
    req.cache.del(cacheKey);
    
    logger.info(`Poster deleted successfully: ${filename}`);
    
    res.json({
      success: true,
      message: 'Poster deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting poster ${req.params.filename}:`, error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Poster not found',
        message: 'The requested poster does not exist'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to delete poster',
      message: error.message
    });
  }
});

/**
 * GET /uploads/list
 * List all uploaded posters
 */
router.get('/list', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const result = await s3Service.listFiles('posters/', parseInt(limit));
    
    // Paginate results
    const startIndex = (parseInt(page) - 1) * parseInt(limit);
    const endIndex = startIndex + parseInt(limit);
    const paginatedFiles = result.files.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: paginatedFiles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.files.length,
        totalPages: Math.ceil(result.files.length / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error listing posters:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list posters',
      message: error.message
    });
  }
});

/**
 * GET /uploads/url/:filename
 * Get a signed URL for a poster (for temporary access)
 */
router.get('/url/:filename', [
  param('filename').isString().withMessage('Filename must be a string')
], handleValidationErrors, async (req, res) => {
  try {
    const { filename } = req.params;
    const { expiresIn = 3600 } = req.query; // Default 1 hour
    
    const key = `posters/${filename}`;
    const signedUrl = s3Service.getSignedUrl(key, parseInt(expiresIn));
    
    res.json({
      success: true,
      data: {
        filename,
        signedUrl,
        expiresIn: parseInt(expiresIn)
      }
    });
  } catch (error) {
    logger.error(`Error generating signed URL for ${req.params.filename}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate signed URL',
      message: error.message
    });
  }
});

/**
 * POST /uploads/multiple
 * Upload multiple poster images
 */
router.post('/multiple', async (req, res) => {
  try {
    if (!s3Service) {
      return res.status(500).json({
        success: false,
        error: 'S3 service not available'
      });
    }

    // Use the upload middleware for multiple files
    const uploadMiddleware = s3Service.upload.array('posters', 5); // Max 5 files
    
    uploadMiddleware(req, res, async (err) => {
      if (err) {
        logger.error('Multiple file upload error:', err);
        return res.status(400).json({
          success: false,
          error: 'File upload failed',
          message: err.message
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No files uploaded'
        });
      }

      try {
        const uploadResults = req.files.map(file => ({
          success: true,
          key: file.key,
          location: file.location,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: new Date().toISOString()
        }));

        logger.info(`${uploadResults.length} posters uploaded successfully`);
        
        res.status(201).json({
          success: true,
          data: uploadResults,
          message: `${uploadResults.length} posters uploaded successfully`
        });
      } catch (error) {
        logger.error('Error processing uploaded files:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to process uploaded files',
          message: error.message
        });
      }
    });
  } catch (error) {
    logger.error('Error in multiple upload route:', error);
    res.status(500).json({
      success: false,
      error: 'Upload failed',
      message: error.message
    });
  }
});

/**
 * GET /uploads/health
 * Check if the upload service is healthy
 */
router.get('/health', async (req, res) => {
  try {
    const isHealthy = await s3Service.testConnection();
    
    res.json({
      success: true,
      healthy: isHealthy,
      service: 'uploads',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Upload service health check failed:', error);
    res.status(503).json({
      success: false,
      healthy: false,
      service: 'uploads',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /uploads/info
 * Get upload service information
 */
router.get('/info', async (req, res) => {
  try {
    const bucketInfo = await s3Service.getBucketInfo();
    
    res.json({
      success: true,
      data: {
        bucket: bucketInfo,
        region: process.env.AWS_REGION || 'us-east-1',
        maxFileSize: '5MB',
        allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
        maxFiles: 5
      }
    });
  } catch (error) {
    logger.error('Error getting upload service info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service info',
      message: error.message
    });
  }
});

module.exports = router;
