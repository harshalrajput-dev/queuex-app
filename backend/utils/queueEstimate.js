const ACTIVE_STATUSES = ["PENDING_ASSISTANT", "CONFIRMED", "PATIENT_ARRIVED", "IN_TREATMENT"];
const STATUS_RANK = { IN_TREATMENT: 0, PATIENT_ARRIVED: 1, CONFIRMED: 2, PENDING_ASSISTANT: 3 };
const AVG_CONSULT_MIN = 10;
const BUFFER_MIN = 5;

function cohortKey(booking) {
  return `${booking.doctorName}||${booking.bookingDate}||${booking.slotTime}`;
}

function estimatePositions(bookings) {
  const map = new Map();
  const active = (bookings || []).filter((b) => ACTIVE_STATUSES.includes(b.status));

  const groups = new Map();
  for (const b of active) {
    const key = cohortKey(b);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }

  for (const list of groups.values()) {
    list.sort((a, b) => {
      const byRank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (byRank !== 0) return byRank;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });
    const nowServing = list.find((x) => x.status === "IN_TREATMENT") || list[0] || null;
    list.forEach((booking, idx) => {
      map.set(String(booking._id), {
        tokensAhead: idx,
        position: idx + 1,
        estimatedWaitMinutes: idx === 0 ? 0 : idx * AVG_CONSULT_MIN + BUFFER_MIN,
        nowServingToken: nowServing ? nowServing.tokenId : null
      });
    });
  }

  return map;
}

module.exports = {
  ACTIVE_STATUSES,
  STATUS_RANK,
  AVG_CONSULT_MIN,
  BUFFER_MIN,
  estimatePositions
};
