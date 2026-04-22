// FILE: main/adminState.js
// PURPOSE: Shared mutable state for admin panel modules
// VERSION: 1.0.0

export const adminState = {
  syncInProgress: false,
  syncStartedAt: null,
  analyticsInProgress: false,
  analyticsStartedAt: null,
  adminPanelVisible: false,
  autoHideStartTime: null,
};
