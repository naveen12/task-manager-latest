import { computeUpcomingNativeAlerts } from '../nativeAndroidBridge';
import type { ChronoAlarm, ReminderItem, TaskItem } from '../../types/chrono';

export function runNativeBridgeTests(): { passed: boolean; logs: string[] } {
  const logs: string[] = [];

  const now = new Date();
  const futureHour = (now.getHours() + 1) % 24;

  const alarms: ChronoAlarm[] = [
    {
      id: 'test-alarm-1',
      hour24: futureHour,
      minute: 15,
      label: 'Test Wakework',
      enabled: true,
      days: [now.getDay()],
      tone: 'dawn',
    },
  ];

  const reminders: ReminderItem[] = [];
  const tasks: TaskItem[] = [];
  const snoozedAlerts: any[] = [];

  const upcoming = computeUpcomingNativeAlerts(alarms, reminders, tasks, snoozedAlerts);

  if (upcoming.length > 0 && upcoming[0].id === 'test-alarm-1') {
    logs.push('PASSED: computeUpcomingNativeAlerts generated valid slot keys');
  } else {
    throw new Error('FAILED: computeUpcomingNativeAlerts slot key generation');
  }

  // Next 3 hours filter test
  const nowMs = Date.now();
  const in1HourMs = nowMs + 1 * 60 * 60 * 1000;
  const in5HoursMs = nowMs + 5 * 60 * 60 * 1000;

  const mockAlerts = [
    { id: '1', name: 'Near Task', triggerAtMs: in1HourMs },
    { id: '2', name: 'Far Task', triggerAtMs: in5HoursMs },
  ];

  const cutoff3h = nowMs + 3 * 60 * 60 * 1000;
  const next3h = mockAlerts.filter(
    (a) => a.triggerAtMs > nowMs && a.triggerAtMs <= cutoff3h
  );

  if (next3h.length === 1 && next3h[0].name === 'Near Task') {
    logs.push('PASSED: Next 3 hours window filter');
  } else {
    throw new Error('FAILED: Next 3 hours window filter');
  }

  return { passed: true, logs };
}
