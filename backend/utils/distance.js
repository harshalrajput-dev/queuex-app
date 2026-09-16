const HOSPITAL_COORDS = { lat: 21.1961, lng: 72.8302 };

const SURAT_LOCALITIES = [
  { name: "Adajan Patiya", lat: 21.2079, lng: 72.8153, aliases: ["adajan patia"] },
  { name: "Adajan Gam", lat: 21.213, lng: 72.808, aliases: ["adajan"] },
  { name: "Athwa Gate", lat: 21.1753, lng: 72.8005, aliases: ["athwa", "athwa gate"] },
  { name: "Althan", lat: 21.1681, lng: 72.8168 },
  { name: "Anand Mahal Road", lat: 21.2142, lng: 72.8261, aliases: ["anand mahal"] },
  { name: "Amroli", lat: 21.2053, lng: 72.8732 },
  { name: "Bhestan", lat: 21.1691, lng: 72.8892 },
  { name: "Bhatar", lat: 21.1839, lng: 72.7881, aliases: ["bhatar road"] },
  { name: "Bombay Market", lat: 21.168, lng: 72.848 },
  { name: "Begampura", lat: 21.198, lng: 72.84 },
  { name: "Canal Road", lat: 21.185, lng: 72.816, aliases: ["canal"] },
  { name: "City Light Road", lat: 21.176, lng: 72.794, aliases: ["citylight", "city light"] },
  { name: "Dumas Road", lat: 21.137, lng: 72.775, aliases: ["dumas"] },
  { name: "Ghod Dod Road", lat: 21.1918, lng: 72.8178, aliases: ["ghoddod"] },
  { name: "Jahangirpura", lat: 21.147, lng: 72.849 },
  { name: "Kadodara", lat: 21.186, lng: 72.976 },
  { name: "Kamrej", lat: 21.24, lng: 72.945 },
  { name: "Katargam", lat: 21.2358, lng: 72.8352 },
  { name: "Kharwarnagar", lat: 21.162, lng: 72.848, aliases: ["kharwar nagar"] },
  { name: "Laldarwaja", lat: 21.1965, lng: 72.833, aliases: ["laldarwaja", "lal darwaja"] },
  { name: "Limbayat", lat: 21.176, lng: 72.87 },
  { name: "Mahidharpura", lat: 21.193, lng: 72.835 },
  { name: "Majura Gate", lat: 21.1961, lng: 72.8302, aliases: ["majura"] },
  { name: "Mota Varachha", lat: 21.2176, lng: 72.889, aliases: ["mota varacha"] },
  { name: "Nanpura", lat: 21.1897, lng: 72.8139 },
  { name: "Palanpur Patia", lat: 21.2351, lng: 72.8446, aliases: ["palanpur patia"] },
  { name: "Pandesara", lat: 21.1226, lng: 72.8668 },
  { name: "Piplod", lat: 21.1746, lng: 72.777 },
  { name: "Puna Gam", lat: 21.119, lng: 72.83, aliases: ["puna"] },
  { name: "Raghunathpura", lat: 21.196, lng: 72.838 },
  { name: "Rander", lat: 21.2467, lng: 72.789 },
  { name: "Ring Road", lat: 21.1929, lng: 72.827, aliases: ["ring road"] },
  { name: "Sachin", lat: 21.0818, lng: 72.88 },
  { name: "Sagrampura", lat: 21.2, lng: 72.835 },
  { name: "Salabatpura", lat: 21.19, lng: 72.805 },
  { name: "Sarthana", lat: 21.208, lng: 72.864, aliases: ["sarthana jakatnaka"] },
  { name: "Singanpore", lat: 21.21, lng: 72.83, aliases: ["singapore"] },
  { name: "Suryapur", lat: 21.205, lng: 72.825 },
  { name: "Tamboli Bazar", lat: 21.194, lng: 72.82 },
  { name: "Udhna Darwaja", lat: 21.176, lng: 72.845, aliases: ["udhna darwaja", "udhna gate"] },
  { name: "Udhna", lat: 21.148, lng: 72.859 },
  { name: "Umra", lat: 21.1748, lng: 72.8297 },
  { name: "Ved Road", lat: 21.1831, lng: 72.7989 },
  { name: "Vesu", lat: 21.1596, lng: 72.7995 },
  { name: "Yogi Chowk", lat: 21.185, lng: 72.833 }
];

const SURAT_CENTER = { lat: 21.1702, lng: 72.8311 };

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, " ");
}

function findLocality(addressText) {
  const addrNorm = normalize(addressText);
  if (!addrNorm) return null;
  let best = null;
  let bestLen = 0;
  for (const loc of SURAT_LOCALITIES) {
    const keys = [loc.name, ...(loc.aliases || [])].map(normalize);
    for (const key of keys) {
      if (key && key.length >= 3 && addrNorm.includes(key) && key.length > bestLen) {
        best = loc;
        bestLen = key.length;
      }
    }
  }
  return best;
}

function estimateDistanceKm(addressText) {
  const loc = findLocality(addressText);
  const coords = loc ? { lat: loc.lat, lng: loc.lng } : SURAT_CENTER;
  const raw = haversineKm(HOSPITAL_COORDS, coords);
  const rounded = Math.round(raw * 10) / 10;
  return rounded < 0.1 ? 0.1 : rounded;
}

function calcDistanceFromCoords(lat, lng) {
  const raw = haversineKm(HOSPITAL_COORDS, { lat, lng });
  const rounded = Math.round(raw * 10) / 10;
  return rounded < 0.1 ? 0.1 : rounded;
}

function estimateTravelMinutes(distanceKm) {
  const avgSpeedKmh = 25;
  const mins = Math.round((distanceKm / avgSpeedKmh) * 60);
  return mins < 3 ? 3 : mins;
}

function calcDistanceAndETA(lat, lng, customAddress) {
  let distanceKm;
  let estimatedTravelMinutes;
  let resolvedAddress = "";

  if (lat != null && lng != null) {
    distanceKm = calcDistanceFromCoords(lat, lng);
    const locality = reverseGeocodeAddress(lat, lng);
    resolvedAddress = locality || "";
  } else if (customAddress) {
    distanceKm = estimateDistanceKm(customAddress);
  } else {
    distanceKm = estimateDistanceKm("");
  }
  estimatedTravelMinutes = estimateTravelMinutes(distanceKm);
  return { distanceKm, estimatedTravelMinutes, resolvedAddress };
}

function reverseGeocodeAddress(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const loc of SURAT_LOCALITIES) {
    const d = haversineKm({ lat, lng }, { lat: loc.lat, lng: loc.lng });
    if (d < bestDist) {
      bestDist = d;
      best = loc;
    }
  }
  return best ? best.name + ", Surat" : "Surat";
}

module.exports = {
  HOSPITAL_COORDS,
  SURAT_LOCALITIES,
  estimateDistanceKm,
  haversineKm,
  calcDistanceFromCoords,
  estimateTravelMinutes,
  calcDistanceAndETA,
  reverseGeocodeAddress
};
