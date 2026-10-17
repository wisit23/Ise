export function remainingSeconds(expiresAt, now = Date.now()) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
}

export function formatCheckoutCountdown(seconds) {
  const safe = Math.max(0, seconds);
  if (safe >= 3600) {
    const hours = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    return `${hours} ชม. ${mins} นาที`;
  }
  const minutes = Math.floor(safe / 60);
  const remaining = String(safe % 60).padStart(2, "0");
  return `${String(minutes).padStart(2, "0")}:${remaining}`;
}
