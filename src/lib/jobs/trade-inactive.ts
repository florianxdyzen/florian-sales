/** Discovery: no hard 30-day inactive pin. Calling cycle still recycles Cold/Warm. */
export async function runTradeInactiveAlertsJob() {
  return { alerted: 0, skipped: true as const };
}
