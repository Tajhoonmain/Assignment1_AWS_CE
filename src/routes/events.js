const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const TicketmasterService = require('../services/ticketmaster');
const winston = require('winston');

const router = express.Router();

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

// Initialize Ticketmaster service
let ticketmasterService;
try {
  ticketmasterService = new TicketmasterService();
} catch (error) {
  logger.error('Failed to initialize Ticketmaster service:', error.message);
}

// Validation middleware
const handleValidationErrors = (req, res, next) => {
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
 * GET /events
 * Get all events with optional filtering
 */
router.get('/', [
  query('page').optional().isInt({ min: 0 }).withMessage('Page must be a non-negative integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('city').optional().isString().withMessage('City must be a string'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 0,
      limit = 20,
      city,
      category,
      startDate,
      endDate,
      keyword
    } = req.query;

    // Check cache first
    const cacheKey = `events:${JSON.stringify(req.query)}`;
    const cachedEvents = req.cache.get(cacheKey);
    
    if (cachedEvents) {
      logger.info(`Returning cached events for key: ${cacheKey}`);
      return res.json({
        success: true,
        data: cachedEvents,
        cached: true,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: cachedEvents.length
        }
      });
    }

    // Fetch from API
    const options = {
      page: parseInt(page),
      size: parseInt(limit),
      city,
      classificationName: category,
      startDate: startDate ? startDate.split('T')[0] : undefined,
      endDate: endDate ? endDate.split('T')[0] : undefined,
      keyword
    };

    const events = await ticketmasterService.getEvents(options);
    
    // Cache the results
    req.cache.set(cacheKey, events);
    
    res.json({
      success: true,
      data: events,
      cached: false,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: events.length
      }
    });
  } catch (error) {
    logger.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch events',
      message: error.message
    });
  }
});

/**
 * GET /events/search
 * Search events with advanced filters
 */
router.get('/search', [
  query('q').optional().isString().withMessage('Search query must be a string'),
  query('location').optional().isString().withMessage('Location must be a string'),
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  query('endDate').optional().isISO8601().withMessage('End date must be a valid date'),
  query('category').optional().isString().withMessage('Category must be a string'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('page').optional().isInt({ min: 0 }).withMessage('Page must be a non-negative integer')
], handleValidationErrors, async (req, res) => {
  try {
    const searchParams = {
      q: req.query.q,
      location: req.query.location,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      category: req.query.category,
      limit: parseInt(req.query.limit) || 20,
      page: parseInt(req.query.page) || 0
    };

    // Check cache first
    const cacheKey = `search:${JSON.stringify(searchParams)}`;
    const cachedResults = req.cache.get(cacheKey);
    
    if (cachedResults) {
      logger.info(`Returning cached search results for key: ${cacheKey}`);
      return res.json({
        success: true,
        data: cachedResults,
        cached: true,
        searchParams
      });
    }

    const events = await ticketmasterService.searchEvents(searchParams);
    
    // Cache the results
    req.cache.set(cacheKey, events);
    
    res.json({
      success: true,
      data: events,
      cached: false,
      searchParams
    });
  } catch (error) {
    logger.error('Error searching events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search events',
      message: error.message
    });
  }
});

/**
 * GET /events/:id
 * Get event details by ID
 */
router.get('/:id', [
  param('id').isString().withMessage('Event ID must be a string')
], handleValidationErrors, async (req, res) => {
  try {
    const { id } = req.params;

    // Check cache first
    const cacheKey = `event:${id}`;
    const cachedEvent = req.cache.get(cacheKey);
    
    if (cachedEvent) {
      logger.info(`Returning cached event for ID: ${id}`);
      return res.json({
        success: true,
        data: cachedEvent,
        cached: true
      });
    }

    const event = await ticketmasterService.getEventById(id);
    
    // Cache the result
    req.cache.set(cacheKey, event);
    
    res.json({
      success: true,
      data: event,
      cached: false
    });
  } catch (error) {
    logger.error(`Error fetching event ${req.params.id}:`, error);
    
    if (error.message.includes('404') || error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        message: 'The requested event does not exist'
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event details',
      message: error.message
    });
  }
});

