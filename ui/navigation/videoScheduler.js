// FILE: ui/navigation/videoScheduler.js
// PURPOSE: Time-based video scheduling logic (America/New_York timezone)
// DEPENDENCIES: None (pure scheduling logic)
// VERSION: 2.2.0

const TZ = 'America/New_York';

const SCHEDULE = {
  morningStart: 9 * 60,        // 9:00am
  afternoonStart: 13 * 60,     // 1:00pm
  eveningStart: 15 * 60,       // 3:00pm
  eveningEnd: 18 * 60 + 30,    // 6:30pm
  peakInterval: 20000,
  slowInterval: 60000,
};

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function getCurrentNYParts() {
  const parts = timeFormatter.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  const currentMinutes = hour * 60 + minute;

  return { hour, minute, currentMinutes };
}

function getScheduleState(currentMinutes) {
  const { morningStart, afternoonStart, eveningStart, eveningEnd } = SCHEDULE;

  if (currentMinutes >= eveningEnd || currentMinutes < morningStart) {
    return {
      mode: 'sleep',
      label: 'Sleep Mode (6:30pm-9am)',
      interval: null,
    };
  }

  if (currentMinutes >= morningStart && currentMinutes < afternoonStart) {
    return {
      mode: 'peak',
      label: 'Peak Hours (9am-1pm)',
      interval: SCHEDULE.peakInterval,
    };
  }

  if (currentMinutes >= afternoonStart && currentMinutes < eveningStart) {
    return {
      mode: 'afternoon',
      label: 'Afternoon (1pm-3pm)',
      interval: SCHEDULE.slowInterval,
    };
  }

  if (currentMinutes >= eveningStart && currentMinutes < eveningEnd) {
    return {
      mode: 'evening',
      label: 'Evening Rush (3pm-6:30pm)',
      interval: SCHEDULE.peakInterval,
    };
  }

  return {
    mode: 'fallback',
    label: 'Fallback',
    interval: SCHEDULE.slowInterval,
  };
}

/**
 * Get video play interval based on time of day.
 * TIMEZONE: America/New_York (handles EST/EDT automatically)
 */
export function getSmartVideoInterval() {
  const { currentMinutes } = getCurrentNYParts();
  const state = getScheduleState(currentMinutes);

  if (state.interval === null) {
    console.log('[VIDEO] 😴 Sleep mode (6:30pm-9am) - Video disabled');
  }

  return state.interval;
}

/**
 * Get human-readable schedule description.
 */
export function getScheduleDescription() {
  const { currentMinutes } = getCurrentNYParts();
  return getScheduleState(currentMinutes).label;
}

/**
 * Get current New York time formatted for logging.
 */
export function getCurrentESTTime() {
  const { hour, minute } = getCurrentNYParts();
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

/**
 * Check whether current schedule is in sleep mode.
 */
export function isInSleepMode() {
  const { currentMinutes } = getCurrentNYParts();
  return getScheduleState(currentMinutes).interval === null;
}
