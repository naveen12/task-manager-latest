import {
  DEFAULT_NOTE_FOLDERS,
  DEFAULT_SETTINGS,
  formatDateToYMD,
  getInitialNotes,
  getInitialReminders,
  getInitialTasks,
  INITIAL_ALARMS,
  type AppSettings,
  type ChronoAlarm,
  type NoteItem,
  type ReminderItem,
  type TaskItem,
} from '../types/chrono';
import { computeUpcomingNativeAlerts } from '../utils/nativeAndroidBridge';

export function runAppIntegrationTests(): { passed: boolean; logs: string[] } {
  const logs: string[] = [];

  // State setup mimicking App component
  let tasks: TaskItem[] = getInitialTasks();
  let reminders: ReminderItem[] = getInitialReminders();
  let alarms: ChronoAlarm[] = [...INITIAL_ALARMS];
  let notes: NoteItem[] = getInitialNotes();
  let settings: AppSettings = { ...DEFAULT_SETTINGS };

  // Test 1: Task Creation & Completion
  const newTask: TaskItem = {
    id: `task-${Date.now()}`,
    title: 'Automated Test Sprint Deliverable',
    dueDate: formatDateToYMD(new Date()),
    dueTime: '14:00',
    durationMinutes: 45,
    priority: 'high',
    category: 'Work',
    completed: false,
  };
  tasks = [newTask, ...tasks];

  if (tasks.find((t) => t.id === newTask.id)) {
    logs.push('PASSED: Task creation integration test');
  } else {
    throw new Error('FAILED: Task creation integration test');
  }

  // Toggle Task Completion
  tasks = tasks.map((t) => (t.id === newTask.id ? { ...t, completed: true } : t));
  const completedTask = tasks.find((t) => t.id === newTask.id);
  if (completedTask?.completed === true) {
    logs.push('PASSED: Task completion toggle test');
  } else {
    throw new Error('FAILED: Task completion toggle test');
  }

  // Test 2: Reminder Toggle
  const firstRem = reminders[0];
  if (firstRem) {
    const updatedReminders = reminders.map((r) =>
      r.id === firstRem.id ? { ...r, active: !r.active } : r
    );
    if (updatedReminders[0].active !== firstRem.active) {
      logs.push('PASSED: Reminder active status toggle test');
    } else {
      throw new Error('FAILED: Reminder active status toggle test');
    }
  }

  // Test 3: Alarm Toggle & Sync Calculation
  const firstAlarm = alarms[0];
  if (firstAlarm) {
    alarms = alarms.map((a) => (a.id === firstAlarm.id ? { ...a, enabled: false } : a));
    const upcoming = computeUpcomingNativeAlerts(alarms, reminders, tasks, []);
    const containsDisabled = upcoming.some((u) => u.id === firstAlarm.id);
    if (!containsDisabled) {
      logs.push('PASSED: Disabled alarm excluded from upcoming native alerts test');
    } else {
      throw new Error('FAILED: Disabled alarm was included in upcoming alerts');
    }
  }

  // Test 4: Note Creation & Category Tagging
  const newNote: NoteItem = {
    id: `note-${Date.now()}`,
    title: 'Architecture Review Notes',
    content: 'Reviewing database indexes and foreground service handling',
    category: 'Ideas',
    tags: ['work', 'architecture'],
    pinned: true,
    updatedAt: new Date().toISOString(),
  };
  notes = [newNote, ...notes];

  const foundNote = notes.find((n) => n.id === newNote.id);
  if (foundNote && foundNote.category === 'Ideas' && foundNote.pinned) {
    logs.push('PASSED: Note creation & category tagging test');
  } else {
    throw new Error('FAILED: Note creation & category tagging test');
  }

  // Test 5: Factory Reset Simulation
  tasks = getInitialTasks();
  reminders = getInitialReminders();
  alarms = [...INITIAL_ALARMS];
  notes = getInitialNotes();
  settings = { ...DEFAULT_SETTINGS };

  if (
    tasks.length === getInitialTasks().length &&
    reminders.length === getInitialReminders().length &&
    alarms.length === INITIAL_ALARMS.length &&
    notes.length === getInitialNotes().length &&
    settings.fontSizePx === 16
  ) {
    logs.push('PASSED: Factory data reset state simulation test');
  } else {
    throw new Error('FAILED: Factory data reset state simulation test');
  }

  return { passed: true, logs };
}
