const AWS = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

class S3Service {
  constructor() {
    this.s3 = new AWS.S3({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    this.bucketName = process.env.S3_BUCKET_NAME;
    
    if (!this.bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is required');
    }

    // Configure multer for S3 uploads
    this.upload = multer({
      storage: multerS3({
        s3: this.s3,
        bucket: this.bucketName,
        metadata: (req, file, cb) => {
          cb(null, { fieldName: file.fieldname });
        },
        key: (req, file, cb) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const fileName = `posters/${uniqueSuffix}${path.extname(file.originalname)}`;
          cb(null, fileName);
        }
      }),
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
      },
      fileFilter: (req, file, cb) => {
        // Allowed file types
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
          return cb(null, true);
        } else {
          cb(new Error('Invalid file type. Only JPEG, JPG, PNG, GIF, and WebP files are allowed.'));
        }
      }
    });
  }

  /**
   * Upload a file to S3
   * @param {Object} file - File object from multer
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(file, metadata = {}) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: file.key,
        Body: file.buffer || file.stream,
        ContentType: file.mimetype,
        Metadata: {
          originalName: file.originalname,
          uploadTime: new Date().toISOString(),
          ...metadata
        }
      };

      const result = await this.s3.upload(params).promise();
      
      logger.info(`File uploaded successfully: ${result.Key}`);
      return {
        success: true,
        key: result.Key,
        location: result.Location,
        etag: result.ETag
      };
    } catch (error) {
      logger.error('Error uploading file to S3:', error);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Get a file from S3
   * @param {string} key - File key
   * @returns {Promise<Object>} File data
   */
  async getFile(key) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key
      };

      const result = await this.s3.getObject(params).promise();
      
      return {
        success: true,
        data: result.Body,
        contentType: result.ContentType,
        metadata: result.Metadata,
        lastModified: result.LastModified
      };
    } catch (error) {
      logger.error(`Error getting file ${key} from S3:`, error);
      
      if (error.code === 'NoSuchKey') {
        throw new Error('File not found');
      }
      
      throw new Error(`Failed to get file: ${error.message}`);
    }
  }

  /**
   * Delete a file from S3
   * @param {string} key - File key
   * @returns {Promise<Object>} Delete result
   */
  async deleteFile(key) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key
      };

      const result = await this.s3.deleteObject(params).promise();
      
      logger.info(`File deleted successfully: ${key}`);
      return {
        success: true,
        deleted: true
      };
    } catch (error) {
      logger.error(`Error deleting file ${key} from S3:`, error);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * List files in S3 bucket
   * @param {string} prefix - Prefix to filter files
   * @param {number} maxKeys - Maximum number of keys to return
   * @returns {Promise<Array>} Array of file objects
   */
  async listFiles(prefix = '', maxKeys = 1000) {
    try {
      const params = {
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys
      };

      const result = await this.s3.listObjectsV2(params).promise();
      
      const files = result.Contents.map(file => ({
        key: file.Key,
        lastModified: file.LastModified,
        size: file.Size,
        etag: file.ETag,
        storageClass: file.StorageClass
      }));

      return {
        success: true,
        files,
        count: files.length,
        isTruncated: result.IsTruncated,
        nextContinuationToken: result.NextContinuationToken
      };
    } catch (error) {
      logger.error('Error listing files from S3:', error);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Get file URL with expiration
   * @param {string} key - File key
   * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
   * @returns {string} Signed URL
   */
  getSignedUrl(key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
        Expires: expiresIn
      };

      return this.s3.getSignedUrl('getObject', params);
    } catch (error) {
      logger.error(`Error generating signed URL for ${key}:`, error);
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Copy a file within S3
   * @param {string} sourceKey - Source file key
   * @param {string} destinationKey - Destination file key
   * @returns {Promise<Object>} Copy result
   */
  async copyFile(sourceKey, destinationKey) {
    try {
      const params = {
        Bucket: this.bucketName,
        CopySource: `${this.bucketName}/${sourceKey}`,
        Key: destinationKey
      };

      const result = await this.s3.copyObject(params).promise();
      
      logger.info(`File copied successfully: ${sourceKey} -> ${destinationKey}`);
      return {
        success: true,
        copySource: sourceKey,
        destinationKey,
        etag: result.ETag
      };
    } catch (error) {
      logger.error(`Error copying file ${sourceKey} to ${destinationKey}:`, error);
      throw new Error(`Failed to copy file: ${error.message}`);
    }
  }

  /**
   * Get bucket information
   * @returns {Promise<Object>} Bucket info
   */
  async getBucketInfo() {
    try {
      const params = {
        Bucket: this.bucketName
      };

      const result = await this.s3.headBucket(params).promise();
      
      return {
        success: true,
        bucketName: this.bucketName,
        region: this.s3.config.region
      };
    } catch (error) {
      logger.error('Error getting bucket info:', error);
      throw new Error(`Failed to get bucket info: ${error.message}`);
    }
  }

  /**
   * Test S3 connection
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      await this.getBucketInfo();
      logger.info('S3 connection test successful');
      return true;
    } catch (error) {
      logger.error('S3 connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get multer upload middleware
   * @param {string} fieldName - Field name for file upload
   * @returns {Function} Multer middleware
   */
  getUploadMiddleware(fieldName = 'poster') {
    return this.upload.single(fieldName);
  }

  /**
   * Generate a unique file key
   * @param {string} originalName - Original file name
   * @param {string} prefix - Key prefix
   * @returns {string} Unique file key
   */
  generateFileKey(originalName, prefix = 'uploads') {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const ext = path.extname(originalName);
    return `${prefix}/${timestamp}-${random}${ext}`;
  }
}

module.exports = S3Service;
