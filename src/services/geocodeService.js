/**
 * geocodeService.js
 * Wraps the Goong reverse geocoding API to extract district from coordinates.
 * Used to auto-populate pickup.district / delivery.district on RequestTicket.
 */

const axios = require('axios');

const GOONG_API_KEY = process.env.GOONG_API_KEY;
const REVERSE_GEOCODE_URL = 'https://rsapi.goong.io/Geocode';

/**
 * Maps every known variant of a Da Nang district name to the canonical
 * UPPER_SNAKE_CASE enum value used in Route.fromDistrict / Route.toDistrict.
 *
 * Covers:
 *  - Vietnamese with diacritics (as Goong API returns)
 *  - PascalCase (legacy DB values pre-enum)
 *  - Already-normalised values (idempotent)
 */
const DISTRICT_NORMALIZE = {
    // Hải Châu
    'Hải Châu': 'HAI_CHAU',
    'Quận Hải Châu': 'HAI_CHAU',
    'HaiChau': 'HAI_CHAU',
    'HAI_CHAU': 'HAI_CHAU',

    // Thanh Khê
    'Thanh Khê': 'THANH_KHE',
    'Quận Thanh Khê': 'THANH_KHE',
    'ThanhKhe': 'THANH_KHE',
    'THANH_KHE': 'THANH_KHE',

    // Sơn Trà
    'Sơn Trà': 'SON_TRA',
    'Quận Sơn Trà': 'SON_TRA',
    'SonTra': 'SON_TRA',
    'SON_TRA': 'SON_TRA',

    // Ngũ Hành Sơn
    'Ngũ Hành Sơn': 'NGU_HANH_SON',
    'Quận Ngũ Hành Sơn': 'NGU_HANH_SON',
    'NguHanhSon': 'NGU_HANH_SON',
    'NGU_HANH_SON': 'NGU_HANH_SON',

    // Liên Chiểu
    'Liên Chiểu': 'LIEN_CHIEU',
    'Quận Liên Chiểu': 'LIEN_CHIEU',
    'LienChieu': 'LIEN_CHIEU',
    'LIEN_CHIEU': 'LIEN_CHIEU',

    // Cẩm Lệ
    'Cẩm Lệ': 'CAM_LE',
    'Quận Cẩm Lệ': 'CAM_LE',
    'CamLe': 'CAM_LE',
    'CAM_LE': 'CAM_LE',
};

class GeocodeService {

    /**
     * Normalize a raw district string from any source (Goong, legacy DB)
     * to the canonical UPPER_SNAKE_CASE enum used by Route schema.
     * Returns null if unrecognised.
     */
    normalizeDistrict(raw) {
        if (!raw) return null;
        const canonical = DISTRICT_NORMALIZE[raw.trim()];
        if (!canonical) {
            console.warn(`[GeocodeService] Unrecognised district: "${raw}" — not in normalization map`);
        }
        return canonical || null;
    }

    /**
     * Reverse geocode a lat/lng pair to extract the Vietnamese district name.
     * @param {number} lat
     * @param {number} lng
     * @returns {Promise<string|null>} canonical district enum or null
     */
    async reverseGeocode(lat, lng) {
        if (!lat || !lng || !GOONG_API_KEY) return null;

        try {
            const response = await axios.get(REVERSE_GEOCODE_URL, {
                params: {
                    latlng: `${lat},${lng}`,
                    api_key: GOONG_API_KEY
                },
                timeout: 5000
            });

            const results = response.data?.results;
            if (!results || results.length === 0) return null;

            // Goong returns compound.district as the most reliable district field
            const first = results[0];
            const rawDistrict = first?.compound?.district || this._extractFromComponents(first?.address_components);

            const normalized = this.normalizeDistrict(rawDistrict);
            console.log(`[GeocodeService] (${lat},${lng}) → raw="${rawDistrict}" → normalized="${normalized}"`);
            return normalized;
        } catch (err) {
            // Non-blocking: geocoding failure should never break ticket creation
            console.warn(`[GeocodeService] reverseGeocode failed for (${lat},${lng}):`, err.message);
            return null;
        }
    }

    /**
     * Fallback: parse address_components array for district-level entry
     */
    _extractFromComponents(components = []) {
        // Vietnamese district-level types in Goong: administrative_area_level_2
        const districtComp = components.find(c =>
            c.types?.includes('administrative_area_level_2')
        );
        return districtComp?.long_name || null;
    }

    /**
     * Convenience: geocode both pickup and delivery in parallel
     * @returns {{ pickupDistrict: string|null, deliveryDistrict: string|null }}
     */
    async resolveDistricts(pickupCoords, deliveryCoords) {
        const [pickupDistrict, deliveryDistrict] = await Promise.all([
            pickupCoords?.lat && pickupCoords?.lng
                ? this.reverseGeocode(pickupCoords.lat, pickupCoords.lng)
                : Promise.resolve(null),
            deliveryCoords?.lat && deliveryCoords?.lng
                ? this.reverseGeocode(deliveryCoords.lat, deliveryCoords.lng)
                : Promise.resolve(null)
        ]);

        return { pickupDistrict, deliveryDistrict };
    }
}

module.exports = new GeocodeService();