/**
 * GET /events/featured
 * Get featured events
 */
router.get('/featured/list', [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
], handleValidationErrors, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;

    // Check cache first
    const cacheKey = `featured:${limit}`;
    const cachedEvents = req.cache.get(cacheKey);
    
    if (cachedEvents) {
      logger.info(`Returning cached featured events for limit: ${limit}`);
      return res.json({
        success: true,
        data: cachedEvents,
        cached: true
      });
    }

    const events = await ticketmasterService.getFeaturedEvents(limit);
    
    // Cache the results
    req.cache.set(cacheKey, events);
    
    res.json({
      success: true,
      data: events,
      cached: false
    });
  } catch (error) {
    logger.error('Error fetching featured events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch featured events',
      message: error.message
    });
  }
});

/**
 * POST /events/register
 * Register for an event (mock implementation)
 */
router.post('/register', [
  body('eventId').isString().withMessage('Event ID is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('firstName').isString().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').isString().isLength({ min: 1 }).withMessage('Last name is required'),
  body('phone').optional().isString().withMessage('Phone must be a string')
], handleValidationErrors, async (req, res) => {
  try {
    const { eventId, email, firstName, lastName, phone } = req.body;

    // In a real implementation, this would save to a database
    // For now, we'll just validate and return success
    
    // Verify event exists
    try {
      await ticketmasterService.getEventById(eventId);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Event not found',
        message: 'The specified event does not exist'
      });
    }

    // Mock registration
    const registration = {
      id: `reg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      eventId,
      email,
      firstName,
      lastName,
      phone,
      registrationDate: new Date().toISOString(),
      status: 'confirmed'
    };

    logger.info(`Event registration created: ${registration.id} for event ${eventId}`);
    
    res.status(201).json({
      success: true,
      data: registration,
      message: 'Registration successful'
    });
  } catch (error) {
    logger.error('Error registering for event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register for event',
      message: error.message
    });
  }
});

/**
 * GET /events/categories
 * Get available event categories
 */
router.get('/categories/list', async (req, res) => {
  try {
    // Return common event categories
    const categories = [
      { id: 'music', name: 'Music', description: 'Concerts and musical events' },
      { id: 'sports', name: 'Sports', description: 'Sporting events and competitions' },
      { id: 'arts', name: 'Arts & Theatre', description: 'Theater, arts, and cultural events' },
      { id: 'family', name: 'Family', description: 'Family-friendly events' },
      { id: 'educational', name: 'Educational', description: 'Workshops and educational events' },
      { id: 'business', name: 'Business', description: 'Conferences and networking events' },
      { id: 'miscellaneous', name: 'Miscellaneous', description: 'Other types of events' }
    ];

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      message: error.message
    });
  }
});

/**
 * GET /events/health
 * Check if the events service is healthy
 */
router.get('/health', async (req, res) => {
  try {
    const isHealthy = await ticketmasterService.testConnection();
    
    res.json({
      success: true,
      healthy: isHealthy,
      service: 'events',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Events service health check failed:', error);
    res.status(503).json({
      success: false,
      healthy: false,
      service: 'events',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Helper function to get featured events (used by main app)
async function getFeaturedEvents(cache, limit = 6) {
  try {
    const cacheKey = `featured:${limit}`;
    const cachedEvents = cache.get(cacheKey);
    
    if (cachedEvents) {
      return cachedEvents;
    }

    const events = await ticketmasterService.getFeaturedEvents(limit);
    cache.set(cacheKey, events);
    
    return events;
  } catch (error) {
    logger.error('Error getting featured events:', error);
    return [];
  }
}

// Export the helper function
router.getFeaturedEvents = getFeaturedEvents;

module.exports = router;
