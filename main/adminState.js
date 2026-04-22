// FILE: main/adminState.js
// PURPOSE: Shared mutable state for admin panel modules
// VERSION: 1.1.0 - sealed + resetAdminState()

export const adminState = Object.seal({
  syncInProgress: false,
  syncStartedAt: null,
  analyticsInProgress: false,
  analyticsStartedAt: null,
  adminPanelVisible: false,
  // autoHideStartTime is shared here so show/hide (adminPanel.js)
  // and countdown logic both read the same reference
  autoHideStartTime: null,
});

export function resetAdminState() {
  adminState.syncInProgress = false;
  adminState.syncStartedAt = null;
  adminState.analyticsInProgress = false;
  adminState.analyticsStartedAt = null;
  adminState.adminPanelVisible = false;
  adminState.autoHideStartTime = null;
}
