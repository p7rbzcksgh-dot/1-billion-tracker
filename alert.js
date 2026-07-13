function shouldAttemptMilestone(state, now = Date.now()) {
  const target = Number(state.settings?.alertTarget || 1000000000);
  if (state.alertSent || state.alertSending) return false;
  if (Number(state.counter || 0) < target) return false;
  if (Number(state.milestoneConfirmations || 0) < 2) return false;

  const lastAttempt = state.alertLastAttemptAt ? Date.parse(state.alertLastAttemptAt) : 0;
  if (lastAttempt && now - lastAttempt < 60000) return false;
  return true;
}

module.exports = { shouldAttemptMilestone };
