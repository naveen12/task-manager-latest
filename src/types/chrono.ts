export type NavTab =
  | 'dashboard'
  | 'tasks'
  | 'reminders'
  | 'alarms'
  | 'notes'
  | 'settings';

export type PriorityLevel = 'low' | 'medium' | 'high';

export type TaskCategory = 'Work' | 'Personal' | 'Family' | 'Routine';

export const TASK_CATEGORIES: TaskCategory[] = [
  'Work',
  'Personal',
  'Family',
  'Routine',
];

export type TimeWindowPreset = 'morning' | 'afternoon' | 'evening';

export const PRIORITY_META: Record<
  PriorityLevel,
  {
    code: 'P1' | 'P2' | 'P3';
    label: string;
    shortLabel: string;
    textClass: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  high: {
    code: 'P1',
    label: 'P1 Critical',
    shortLabel: 'P1 Critical',
    textClass: 'text-amber-600 dark:text-[#F59E0B]',
    bgClass: 'bg-amber-50 dark:bg-[#F59E0B]/15',
    borderClass: 'border-amber-300 dark:border-[#F59E0B]/40',
  },
  medium: {
    code: 'P2',
    label: 'P2 Medium',
    shortLabel: 'P2 Medium',
    textClass: 'text-indigo-600 dark:text-[#818CF8]',
    bgClass: 'bg-indigo-50 dark:bg-[#6366F1]/15',
    borderClass: 'border-indigo-300 dark:border-[#6366F1]/40',
  },
  low: {
    code: 'P3',
    label: 'P3 Low',
    shortLabel: 'P3 Low',
    textClass: 'text-slate-600 dark:text-[#94A3B8]',
    bgClass: 'bg-slate-100 dark:bg-white/[0.06]',
    borderClass: 'border-slate-300 dark:border-white/15',
  },
};

export function normalizeTaskCategory(cat?: string): TaskCategory {
  if (cat === 'Work' || cat === 'Personal' || cat === 'Family' || cat === 'Routine') {
    return cat;
  }
  return 'Work';
}

export function hhmmToMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
  return hh * 60 + mm;
}

export function minutesToHHMM(totalMinutes: number): string {
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTimeRange(startHHMM: string, durationMinutes: number): string {
  const startMin = hhmmToMinutes(startHHMM);
  const endHHMM = minutesToHHMM(startMin + Math.max(1, durationMinutes));
  return `${startHHMM} – ${endHHMM}`;
}

export function getTimeWindowFromHHMM(hhmm: string): TimeWindowPreset {
  const [hh] = hhmm.split(':').map(Number);
  const hour = Number.isNaN(hh) ? 9 : hh;
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function getTimeWindowLabel(slot: TimeWindowPreset): string {
  if (slot === 'morning') return 'Morning';
  if (slot === 'afternoon') return 'Afternoon';
  return 'Evening';
}

export type ThemeMode = 'dark' | 'light';

export type AppFontFamily = 'jakarta' | 'manrope' | 'outfit' | 'lora' | 'mono';

export type AutoBackupFrequency = 'daily' | 'weekly';

export type AutoBackupDestination = 'local' | 'drive' | 'both';

export const DEFAULT_NOTE_FOLDERS = ['General', 'Work', 'Ideas'] as const;

export interface AppSettings {
  theme: ThemeMode;
  fontSizePx: number;
  fontFamily: AppFontFamily;
  gradualAlarmVolume: boolean;
  focusAutoDnd: boolean;
  focusMuteInAppAlerts: boolean;
  autoCarryoverTasks: boolean;
  autoBackupEnabled: boolean;
  autoBackupFrequency: AutoBackupFrequency;
  autoBackupDestination: AutoBackupDestination;
  lastAutoBackupAt?: string;
  lastAutoBackupStatus?: string;
  noteFolders: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  fontSizePx: 16,
  fontFamily: 'jakarta',
  gradualAlarmVolume: true,
  focusAutoDnd: true,
  focusMuteInAppAlerts: true,
  autoCarryoverTasks: true,
  autoBackupEnabled: false,
  autoBackupFrequency: 'daily',
  autoBackupDestination: 'local',
  noteFolders: [...DEFAULT_NOTE_FOLDERS],
};

export interface FocusTimerState {
  presetMinutes: number;
  secondsLeft: number;
  running: boolean;
  endAtMs: number | null;
  linkedTaskId: string | null;
  dndActive: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:MM
  durationMinutes: number;
  priority: PriorityLevel;
  category?: TaskCategory;
  completed: boolean;
  details?: string;
  carriedOverFrom?: string;
}

export type ReminderRepeat = 'once' | 'daily' | 'weekdays' | 'monthly' | 'yearly';

export interface ReminderItem {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  repeat: ReminderRepeat;
  priority: PriorityLevel;
  active: boolean;
  completed: boolean;
  note?: string;
}

export type AlarmTone = 'dawn' | 'amber' | 'zenith' | 'pulse' | 'custom';

export type AlarmVibrationMode = 'sound_and_vibrate' | 'vibrate_only' | 'sound_only';

export const ALARM_SNOOZE_PRESETS = [3, 5, 10, 15, 20] as const;

export interface ChronoAlarm {
  id: string;
  hour24: number;
  minute: number;
  label: string;
  enabled: boolean;
  days: number[]; // 0=Sun, 1=Mon, ..., 6=Sat
  tone: AlarmTone;
  customRingtoneId?: string;
  customRingtoneName?: string;
  snoozeMinutes?: number;
  vibrationMode?: AlarmVibrationMode;
}

export type NoteCategory = string;

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  category: NoteCategory;
  tags?: string[];
  pinned: boolean;
  updatedAt: string; // ISO
}

export function formatDateToYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYMDToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function doesReminderOccurOnDate(
  reminder: ReminderItem,
  targetDateStr: string
): boolean {
  if (reminder.date === targetDateStr) return true;
  if (targetDateStr < reminder.date) return false;

  const targetDate = parseYMDToLocalDate(targetDateStr);
  const startDate = parseYMDToLocalDate(reminder.date);
  const targetWeekday = targetDate.getDay();

  if (reminder.repeat === 'daily') return true;
  if (reminder.repeat === 'weekdays') {
    return targetWeekday >= 1 && targetWeekday <= 5;
  }
  if (reminder.repeat === 'monthly') {
    const daysInTargetMonth = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth() + 1,
      0
    ).getDate();
    const clampedDay = Math.min(startDate.getDate(), daysInTargetMonth);
    return targetDate.getDate() === clampedDay;
  }
  if (reminder.repeat === 'yearly') {
    if (targetDate.getMonth() !== startDate.getMonth()) return false;
    const daysInTargetMonth = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth() + 1,
      0
    ).getDate();
    const clampedDay = Math.min(startDate.getDate(), daysInTargetMonth);
    return targetDate.getDate() === clampedDay;
  }
  return false;
}

