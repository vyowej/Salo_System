/**
 * SALO — Single Source of Truth Formal Address Formatter (mirrors backend AddressFormatter.php)
 * Format: House/Building No. and Street, Barangay, City/Municipality, Province ZIP
 * Example: 123 Rizal Street, Brgy. Carmen, Cagayan de Oro City, Misamis Oriental 9000
 */

function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of keys) {
    const val = obj[key];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

export function mergeLegacyStreetLine(address = {}) {
  if (!address || typeof address !== 'object') return '';
  const house = pick(address, 'houseNumber', 'house_number');
  const building = pick(address, 'buildingName', 'building_name');
  const street = pick(address, 'street', 'restaurant_street');

  const parts = [];
  const lowerStreet = street.toLowerCase();
  if (house && (!street || !lowerStreet.includes(house.toLowerCase()))) {
    parts.push(house);
  }
  if (building && (!street || !lowerStreet.includes(building.toLowerCase()))) {
    parts.push(building);
  }
  if (street) {
    parts.push(street);
  }
  return parts.join(' ');
}

export function formatFormalAddress(address = {}) {
  if (!address || typeof address !== 'object') return '';

  const streetLine = mergeLegacyStreetLine(address);
  const barangay = pick(address, 'barangay', 'barangay_name', 'restaurant_barangay');
  const city = pick(address, 'city', 'city_name', 'restaurant_city');
  const province = pick(address, 'province', 'province_name', 'restaurant_province');
  const postal = pick(address, 'postalCode', 'postal_code');

  let barangayPart = '';
  if (barangay) {
    barangayPart = /^(brgy\.?|barangay)\b/i.test(barangay) ? barangay : `Brgy. ${barangay}`;
  }

  const provinceZip = [province, postal].filter(Boolean).join(' ');

  return [streetLine, barangayPart, city, provinceZip].filter(Boolean).join(', ');
}
