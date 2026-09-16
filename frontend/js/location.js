window.QX_HOSPITAL = { lat: 21.1961, lng: 72.8302 };

window.QX_LOCALITIES = [
  { name: "Adajan Patiya", lat: 21.2079, lng: 72.8153 },
  { name: "Adajan", lat: 21.213, lng: 72.808 },
  { name: "Athwa Gate", lat: 21.1753, lng: 72.8005 },
  { name: "Althan", lat: 21.1681, lng: 72.8168 },
  { name: "Anand Mahal Road", lat: 21.2142, lng: 72.8261 },
  { name: "Amroli", lat: 21.2053, lng: 72.8732 },
  { name: "Bhestan", lat: 21.1691, lng: 72.8892 },
  { name: "Bhatar", lat: 21.1839, lng: 72.7881 },
  { name: "Bombay Market", lat: 21.168, lng: 72.848 },
  { name: "Canal Road", lat: 21.185, lng: 72.816 },
  { name: "City Light Road", lat: 21.176, lng: 72.794 },
  { name: "Dumas Road", lat: 21.137, lng: 72.775 },
  { name: "Ghod Dod Road", lat: 21.1918, lng: 72.8178 },
  { name: "Jahangirpura", lat: 21.147, lng: 72.849 },
  { name: "Kadodara", lat: 21.186, lng: 72.976 },
  { name: "Kamrej", lat: 21.24, lng: 72.945 },
  { name: "Katargam", lat: 21.2358, lng: 72.8352 },
  { name: "Kharwarnagar", lat: 21.162, lng: 72.848 },
  { name: "Laldarwaja", lat: 21.1965, lng: 72.833 },
  { name: "Limbayat", lat: 21.176, lng: 72.87 },
  { name: "Majura Gate", lat: 21.1961, lng: 72.8302 },
  { name: "Mota Varachha", lat: 21.2176, lng: 72.889 },
  { name: "Nanpura", lat: 21.1897, lng: 72.8139 },
  { name: "Palanpur Patia", lat: 21.2351, lng: 72.8446 },
  { name: "Pandesara", lat: 21.1226, lng: 72.8668 },
  { name: "Piplod", lat: 21.1746, lng: 72.777 },
  { name: "Puna", lat: 21.119, lng: 72.83 },
  { name: "Rander", lat: 21.2467, lng: 72.789 },
  { name: "Ring Road", lat: 21.1929, lng: 72.827 },
  { name: "Sachin", lat: 21.0818, lng: 72.88 },
  { name: "Salabatpura", lat: 21.19, lng: 72.805 },
  { name: "Sarthana", lat: 21.208, lng: 72.864 },
  { name: "Singanpore", lat: 21.21, lng: 72.83 },
  { name: "Udhna Darwaja", lat: 21.176, lng: 72.845 },
  { name: "Udhna", lat: 21.148, lng: 72.859 },
  { name: "Umra", lat: 21.1748, lng: 72.8297 },
  { name: "Ved Road", lat: 21.1831, lng: 72.7989 },
  { name: "Vesu", lat: 21.1596, lng: 72.7995 },
  { name: "Yogi Chowk", lat: 21.185, lng: 72.833 }
];

window.QX_CITY_CENTER = { lat: 21.1702, lng: 72.8311 };

function estimateDistanceKm(addressText) {
  const H = window.QX_HOSPITAL;
  const addr = String(addressText || "").toLowerCase().replace(/[^a-z0-9]/g, " ");
  let best = null;
  let bestLen = 0;
  for (const loc of window.QX_LOCALITIES) {
    const key = loc.name.toLowerCase().replace(/[^a-z0-9]/g, " ");
    if (key.length >= 3 && addr.includes(key) && key.length > bestLen) {
      best = loc;
      bestLen = key.length;
    }
  }
  const p = best || window.QX_CITY_CENTER;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(p.lat - H.lat);
  const dLng = toRad(p.lng - H.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(H.lat)) * Math.cos(toRad(p.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(h));
  const rounded = Math.round(km * 10) / 10;
  return rounded < 0.1 ? 0.1 : rounded;
}

/* ---------- Reverse geocode: lat/lng → nearest Surat locality ---------- */
function reverseGeocodeToLocality(lat, lng) {
  const toRad = (d) => (d * Math.PI) / 180;
  let best = null;
  let bestDist = Infinity;
  for (const loc of window.QX_LOCALITIES) {
    const dLat = toRad(loc.lat - lat);
    const dLng = toRad(loc.lng - lng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat)) * Math.cos(toRad(loc.lat)) * Math.sin(dLng / 2) ** 2;
    const km = 2 * 6371 * Math.asin(Math.sqrt(h));
    if (km < bestDist) {
      bestDist = km;
      best = loc;
    }
  }
  return best ? best.name : "Surat";
}

