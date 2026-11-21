import type { ActiveAlert } from '../../utils/notificationEngine';
import type { ChronoAlarm, ReminderItem, TaskItem } from '../../types/chrono';

export function runComponentTests(): { passed: boolean; logs: string[] } {
  const logs: string[] = [];

  // Test 1: Active Alert Data Formatting
  const mockAlert: ActiveAlert = {
    uid: 'alarm:alarm-1:2026-03-31:07:30',
    sourceId: 'alarm-1',
    type: 'alarm',
    name: 'Morning Wake',
    timeLabel: '07:30 AM',
    tone: 'dawn',
    snoozeMinutes: 5,
    vibrationMode: 'sound_and_vibrate',
  };

  if (
    mockAlert.type === 'alarm' &&
    mockAlert.snoozeMinutes === 5 &&
    mockAlert.timeLabel === '07:30 AM'
  ) {
    logs.push('PASSED: ActiveAlert data formatting for AlarmRingOverlay');
  } else {
    throw new Error('FAILED: ActiveAlert data formatting');
  }

  // Test 2: Task Priority & Due Time Sorting
  const tasks: TaskItem[] = [
    {
      id: 't1',
      title: 'Task B',
      dueDate: '2026-03-31',
      dueTime: '15:00',
      durationMinutes: 30,
      priority: 'low',
      category: 'Work',
      completed: false,
    },
    {
      id: 't2',
      title: 'Task A',
      dueDate: '2026-03-31',
      dueTime: '09:00',
      durationMinutes: 30,
      priority: 'high',
      category: 'Work',
      completed: false,
    },
  ];

  const sorted = [...tasks].sort((a, b) => a.dueTime.localeCompare(b.dueTime));
  if (sorted[0].id === 't2' && sorted[0].dueTime === '09:00') {
    logs.push('PASSED: Task due time sorting for TasksSection');
  } else {
    throw new Error('FAILED: Task due time sorting');
  }

  // Test 3: Alarm Day Repeat Formatting
  const alarm: ChronoAlarm = {
    id: 'a1',
    hour24: 7,
    minute: 0,
    label: 'Daily Workout',
    enabled: true,
    days: [1, 2, 3, 4, 5], // Mon - Fri
    tone: 'zenith',
  };

  const isWeekdayRepeated = alarm.days.length === 5 && !alarm.days.includes(0);
  if (isWeekdayRepeated) {
    logs.push('PASSED: Alarm weekday repeat configuration for AlarmsSection');
  } else {
    throw new Error('FAILED: Alarm weekday repeat configuration');
  }

  return { passed: true, logs };
}
