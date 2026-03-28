const axios = require('axios');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()]
});

class TicketmasterService {
  constructor() {
    this.apiKey = process.env.TICKETMASTER_API_KEY;
    this.baseURL = 'https://app.ticketmaster.com/discovery/v2';
    
    if (!this.apiKey) {
      throw new Error('TICKETMASTER_API_KEY environment variable is required');
    }
  }

  /**
   * Fetch events from Ticketmaster API
   * @param {Object} options - Search options
   * @param {string} options.keyword - Search keyword
   * @param {string} options.city - City name
   * @param {string} options.startDate - Start date (YYYY-MM-DD)
   * @param {string} options.endDate - End date (YYYY-MM-DD)
   * @param {number} options.size - Number of results (default: 20)
   * @param {number} options.page - Page number (default: 0)
   * @returns {Promise<Array>} Array of events
   */
  async getEvents(options = {}) {
    try {
      const params = {
        apikey: this.apiKey,
        size: options.size || 20,
        page: options.page || 0,
        sort: 'date,asc'
      };

      // Add optional parameters
      if (options.keyword) params.keyword = options.keyword;
      if (options.city) params.city = options.city;
      if (options.startDate) params.startDateTime = `${options.startDate}T00:00:00Z`;
      if (options.endDate) params.endDateTime = `${options.endDate}T23:59:59Z`;
      if (options.classificationName) params.classificationName = options.classificationName;

      logger.info(`Fetching events from Ticketmaster with params:`, params);

      const response = await axios.get(`${this.baseURL}/events.json`, {
        params,
        timeout: 10000,
        headers: {
          'User-Agent': 'UniEvent/1.0.0'
        }
      });

      if (response.data._embedded && response.data._embedded.events) {
        const events = response.data._embedded.events.map(this.transformEvent);
        logger.info(`Successfully fetched ${events.length} events`);
        return events;
      }

      logger.info('No events found in response');
      return [];
    } catch (error) {
      logger.error('Error fetching events from Ticketmaster:', error.message);
      
      if (error.response) {
        logger.error('API Response Error:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      }
      
      throw new Error(`Failed to fetch events: ${error.message}`);
    }
  }

  /**
   * Get event details by ID
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} Event details
   */
  async getEventById(eventId) {
    try {
      const response = await axios.get(`${this.baseURL}/events/${eventId}.json`, {
        params: {
          apikey: this.apiKey
        },
        timeout: 10000
      });

      const event = this.transformEvent(response.data);
      logger.info(`Successfully fetched event details for: ${event.name}`);
      return event;
    } catch (error) {
      logger.error(`Error fetching event ${eventId}:`, error.message);
      throw new Error(`Failed to fetch event details: ${error.message}`);
    }
  }

  /**
   * Search events with advanced filters
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Array>} Array of events
   */
  async searchEvents(searchParams) {
    const options = {
      keyword: searchParams.q,
      city: searchParams.location,
      startDate: searchParams.startDate,
      endDate: searchParams.endDate,
      classificationName: searchParams.category,
      size: searchParams.limit || 20,
      page: searchParams.page || 0
    };

    return this.getEvents(options);
  }

  /**
   * Transform Ticketmaster event data to our format
   * @param {Object} tmEvent - Ticketmaster event object
   * @returns {Object} Transformed event object
   */
  transformEvent(tmEvent) {
    const event = {
      id: tmEvent.id,
      name: tmEvent.name,
      description: tmEvent.description || tmEvent.info || 'No description available',
      url: tmEvent.url,
      source: 'ticketmaster',
      classifications: [],
      images: [],
      dates: null,
      venue: null,
      priceRanges: [],
      seatmap: null,
      promoters: [],
      attractions: []
    };

    // Handle dates
    if (tmEvent.dates) {
      event.dates = {
        start: {
          localDate: tmEvent.dates.start?.localDate,
          localTime: tmEvent.dates.start?.localTime,
          dateTime: tmEvent.dates.start?.dateTime
        },
        status: tmEvent.dates.status?.code,
        timezone: tmEvent.dates.timezone
      };
    }

    // Handle venue
    if (tmEvent._embedded?.venues?.[0]) {
      const venue = tmEvent._embedded.venues[0];
      event.venue = {
        name: venue.name,
        city: venue.city?.name,
        state: venue.state?.name,
        country: venue.country?.name,
        address: venue.address?.line1,
        postalCode: venue.postalCode,
        location: {
          latitude: venue.location?.latitude,
          longitude: venue.location?.longitude
        },
        url: venue.url
      };
    }

    // Handle classifications
    if (tmEvent.classifications) {
      event.classifications = tmEvent.classifications.map(classification => ({
        segment: classification.segment?.name,
        genre: classification.genre?.name,
        subGenre: classification.subGenre?.name,
        type: classification.type?.name,
        subType: classification.subType?.name
      }));
    }

    // Handle images
    if (tmEvent.images) {
      event.images = tmEvent.images.map(image => ({
        url: image.url,
        ratio: image.ratio,
        width: image.width,
        height: image.height,
        fallback: image.fallback
      }));
    }

    // Handle price ranges
    if (tmEvent.priceRanges) {
      event.priceRanges = tmEvent.priceRanges.map(price => ({
        type: price.type,
        currency: price.currency,
        min: price.min,
        max: price.max
      }));
    }

    // Handle seatmap
    if (tmEvent.seatmap) {
      event.seatmap = {
        staticUrl: tmEvent.seatmap.staticUrl
      };
    }

    // Handle promoters
    if (tmEvent.promoters) {
      event.promoters = tmEvent.promoters.map(promoter => ({
        id: promoter.id,
        name: promoter.name,
        description: promoter.description
      }));
    }

    // Handle attractions
    if (tmEvent._embedded?.attractions) {
      event.attractions = tmEvent._embedded.attractions.map(attraction => ({
        id: attraction.id,
        name: attraction.name,
        url: attraction.url,
        classifications: attraction.classifications
      }));
    }

    return event;
  }

  /**
   * Get featured events (events happening soon)
   * @param {number} limit - Number of events to return
   * @returns {Promise<Array>} Array of featured events
   */
  async getFeaturedEvents(limit = 6) {
    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + 30); // Events in next 30 days

    return this.getEvents({
      startDate: today.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      size: limit,
      sort: 'date,asc'
    });
  }

  /**
   * Get events by category
   * @param {string} category - Event category
   * @param {number} limit - Number of events to return
   * @returns {Promise<Array>} Array of events
   */
  async getEventsByCategory(category, limit = 20) {
    return this.getEvents({
      classificationName: category,
      size: limit
    });
  }

  /**
   * Test API connection
   * @returns {Promise<boolean>} Connection status
   */
  async testConnection() {
    try {
      await this.getEvents({ size: 1 });
      logger.info('Ticketmaster API connection test successful');
      return true;
    } catch (error) {
      logger.error('Ticketmaster API connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = TicketmasterService;
