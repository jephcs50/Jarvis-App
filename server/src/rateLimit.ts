/**
 * In-memory per-user limits: a sliding one-minute window and a daily count (UTC day).
 * State resets when the server restarts, which is fine for a small personal deployment.
 */
export class RateLimiter {
  private minute = new Map<string, number[]>();
  private day = new Map<string, { day: string; count: number }>();

  private perMinute: number;
  private perDay: number;
  private now: () => number;

  constructor(perMinute: number, perDay: number, now: () => number = Date.now) {
    this.perMinute = perMinute;
    this.perDay = perDay;
    this.now = now;
  }

  /** Records a request. Returns null if allowed, or the seconds to wait if not. */
  take(user: string): number | null {
    const now = this.now();
    const today = new Date(now).toISOString().slice(0, 10);

    const daily = this.day.get(user);
    const count = daily?.day === today ? daily.count : 0;
    if (count >= this.perDay) {
      const midnight = Date.parse(`${today}T00:00:00Z`) + 86_400_000;
      return Math.ceil((midnight - now) / 1000);
    }

    const recent = (this.minute.get(user) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= this.perMinute) {
      return Math.max(1, Math.ceil((recent[0] + 60_000 - now) / 1000));
    }

    recent.push(now);
    this.minute.set(user, recent);
    this.day.set(user, { day: today, count: count + 1 });
    return null;
  }
}
