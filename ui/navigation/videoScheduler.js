// FILE: ui/navigation/videoScheduler.js
// PURPOSE: Time-based video scheduling logic (EST timezone)
// DEPENDENCIES: None (pure scheduling logic)
// VERSION: 2.1.0

/**
 * Get video play interval based on time of day
 * Custom schedule for maximum battery efficiency
 * TIMEZONE: EST (Eastern Standard Time - America/New_York)
 */
export function getSmartVideoInterval() {
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = estTime.getHours();
  const minute = estTime.getMinutes();
  
  const currentMinutes = hour * 60 + minute;
  
  // Define schedule boundaries (in minutes since midnight)
  const morningStart = 9 * 60;           // 9:00am
  const afternoonStart = 13 * 60;        // 1:00pm
  const eveningStart = 15 * 60;          // 3:00pm
  const eveningEnd = 18 * 60 + 30;       // 6:30pm
  
  // 6:30pm - 9am: NO VIDEO (sleep mode)
  if (currentMinutes >= eveningEnd || currentMinutes < morningStart) {
    console.log('[VIDEO] 😴 Sleep mode (6:30pm-9am) - Video disabled');
    return null;
  }
  
  // 9am - 1pm: Peak hours - every 20 seconds
  if (currentMinutes >= morningStart && currentMinutes < afternoonStart) {
    return 20000;
  }
  
  // 1pm - 3pm: Afternoon slowdown - every 60 seconds
  if (currentMinutes >= afternoonStart && currentMinutes < eveningStart) {
    return 60000;
  }
  
  // 3pm - 6:30pm: Evening rush - every 20 seconds
  if (currentMinutes >= eveningStart && currentMinutes < eveningEnd) {
    return 20000;
  }
  
  return 60000;
}

/**
 * Get human-readable schedule description
 */
export function getScheduleDescription() {
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = estTime.getHours();
  const minute = estTime.getMinutes();
  const currentMinutes = hour * 60 + minute;
  
  const morningStart = 9 * 60;
  const afternoonStart = 13 * 60;
  const eveningStart = 15 * 60;
  const eveningEnd = 18 * 60 + 30;
  
  if (currentMinutes >= eveningEnd || currentMinutes < morningStart) {
    return 'Sleep Mode (6:30pm-9am)';
  } else if (currentMinutes >= morningStart && currentMinutes < afternoonStart) {
    return 'Peak Hours (9am-1pm)';
  } else if (currentMinutes >= afternoonStart && currentMinutes < eveningStart) {
    return 'Afternoon (1pm-3pm)';
  } else if (currentMinutes >= eveningStart && currentMinutes < eveningEnd) {
    return 'Evening Rush (3pm-6:30pm)';
  }
  return 'Unknown';
}

/**
 * Get current EST time formatted for logging
 */
export function getCurrentESTTime() {
  const now = new Date();
  const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${estTime.getHours()}:${estTime.getMinutes().toString().padStart(2, '0')}`;
}
