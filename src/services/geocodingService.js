/**
 * GeocodingService - Sử dụng Goong API để reverse geocode
 * lat/lng → district (quận/huyện)
 */

const axios = require('axios');

const GOONG_API_KEY = process.env.GOONG_API_KEY;
const GOONG_BASE_URL = 'https://rsapi.goong.io';

class GeocodingService {
  /**
   * Reverse geocode: (lat, lng) → district string
   * Uses the first result's address_components to extract the district.
   * In Vietnam, the district level is "quận X", "huyện X", etc.
   */
  async reverseGeocode(lat, lng) {
    if (!lat || !lng) return null;
    if (!GOONG_API_KEY || GOONG_API_KEY === 'your_goong_api_key_here') {
      console.warn('[GeocodingService] GOONG_API_KEY not configured, skipping district lookup');
      return null;
    }

    try {
      const response = await axios.get(`${GOONG_BASE_URL}/Geocoding`, {
        params: {
          latlng: `${lat},${lng}`,
          api_key: GOONG_API_KEY
        },
        timeout: 5000
      });

      const results = response.data?.results;
      if (!results || results.length === 0) return null;

      return this.extractDistrict(results[0].address_components);
    } catch (err) {
      console.error('[GeocodingService] reverse geocoding failed:', err.message);
      return null;
    }
  }

  /**
   * Extract district name from Goong address_components.
   * District is typically the 2nd-to-last component (before city/province).
   * For Vietnam, it matches "Quận", "Huyện", "Thị xã", "Thành phố" (sub-city level).
   */
  extractDistrict(components) {
    if (!components || components.length === 0) return null;

    // Components are ordered from specific → general.
    // We want the component just before the city/province (last).
    // Pattern: [ward, district, city] or [place, ward, district, city]
    // District is typically the 3rd from last if 4+ components, or 2nd from last.
    const districtKeywords = ['quận', 'huyện', 'thị xã', 'thành phố', 'district'];

    for (const component of components) {
      const name = (component.long_name || '').toLowerCase().trim();
      if (districtKeywords.some(kw => name.startsWith(kw))) {
        return component.long_name.trim();
      }
    }

    // Fallback: use the second-to-last component (likely district level)
    if (components.length >= 2) {
      return components[components.length - 2].long_name.trim();
    }

    return null;
  }

  /**
   * Enrich pickup and delivery objects with district via reverse geocoding.
   * Returns { pickup, delivery } with .district fields populated.
   */
  async enrichWithDistricts(pickup, delivery) {
    const [pickupDistrict, deliveryDistrict] = await Promise.all([
      this.reverseGeocode(pickup?.coordinates?.lat, pickup?.coordinates?.lng),
      this.reverseGeocode(delivery?.coordinates?.lat, delivery?.coordinates?.lng)
    ]);

    return {
      pickup: { ...pickup, district: pickupDistrict || pickup?.district || null },
      delivery: { ...delivery, district: deliveryDistrict || delivery?.district || null }
    };
  }
}

module.exports = new GeocodingService();
