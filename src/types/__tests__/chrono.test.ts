import {
  doesReminderOccurOnDate,
  formatDateToYMD,
  getTimeWindowFromHHMM,
  INITIAL_ALARMS,
  getInitialReminders,
  getInitialTasks,
  DEFAULT_SETTINGS,
} from '../chrono';

export function runChronoTests(): { passed: boolean; logs: string[] } {
  const logs: string[] = [];

  // 1. Test formatDateToYMD
  const testDate = new Date(2026, 2, 31); // March 31, 2026
  const formatted = formatDateToYMD(testDate);
  if (formatted === '2026-03-31') {
    logs.push('PASSED: formatDateToYMD correctly formats date');
  } else {
    throw new Error(`FAILED: formatDateToYMD returned ${formatted}`);
  }

  // 2. Test getTimeWindowFromHHMM
  if (
    getTimeWindowFromHHMM('08:30') === 'morning' &&
    getTimeWindowFromHHMM('13:15') === 'afternoon' &&
    getTimeWindowFromHHMM('19:00') === 'evening'
  ) {
    logs.push('PASSED: getTimeWindowFromHHMM categorizes time slots');
  } else {
    throw new Error('FAILED: getTimeWindowFromHHMM categorization');
  }

  // 3. Test doesReminderOccurOnDate
  const reminderDaily = {
    id: 'r1',
    title: 'Water Plants',
    date: '2026-03-01',
    time: '10:00',
    repeat: 'daily' as const,
    priority: 'low' as const,
    active: true,
    completed: false,
  };

  if (doesReminderOccurOnDate(reminderDaily, '2026-03-31')) {
    logs.push('PASSED: doesReminderOccurOnDate handles daily frequency');
  } else {
    throw new Error('FAILED: doesReminderOccurOnDate daily frequency');
  }

  // 4. Test initial data length
  if (
    INITIAL_ALARMS.length > 0 &&
    getInitialReminders().length > 0 &&
    getInitialTasks().length > 0 &&
    DEFAULT_SETTINGS.fontSizePx === 15
  ) {
    logs.push('PASSED: Initial defaults loaded');
  } else {
    throw new Error('FAILED: Initial default data validation');
  }

  return { passed: true, logs };
}