/* ---------- Route data for traffic estimator ---------- */
window.QX_ROUTES = [
  { id: "ring_road", name: "Ring Road", via: "via Ring Road & Majura Gate", icon: "🛣️" },
  { id: "canal_road", name: "Canal Road", via: "via Canal Road & Nanpura", icon: "🌊" },
  { id: "udhna_main", name: "Udhna Main Road", via: "via Udhna Main Road & Darwaja", icon: "🏙️" },
  { id: "city_light", name: "City Light Road", via: "via City Light Road & Athwa", icon: "💡" },
  { id: "ring_east", name: "Ring Road East", via: "via Ring Road East & Katargam", icon: "🔄" }
];

window.QX_TRAFFIC_LEVELS = [
  { label: "Smooth", emoji: "🟢", css: "qx-traffic-smooth", factor: 1.0 },
  { label: "Moderate", emoji: "🟡", css: "qx-traffic-moderate", factor: 1.35 },
  { label: "Heavy", emoji: "🔴", css: "qx-traffic-heavy", factor: 1.7 }
];

window.QX_TRAFFIC_PATTERNS = {
  ring_road:   [0.3, 0.4, 0.3],
  canal_road:  [0.35, 0.45, 0.2],
  udhna_main:  [0.2, 0.4, 0.4],
  city_light:  [0.4, 0.35, 0.25],
  ring_east:   [0.3, 0.35, 0.35]
};

function generateRoutesFromAddress(addressText) {
  const H = window.QX_HOSPITAL;
  const addr = String(addressText || "").toLowerCase().replace(/[^a-z0-9]/g, " ");
  let origin = null;
  let bestLen = 0;
  for (const loc of window.QX_LOCALITIES) {
    const key = loc.name.toLowerCase().replace(/[^a-z0-9]/g, " ");
    if (key.length >= 3 && addr.includes(key) && key.length > bestLen) {
      origin = loc;
      bestLen = key.length;
    }
  }
  if (!origin) {
    origin = window.QX_CITY_CENTER;
  }

  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(origin.lat - H.lat);
  const dLng = toRad(origin.lng - H.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(H.lat)) * Math.cos(toRad(origin.lat)) * Math.sin(dLng / 2) ** 2;
  const straightKm = 2 * 6371 * Math.asin(Math.sqrt(h));

  const routeDistMultipliers = {
    ring_road: 1.3,
    canal_road: 1.45,
    udhna_main: 1.25,
    city_light: 1.5,
    ring_east: 1.4
  };

  const now = new Date();
  const hour = now.getHours();
  const isRushHour = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 20);

  const routes = window.QX_ROUTES.map((route) => {
    const distMult = routeDistMultipliers[route.id] || 1.35;
    const baseKm = straightKm * distMult;
    const km = Math.round(baseKm * 10) / 10;

    const pattern = window.QX_TRAFFIC_PATTERNS[route.id] || [0.33, 0.34, 0.33];
    const rand = Math.random();
    let trafficIdx = 0;
    if (rand < pattern[0]) trafficIdx = 0;
    else if (rand < pattern[0] + pattern[1]) trafficIdx = 1;
    else trafficIdx = 2;

    if (isRushHour && trafficIdx < 2) trafficIdx = Math.min(trafficIdx + 1, 2);

    const traffic = window.QX_TRAFFIC_LEVELS[trafficIdx];

    const baseSpeedKmh = 28;
    const adjustedSpeed = baseSpeedKmh / traffic.factor;
    let mins = Math.round((km / adjustedSpeed) * 60);
    if (mins < 5) mins = 5;

    return {
      ...route,
      distance: km,
      trafficLabel: traffic.label,
      trafficEmoji: traffic.emoji,
      trafficCss: traffic.css,
      minutes: mins,
      sortKey: mins
    };
  });

  routes.sort((a, b) => a.sortKey - b.sortKey);
  if (routes.length > 0) {
    routes[0].best = true;
  }
  return routes;
}
