require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const NodeCache = require('node-cache');

// Import routes
const eventsRouter = require('./routes/events');
const uploadsRouter = require('./routes/uploads');

// Initialize Express app
const app = express();

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Initialize cache
const cache = new NodeCache({ 
  stdTTL: parseInt(process.env.CACHE_TTL) * 60 || 900, // 15 minutes default
  checkperiod: 120
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", "https://app.ticketmaster.com"]
    }
  }
}));

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});
app.use('/api/', limiter);

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Make cache available to routes
app.use((req, res, next) => {
  req.cache = cache;
  next();
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/events', eventsRouter);
app.use('/uploads', uploadsRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cache: {
      keys: cache.keys().length,
      stats: cache.getStats()
    }
  });
});

// Home page
app.get('/', async (req, res) => {
  try {
    const eventsRouter = require('./routes/events');
    const featuredEvents = await eventsRouter.getFeaturedEvents(req.cache);
    
    res.render('index', {
      title: 'UniEvent - University Event Management System',
      events: featuredEvents,
      moment: require('moment')
    });
  } catch (error) {
    logger.error('Error loading home page:', error);
    res.render('index', {
      title: 'UniEvent - University Event Management System',
      events: [],
      moment: require('moment'),
      error: 'Unable to load events at this time.'
    });
  }
});

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'UniEvent API',
    version: '1.0.0',
    description: 'University Event Management System API',
    endpoints: {
      events: {
        'GET /events': 'Get all events',
        'GET /events/search': 'Search events',
        'GET /events/:id': 'Get event details',
        'POST /events/register': 'Register for event'
      },
      uploads: {
        'POST /uploads/poster': 'Upload event poster',
        'GET /uploads/poster/:filename': 'Get poster image'
      },
      health: {
        'GET /health': 'Health check'
      }
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found.'
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  
  res.status(error.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info(`UniEvent server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Cache TTL: ${cache.options.stdTTL} seconds`);
});

module.exports = app;
