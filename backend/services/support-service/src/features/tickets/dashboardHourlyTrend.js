// Use the same UTC day boundary as the daily dashboard series.
function dashboardHourlyTrend(created, now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    count: 0,
  }));
  for (const { createdAt } of created) {
    if (createdAt >= start && createdAt <= now) {
      hours[createdAt.getUTCHours()].count += 1;
    }
  }
  return hours;
}

module.exports = dashboardHourlyTrend;