export function getTodayDateString(): string {
  return formatDateToYMD(new Date());
}

export function getOffsetDateString(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return formatDateToYMD(d);
}

export function getInitialTasks(): TaskItem[] {
  const today = getTodayDateString();
  const tomorrow = getOffsetDateString(1);
  return [
    {
      id: 'task-1',
      title: 'Finalize system architecture specification',
      dueDate: today,
      dueTime: '09:00',
      durationMinutes: 50,
      priority: 'high',
      category: 'Work',
      completed: true,
      details: 'Review latency targets and database indexing plan',
    },
    {
      id: 'task-2',
      title: 'Build sprint deliverables & unit tests',
      dueDate: today,
      dueTime: '11:00',
      durationMinutes: 90,
      priority: 'high',
      category: 'Work',
      completed: false,
      details: 'Zero notifications — core execution block',
    },
    {
      id: 'task-3',
      title: 'Design critique & UI polish review',
      dueDate: today,
      dueTime: '15:00',
      durationMinutes: 45,
      priority: 'medium',
      category: 'Personal',
      completed: false,
    },
    {
      id: 'task-4',
      title: 'Evening walk & family dinner prep',
      dueDate: tomorrow,
      dueTime: '18:30',
      durationMinutes: 45,
      priority: 'low',
      category: 'Family',
      completed: false,
    },
  ];
}

export function getInitialReminders(): ReminderItem[] {
  const today = getTodayDateString();
  return [
    {
      id: 'rem-1',
      title: 'Hydrate & step away from screen',
      date: today,
      time: '12:30',
      repeat: 'daily',
      priority: 'low',
      active: true,
      completed: false,
      note: '10 minute walk outdoors',
    },
    {
      id: 'rem-2',
      title: 'Submit expense report before cutoff',
      date: today,
      time: '16:30',
      repeat: 'once',
      priority: 'high',
      active: true,
      completed: false,
    },
    {
      id: 'rem-3',
      title: 'Evening shutdown & plan tomorrow',
      date: today,
      time: '18:30',
      repeat: 'weekdays',
      priority: 'medium',
      active: true,
      completed: false,
    },
  ];
}

export const INITIAL_ALARMS: ChronoAlarm[] = [
  {
    id: 'alarm-1',
    hour24: 6,
    minute: 15,
    label: 'Morning Wake',
    enabled: true,
    days: [1, 2, 3, 4, 5],
    tone: 'dawn',
  },
  {
    id: 'alarm-2',
    hour24: 9,
    minute: 55,
    label: 'Deep Work Start',
    enabled: true,
    days: [1, 2, 3, 4, 5],
    tone: 'zenith',
  },
  {
    id: 'alarm-3',
    hour24: 22,
    minute: 30,
    label: 'Wind Down',
    enabled: false,
    days: [0, 1, 2, 3, 4, 5, 6],
    tone: 'amber',
  },
];

export function getInitialNotes(): NoteItem[] {
  return [
    {
      id: 'note-1',
      title: 'Q4 Product Priorities',
      content:
        '# Core Focus\n1. **Tighten onboarding latency** under 400ms.\n2. Simplify mobile thumb navigation labels.\n- [x] Ship offline-first local persistence\n- [ ] Add *voice dictation* to notes',
      category: 'Work',
      pinned: true,
      updatedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
    {
      id: 'note-2',
      title: 'Weekend Reading & Recovery',
      content:
        'Finish chapters 4-6 of *Designing Data-Intensive Applications*. Keep Sunday morning screen-free until 10 AM.',
      category: 'General',
      pinned: false,
      updatedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    },
    {
      id: 'note-3',
      title: 'Voice Note Concepts',
      content:
        '> Explore acoustic cues for focus transitions.\n- Soft harmonic bell on completion\n- Gentle rain filter during sprints',
      category: 'Ideas',
      pinned: false,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    },
  ];
}
