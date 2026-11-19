import {
  doesReminderOccurOnDate,
  formatTimeRange,
  getOffsetDateString,
  getTimeWindowFromHHMM,
  getTimeWindowLabel,
  getTodayDateString,
  hhmmToMinutes,
  normalizeTaskCategory,
  PRIORITY_META,
  TASK_CATEGORIES,
  type AppSettings,
  type ChronoAlarm,
  type NoteItem,
  type PriorityLevel,
  type ReminderItem,
  type TaskCategory,
  type TaskItem,
} from '../types/chrono';

export interface HelpContextData {
  tasks: TaskItem[];
  reminders: ReminderItem[];
  alarms: ChronoAlarm[];
  notes: NoteItem[];
  settings: AppSettings;
}

export interface HelpAnswer {
  id: string;
  question: string;
  title: string;
  category: 'Your Data' | 'Functionality' | 'Process' | 'Out of Scope';
  summary: string;
  bullets: string[];
  inScope: boolean;
  followUps?: string[];
}

export interface HelpTopicGuide {
  id: string;
  title: string;
  category: 'Functionality' | 'Process';
  keywords: string[];
  phrases: string[];
  summary: string;
  bullets: string[];
  followUps: string[];
}

export const HELP_QUICK_PROMPTS: {
  group: 'Your Configured Data' | 'Features & Processes';
  question: string;
}[] = [
  { group: 'Your Configured Data', question: 'What is on my schedule today?' },
  { group: 'Your Configured Data', question: 'Show my P1 Critical tasks and reminders' },
  { group: 'Your Configured Data', question: 'Do I have any overlapping tasks?' },
  { group: 'Your Configured Data', question: 'When is my next alarm?' },
  { group: 'Your Configured Data', question: 'List my active reminders' },
  { group: 'Your Configured Data', question: 'What notes are pinned or saved?' },
  { group: 'Features & Processes', question: 'How do Time Slots, overlap warnings, and Auto-Carryover work?' },
  { group: 'Features & Processes', question: 'How does Focus Timer block distractions (Do Not Disturb)?' },
  { group: 'Features & Processes', question: 'How do Alarm Snooze Presets and Vibration Modes work?' },
  { group: 'Features & Processes', question: 'How do Android Lock-Screen permissions and Home Widget work?' },
  { group: 'Features & Processes', question: 'How do Note Folders, Tags, Checklists, and Voice-to-Text work?' },
  { group: 'Features & Processes', question: 'How do Scheduled Auto-Backup and Backup Export & Import work?' },
];

export const KAIRO_ABOUT_INFO = {
  appName: 'Kairo',
  version: '1.5.0',
  edition: 'Free & Offline-First Edition',
  tagline:
    'Time-blocked tasks with auto-carryover, smart recurring reminders, customizable wheel alarms, folder/tagged voice notes, and native Android lock-screen alerts & widget.',
  architecture:
    'Client-first React + TypeScript workspace storing data locally in browser/device storage (localStorage & IndexedDB), with optional Google Drive backup and Capacitor native Android alarm scheduling.',
};

function format12Hour(hour24: number, minute: number): string {
  const h12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}

function format12HourFromHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  return format12Hour(h, m);
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatAlarmDays(days: number[]): string {
  if (days.length === 0 || days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join(',') === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join(',') === '0,6') return 'Weekends';
  return sorted.map((d) => WEEKDAY_NAMES[d] ?? '').filter(Boolean).join(', ');
}

function priorityRank(p: PriorityLevel): number {
  if (p === 'high') return 0;
  if (p === 'medium') return 1;
  return 2;
}

function findOverlappingTasks(tasks: TaskItem[]): Array<{
  date: string;
  first: TaskItem;
  second: TaskItem;
}> {
  const byDate = new Map<string, TaskItem[]>();
  tasks
    .filter((t) => !t.completed)
    .forEach((t) => {
      const arr = byDate.get(t.dueDate) ?? [];
      arr.push(t);
      byDate.set(t.dueDate, arr);
    });

  const conflicts: Array<{ date: string; first: TaskItem; second: TaskItem }> = [];
  byDate.forEach((dayTasks, date) => {
    const sorted = [...dayTasks].sort(
      (a, b) => hhmmToMinutes(a.dueTime) - hhmmToMinutes(b.dueTime)
    );
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const aStart = hhmmToMinutes(a.dueTime);
      const aEnd = aStart + Math.max(1, a.durationMinutes);
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        const bStart = hhmmToMinutes(b.dueTime);
        const bEnd = bStart + Math.max(1, b.durationMinutes);
        if (aStart < bEnd && aEnd > bStart) {
          conflicts.push({ date, first: a, second: b });
        }
      }
    }
  });
  return conflicts;
}

function computeNextAlarmOccurrence(
  alarms: ChronoAlarm[],
  now: Date
): { alarm: ChronoAlarm; deltaMinutes: number; dayLabel: string } | null {
  const enabled = alarms.filter((a) => a.enabled);
  if (enabled.length === 0) return null;

  const nowDay = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  let best: { alarm: ChronoAlarm; deltaMinutes: number; dayLabel: string } | null = null;

  for (const alarm of enabled) {
    const alarmMinutes = alarm.hour24 * 60 + alarm.minute;
    const validDays = alarm.days.length > 0 ? alarm.days : [0, 1, 2, 3, 4, 5, 6];

    for (let offset = 0; offset <= 7; offset++) {
      const candidateDay = (nowDay + offset) % 7;
      if (!validDays.includes(candidateDay)) continue;
      const delta = offset * 1440 + (alarmMinutes - nowMinutes);
      if (delta <= 0) continue;

      const dayLabel =
        offset === 0
          ? 'Today'
          : offset === 1
          ? 'Tomorrow'
          : WEEKDAY_NAMES[candidateDay] ?? 'Upcoming';

      if (!best || delta < best.deltaMinutes) {
        best = { alarm, deltaMinutes: delta, dayLabel };
      }
      break;
    }
  }

  return best;
}

function formatDurationDelta(totalMinutes: number): string {
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs <= 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export const HELP_TOPIC_GUIDES: HelpTopicGuide[] = [
  {
    id: 'dashboard-timeline',
    title: 'Dashboard & Time-Based Schedule',
    category: 'Functionality',
    keywords: [
      'dashboard',
      'timeline',
      'schedule',
      'calendar',
      'quick',
      'copy day',
      'filter',
      'summary',
      'home',
      'morning',
      'afternoon',
      'evening',
    ],
    phrases: [
      'how does dashboard work',
      'time based schedule',
      'how to use calendar',
      'quick add button',
    ],
    summary:
      'The Dashboard combines your selected day’s Tasks and Reminders into a single chronological Morning / Afternoon / Evening schedule sorted by time and priority.',
    bullets: [
      'Chronological Grouping: Items are grouped into Morning (00:00–11:59), Afternoon (12:00–16:59), and Evening (17:00–23:59), ordered by time and then priority (P1 Critical -> P2 Medium -> P3 Low).',
      'Schedule Filters: Use the pill filters (All, P1 Critical, Tasks, Reminders, Alarms) above the timeline to focus immediately.',
      'Collapsible Calendar: Tap "Show Calendar" in the Dashboard header to inspect any date with dot indicators and jump directly to creating items for that date.',
      'Quick "+" Action & Copy Day: Tap "+" to create a Task, Reminder, Alarm, or Note, or tap "Copy Day" to copy the full day’s time-blocked agenda to your clipboard.',
    ],
    followUps: ['What is on my schedule today?', 'Show my P1 Critical tasks and reminders'],
  },
  {
    id: 'focus-timer-dnd',
    title: 'Focus Timer & Auto Do Not Disturb (Distraction Shield)',
    category: 'Process',
    keywords: [
      'focus',
      'timer',
      'countdown',
      'pomodoro',
      'dnd',
      'disturb',
      'distraction',
      'distractions',
      'mute',
      'silence',
      'shield',
      'block',
    ],
    phrases: [
      'focus timer',
      'do not disturb',
      'stop distractions',
      'mute other apps',
      'block other apps',
    ],
    summary:
      'The Focus Timer runs 15m/25m/45m/60m deep-work sprints, optionally links to a pending task, silences Kairo task/reminder popups, and automatically toggles Android Do Not Disturb to mute other apps.',
    bullets: [
      '1. Pick Duration & Optional Task: Select 15m, 25m, 45m, or 60m on the Dashboard Focus Timer and optionally pick a task to focus on.',
      '2. Auto-Mute WhatsApp, Calls & Apps (Android APK): Tap "Enable DND" on the Focus Timer card (or in Settings) to grant Do Not Disturb Access. Starting Focus applies a strict DND policy that silences WhatsApp messages, incoming call ringers, repeat callers, and pop-up banners while allowing alarms.',
      '3. Live Lock-Screen Countdown & Auto-Restore: While Focus runs on Android, a live countdown timer (with Full Screen and End Focus buttons) stays visible right when you tap your locked screen. Pausing, ending, or finishing automatically restores your previous notification settings and plays a Focus Complete alert.',
      '4. Quiet Kairo Popups: While focusing, non-alarm Kairo task/reminder banners can be deferred (controlled in Settings -> Notifications & Alert Popups).',
    ],
    followUps: ['What is on my schedule today?', 'How do I allow Android Overlay / Lock-Screen permissions?'],
  },
  {
    id: 'tasks-workflow',
    title: 'Tasks: Time Slots, Overlap Warnings & Auto-Carryover',
    category: 'Process',
    keywords: [
      'task',
      'tasks',
      'duration',
      'time slot',
      'timeslot',
      'overlap',
      'overbook',
      'overbooking',
      'carryover',
      'carry',
      'overdue',
      'missed',
      'rollover',
      'category',
      'categories',
      'work',
      'personal',
      'family',
      'routine',
      'p1',
      'p2',
      'p3',
      'priority',
      'critical',
    ],
    phrases: [
      'how do tasks work',
      'how to create a task',
      'how do time slots work',
      'overlap warning',
      'task duration',
      'auto carryover',
      'missed tasks',
      'carry over tasks',
    ],
    summary:
      'Tasks support explicit time blocks, overlap detection, contextual categories (Work, Personal, Family, Routine), P1–P3 priorities, start-time alerts, and Auto-Carryover for missed tasks.',
    bullets: [
      '1. Set Title, Category & Priority: Choose Work, Personal, Family, or Routine, and assign P1 Critical (Big 3 non-negotiables), P2 Medium, or P3 Low.',
      '2. Anchor a Time Slot: Pick a date, start time, or tap Morning (09:00), Afternoon (13:00), or Evening (18:00) presets. Kairo displays the exact end-time range automatically.',
      '3. Duration & Overlap Protection: Clear and type any duration in Minutes (1–720m) or tap quick chips (15m–120m). Overlapping uncompleted tasks on the same day display an Overlap warning.',
      '4. Auto-Carryover for Missed Tasks: When enabled (in the Tasks header or Settings -> Notifications & Alert Popups), uncompleted past-due tasks automatically move forward to today with a "From <date>" badge. If turned off, an overdue banner offers a one-tap "Carry Over to Today" button.',
    ],
    followUps: ['Do I have any overlapping tasks?', 'What tasks do I have today?'],
  },
  {
    id: 'reminders-workflow',
    title: 'Reminders & Recurrence Rules',
    category: 'Process',
    keywords: [
      'reminder',
      'reminders',
      'repeat',
      'recurrence',
      'daily',
      'weekdays',
      'monthly',
      'yearly',
      'once',
      'pause',
      'active',
    ],
    phrases: [
      'how do reminders work',
      'recurring reminder',
      'how to create a reminder',
      'pause reminder',
    ],
    summary:
      'Reminders notify you on one-time or recurring schedules (Once, Daily, Weekdays, Monthly, Yearly) with P1–P3 priority tags and independent Active toggles.',
    bullets: [
      'Recurrence Modes: Choose Once, Daily, Weekdays (Mon–Fri), Monthly (clamped safely for short months), or Yearly.',
      'Active Toggle vs Completed: Flip the Active switch to pause a recurring reminder temporarily without deleting it, or check it off once completed.',
      'Priority Hierarchy: Filter and sort reminders by P1 Critical, P2 Medium, or P3 Low.',
      'Alert Delivery: Active, uncompleted reminders trigger both in-app Snooze / Stop popups and native Android lock-screen alerts.',
    ],
    followUps: ['List my active reminders', 'Show my P1 Critical tasks and reminders'],
  },
  {
    id: 'alarms-ringtones',
    title: 'Alarms: Temporal Wheel, Snooze Presets & Vibration Modes',
    category: 'Process',
    keywords: [
      'alarm',
      'alarms',
      'ringtone',
      'ringtones',
      'wheel',
      'temporal',
      'crescendo',
      'gradual',
      'volume',
      'snooze',
      'preset',
      'presets',
      'vibrate',
      'vibration',
      'silent',
      'stop',
      'chime',
      'sound',
      'audio',
      'custom',
    ],
    phrases: [
      'how do alarms work',
      'gradual ringtone volume',
      'custom ringtone',
      'add ringtone',
      'how to snooze',
      'snooze preset',
      'vibration mode',
      'vibrate only',
    ],
    summary:
      'Alarms feature the Temporal Wheel time picker, weekday repeat chips, built-in chimes or device ringtones, 15s gradual volume crescendo, plus per-alarm Snooze Presets and Vibration Modes.',
    bullets: [
      'Create an Alarm: Tap New Alarm, drag or tap the Temporal Wheel for hour/minute, set repeat days, and choose a built-in chime (Dawn, Amber, Zenith, Pulse) or upload an OS/Device Ringtone stored offline in IndexedDB.',
      'Snooze Presets (Per Alarm): Choose 3m, 5m, 10m, 15m, or 20m directly in the New/Edit Alarm form. Both the in-app popup and Android lock-screen button honor your alarm’s chosen snooze duration.',
      'Vibration & Ring Modes (Per Alarm): Set each alarm to Sound + Vibrate, Vibrate Only (silent ring, tactile buzz), or Sound Only (no vibration).',
      'Gradual Volume (Crescendo): Toggle in Settings -> Notifications & Alert Popups to gently ramp alarm volume from soft to full over 15 seconds on Web and Android.',
    ],
    followUps: ['When is my next alarm?', 'Show all my configured alarms'],
  },
  {
    id: 'notes-formatting-voice',
    title: 'Notes: Folders, Tags, Pinning, Checklists & Task Conversion',
    category: 'Process',
    keywords: [
      'note',
      'notes',
      'folder',
      'folders',
      'tag',
      'tags',
      'convert',
      'checklist',
      'format',
      'formatting',
      'list',
      'bullets',
      'numbered',
      'voice',
      'dictation',
      'mic',
      'microphone',
      'speech',
      'pin',
      'pinned',
    ],
    phrases: [
      'how to format notes',
      'voice to text',
      'speech to text',
      'how does dictation work',
      'note folders',
      'note tags',
      'convert checklist',
      'checklist to task',
    ],
    summary:
      'Notes support custom Folders, Tags, Pinning, list formatting (Bullets, Numbered, Checklists), interactive checklist toggling, 1-tap conversion to Tasks/Reminders, and Voice-to-Text.',
    bullets: [
      'Folders, Tags & Pinning: Organize notes into General, Work, Ideas, or your own "+ New Folder" categories, attach clickable tags (#urgent, #meeting, #shopping, or custom tags), and pin key notes above the main list.',
      'Formatting Toolbar: Use Bullets (- item), Numbered (1. item), or Checklist (- [ ] item) above the editor, and toggle Edit vs Preview anytime.',
      'Convert Checklist Line -> Task / Reminder: Toggle checklist boxes right on saved note cards, or tap the Task / Reminder button next to any checklist line to create a scheduled item in one tap.',
      'Voice-to-Text Dictation: Tap the Mic icon on Title or Content to dictate via native Android Speech Recognition (APK) or Web Speech API (browser).',
    ],
    followUps: ['What notes are pinned or saved?', 'How do Time Slots, overlap warnings, and Auto-Carryover work?'],
  },
  {
    id: 'android-permissions-alerts',
    title: 'Android Lock-Screen Alerts, Permissions & Quick-Add Widget',
    category: 'Process',
    keywords: [
      'android',
      'apk',
      'permission',
      'permissions',
      'lock',
      'lockscreen',
      'lock-screen',
      'overlay',
      'draw over',
      'denied',
      'restricted',
      'foreground',
      'heads-up',
      'headsup',
      'full screen',
      'battery',
      'notification',
      'notifications',
      'widget',
      'homescreen',
      'home screen',
      'quick add',
    ],
    phrases: [
      'overlay denied',
      'app was denied access',
      'allow restricted settings',
      'alarm not ringing when locked',
      'android permissions',
      'lock screen alert',
      'home screen widget',
      'quick add widget',
    ],
    summary:
      'On Android, Kairo provides exact lock-screen alerts via AlarmForegroundService, Do Not Disturb access for Focus Timer, and a Home Screen Quick-Add Widget.',
    bullets: [
      'Grant All 8 Android Permissions: Open Settings -> Notifications & Alert Popups and enable Notifications, Full-Screen Intent, Overlay, Exact Alarm, Unrestricted Battery, Do Not Disturb Access, Microphone, and Music/Audio Storage.',
      'Fixing "App was denied access" for Overlay (Android 13+): Tap "App Info" -> tap ⋮ (top-right) -> "Allow restricted settings" -> return and tap Enable. On Xiaomi, Oppo, Vivo, Realme & OnePlus, also allow "Show on Lock Screen" and "Display pop-up windows while running in background" under App Info -> Other permissions.',
      'Verify Lock-Screen Alarm: Tap "Test Lock-Screen (5s)" inside Settings -> Notifications & Alert Popups and lock your phone immediately to confirm Snooze & Stop pop up over the lock screen.',
      'Home Screen Quick-Add Widget: Long-press your Android home screen -> Widgets -> Kairo Quick Add. It displays today’s remaining tasks, reminders, next alarm, and 1-tap "+ Task", "+ Remind", "+ Alarm", and "+ Note" shortcuts.',
    ],
    followUps: ['When is my next alarm?', 'How does Focus Timer block distractions (Do Not Disturb)?'],
  },
  {
    id: 'backup-appearance-clipboard',
    title: 'Appearance, Backup Export & Import & Scheduled Auto-Backup',
    category: 'Process',
    keywords: [
      'backup',
      'auto-backup',
      'autobackup',
      'schedule',
      'scheduled',
      'restore',
      'export',
      'import',
      'drive',
      'google',
      'theme',
      'dark',
      'light',
      'font',
      'size',
      'typography',
      'copy',
      'paste',
      'clipboard',
      'settings',
      'privacy',
      'offline',
      'storage',
      'path',
      'location',
    ],
    phrases: [
      'how to backup',
      'scheduled auto backup',
      'auto backup',
      'google drive backup',
      'export backup',
      'backup location',
      'change theme',
      'change font',
      'copy and paste',
    ],
    summary:
      'Customize Dark/Light theme and combined Font Size & App Font settings, export or paste portable backups, sync to Google Drive, and automate snapshots with Scheduled Auto-Backup.',
    bullets: [
      'Appearance & Collapsed Settings: All Settings cards start collapsed for a clean view (use Expand All / Collapse All). Open "Font Size & App Font" to adjust scale (13px–22px) and font family together.',
      'Backup Export & Import: Use Copy Backup, Paste Backup, Export Backup, or Import Backup inside Settings -> Backup & Google Drive. On Android APK, exports save to Internal Storage/Download/Kairo/ and show the exact path.',
      'Scheduled Auto-Backup: Enable Scheduled Auto-Backup to run Daily or Weekly to Local storage, Google Drive (kairo-auto-backup.json), or Both, with a "Back Up Now" button and web snapshot download.',
      'Universal Copy & Paste: Text inputs and outputs across Tasks, Reminders, Alarms, Notes, and Help include one-tap Copy and Paste controls.',
    ],
    followUps: ['What is on my schedule today?', 'Show summary of my configured items'],
  },
];

function formatTaskLine(t: TaskItem): string {
  const prio = PRIORITY_META[t.priority]?.shortLabel ?? t.priority;
  const cat = normalizeTaskCategory(t.category);
  const windowLabel = getTimeWindowLabel(getTimeWindowFromHHMM(t.dueTime));
  const status = t.completed ? 'Done' : 'Pending';
  const carryoverNote = t.carriedOverFrom ? ` (from ${t.carriedOverFrom})` : '';
  return `[${status}] ${t.dueDate}${carryoverNote} · ${formatTimeRange(t.dueTime, t.durationMinutes)} (${windowLabel}) · ${t.title} — ${prio} · ${cat}`;
}

function formatReminderLine(r: ReminderItem): string {
  const prio = PRIORITY_META[r.priority]?.shortLabel ?? r.priority;
  const state = r.completed ? 'Done' : r.active ? 'Active' : 'Paused';
  return `[${state}] ${r.date} at ${format12HourFromHHMM(r.time)} (${r.repeat}) · ${r.title} — ${prio}`;
}

function formatAlarmLine(a: ChronoAlarm): string {
  const toneName = a.tone === 'custom' && a.customRingtoneName ? `Custom: ${a.customRingtoneName}` : a.tone;
  const snoozeMins = a.snoozeMinutes ?? 5;
  const vibMode =
    a.vibrationMode === 'vibrate_only'
      ? 'Vibrate Only'
      : a.vibrationMode === 'sound_only'
        ? 'Sound Only'
        : 'Sound + Vibrate';
  return `[${a.enabled ? 'ON' : 'OFF'}] ${format12Hour(a.hour24, a.minute)} · ${a.label} (${formatAlarmDays(a.days)}) · Tone: ${toneName} · Snooze: ${snoozeMins}m · ${vibMode}`;
}

function formatNoteLine(n: NoteItem): string {
  const preview = n.content.replace(/\s+/g, ' ').trim();
  const clipped = preview.length > 90 ? `${preview.slice(0, 87)}...` : preview;
  const tagsSuffix = n.tags && n.tags.length > 0 ? ` [${n.tags.map((t) => `#${t}`).join(' ')}]` : '';
  return `${n.pinned ? '[Pinned] ' : ''}${n.title} (${n.category})${tagsSuffix}: ${clipped}`;
}

function tryAnswerConfiguredData(
  rawQuestion: string,
  ctx: HelpContextData
): HelpAnswer | null {
  const q = rawQuestion.toLowerCase().trim();
  const id = `ans-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const today = getTodayDateString();
  const tomorrow = getOffsetDateString(1);

  const isHowToQuestion =
    /\b(how to|how do|how does|explain|why does|why is|fix|troubleshoot|what is a|guide|process for|steps to)\b/.test(
      q
    );

  // 1. Explicit overlap / overbooking query on user's tasks
  if (
    /\b(overlap|overlapping|conflict|conflicts|overbook|overbooked|clash|double[- ]?booked)\b/.test(
      q
    ) &&
    !q.startsWith('how do') &&
    !q.startsWith('how does')
  ) {
    const conflicts = findOverlappingTasks(ctx.tasks);
    if (conflicts.length === 0) {
      return {
        id,
        question: rawQuestion,
        title: 'Task Time-Slot Overlap Check',
        category: 'Your Data',
        summary: 'No time-slot overlaps found across your pending tasks.',
        bullets: [
          `Checked ${ctx.tasks.filter((t) => !t.completed).length} pending task(s) across all dates.`,
          'All scheduled time windows are currently conflict-free.',
        ],
        inScope: true,
        followUps: ['What is on my schedule today?', 'How do Time Slots and overlap warnings work?'],
      };
    }

    return {
      id,
      question: rawQuestion,
      title: `Found ${conflicts.length} Overlapping Time Slot${conflicts.length === 1 ? '' : 's'}`,
      category: 'Your Data',
      summary: `Detected ${conflicts.length} conflict(s) where uncompleted tasks overlap on the same day.`,
      bullets: conflicts
        .slice(0, 8)
        .map(
          (c) =>
            `${c.date}: "${c.first.title}" (${formatTimeRange(c.first.dueTime, c.first.durationMinutes)}) overlaps with "${c.second.title}" (${formatTimeRange(c.second.dueTime, c.second.durationMinutes)})`
        ),
      inScope: true,
      followUps: ['What is on my schedule today?', 'Show my P1 Critical tasks and reminders'],
    };
  }

  // 2. Priority query ("P1", "Critical", "High priority", "Big 3")
  const asksP1 = /\b(p1|critical|high priority|big 3|urgent)\b/.test(q);
  const asksP2 = /\b(p2|medium priority)\b/.test(q);
  const asksP3 = /\b(p3|low priority)\b/.test(q);
  if (
    (asksP1 || asksP2 || asksP3) &&
    !isHowToQuestion &&
    /\b(my|show|list|what|which|any|have|configured|tasks?|reminders?|items?|schedule)\b/.test(
      q
    )
  ) {
    const targetPriority: PriorityLevel = asksP1 ? 'high' : asksP2 ? 'medium' : 'low';
    const meta = PRIORITY_META[targetPriority];
    const matchingTasks = ctx.tasks
      .filter((t) => t.priority === targetPriority && !t.completed)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.dueTime.localeCompare(b.dueTime));
    const matchingReminders = ctx.reminders
      .filter((r) => r.priority === targetPriority && !r.completed && r.active)
      .sort((a, b) => a.time.localeCompare(b.time));

    const bullets = [
      ...matchingTasks.map((t) => `Task · ${formatTaskLine(t)}`),
      ...matchingReminders.map((r) => `Reminder · ${formatReminderLine(r)}`),
    ];

    return {
      id,
      question: rawQuestion,
      title: `${meta.label} Pending Items`,
      category: 'Your Data',
      summary:
        bullets.length > 0
          ? `You have ${matchingTasks.length} pending task(s) and ${matchingReminders.length} active reminder(s) marked ${meta.label}.`
          : `You have no pending tasks or active reminders marked ${meta.label}.`,
      bullets:
        bullets.length > 0
          ? bullets.slice(0, 12)
          : ['Everything in this priority tier is either completed or not yet scheduled.'],
      inScope: true,
      followUps: ['What is on my schedule today?', 'Do I have any overlapping tasks?'],
    };
  }

  // 3. Today / Tomorrow / "My Schedule" / "Configured" overview
  const asksToday = /\b(today|today's|todays|right now|on my schedule|my agenda|my day)\b/.test(q);
  const asksTomorrow = /\b(tomorrow|tomorrow's|tomorrows)\b/.test(q);
  const asksOverallSummary =
    /\b(everything configured|all configured|overview|status|how many|count|summary of my|what do i have configured|all my data)\b/.test(
      q
    );

  if ((asksToday || asksTomorrow) && !isHowToQuestion) {
    const targetDate = asksTomorrow && !asksToday ? tomorrow : today;
    const label = targetDate === today ? 'Today' : 'Tomorrow';
    const dayTasks = ctx.tasks
      .filter((t) => t.dueDate === targetDate)
      .sort(
        (a, b) =>
          hhmmToMinutes(a.dueTime) - hhmmToMinutes(b.dueTime) ||
          priorityRank(a.priority) - priorityRank(b.priority)
      );
    const dayReminders = ctx.reminders
      .filter((r) => doesReminderOccurOnDate(r, targetDate))
      .sort(
        (a, b) =>
          hhmmToMinutes(a.time) - hhmmToMinutes(b.time) ||
          priorityRank(a.priority) - priorityRank(b.priority)
      );

    const bullets: string[] = [];
    dayTasks.forEach((t) => bullets.push(`Task · ${formatTaskLine(t)}`));
    dayReminders.forEach((r) => bullets.push(`Reminder · ${formatReminderLine(r)}`));

    const nextAlarm = computeNextAlarmOccurrence(ctx.alarms, new Date());
    if (label === 'Today' && nextAlarm) {
      bullets.push(
        `Next Alarm · ${format12Hour(nextAlarm.alarm.hour24, nextAlarm.alarm.minute)} (${nextAlarm.dayLabel}, in ${formatDurationDelta(nextAlarm.deltaMinutes)}) — ${nextAlarm.alarm.label}`
      );
    }

    return {
      id,
      question: rawQuestion,
      title: `${label}'s Schedule (${targetDate})`,
      category: 'Your Data',
      summary: `${dayTasks.length} task(s) (${dayTasks.filter((t) => !t.completed).length} pending) and ${dayReminders.length} reminder(s) scheduled for ${label.toLowerCase()}.`,
      bullets:
        bullets.length > 0
          ? bullets
          : [`No tasks or reminders are scheduled for ${targetDate}. Tap "+" on Dashboard to add one.`],
      inScope: true,
      followUps: ['Do I have any overlapping tasks?', 'When is my next alarm?'],
    };
  }

  if (asksOverallSummary && !isHowToQuestion) {
    const pendingTasks = ctx.tasks.filter((t) => !t.completed).length;
    const activeReminders = ctx.reminders.filter((r) => r.active && !r.completed).length;
    const enabledAlarms = ctx.alarms.filter((a) => a.enabled).length;
    const pinnedNotes = ctx.notes.filter((n) => n.pinned).length;
    const nextAlarm = computeNextAlarmOccurrence(ctx.alarms, new Date());

    return {
      id,
      question: rawQuestion,
      title: 'Your Configured Kairo Workspace',
      category: 'Your Data',
      summary: `Live snapshot of your locally configured Tasks, Reminders, Alarms, and Notes.`,
      bullets: [
        `Tasks: ${ctx.tasks.length} total (${pendingTasks} pending, ${ctx.tasks.length - pendingTasks} completed).`,
        `Reminders: ${ctx.reminders.length} total (${activeReminders} active & uncompleted).`,
        `Alarms: ${ctx.alarms.length} configured (${enabledAlarms} enabled${nextAlarm ? `; next at ${format12Hour(nextAlarm.alarm.hour24, nextAlarm.alarm.minute)} ${nextAlarm.dayLabel}` : ''}).`,
        `Notes: ${ctx.notes.length} saved (${pinnedNotes} pinned across ${ctx.settings.noteFolders?.length ?? 3} folders).`,
        `Settings: ${ctx.settings.theme === 'dark' ? 'Dark' : 'Light'} theme · ${ctx.settings.fontSizePx}px (${ctx.settings.fontFamily}) · Gradual volume ${ctx.settings.gradualAlarmVolume ? 'ON' : 'OFF'} · Auto-Carryover ${ctx.settings.autoCarryoverTasks ? 'ON' : 'OFF'} · Auto-Backup ${ctx.settings.autoBackupEnabled ? `${ctx.settings.autoBackupFrequency} (${ctx.settings.autoBackupDestination})` : 'OFF'}.`,
      ],
      inScope: true,
      followUps: ['What is on my schedule today?', 'Show my P1 Critical tasks and reminders'],
    };
  }

  // 4. Configured Alarms query ("next alarm", "my alarms", "which alarms", "ringtone")
  if (
    !isHowToQuestion &&
    /\b(alarm|alarms)\b/.test(q) &&
    /\b(my|next|when|active|enabled|disabled|list|show|what|which|configured|all|upcoming|ringtone)\b/.test(
      q
    )
  ) {
    const next = computeNextAlarmOccurrence(ctx.alarms, new Date());
    const enabledCount = ctx.alarms.filter((a) => a.enabled).length;
    const onlyActive = /\b(active|enabled|on)\b/.test(q) && !/\b(all|disabled|off)\b/.test(q);
    const list = onlyActive ? ctx.alarms.filter((a) => a.enabled) : ctx.alarms;

    return {
      id,
      question: rawQuestion,
      title: /\bnext\b/.test(q) && next ? 'Next Upcoming Alarm' : 'Your Configured Alarms',
      category: 'Your Data',
      summary: next
        ? `Next alarm: ${format12Hour(next.alarm.hour24, next.alarm.minute)} (${next.dayLabel}, in ${formatDurationDelta(next.deltaMinutes)}) — "${next.alarm.label}". (${enabledCount} of ${ctx.alarms.length} enabled)`
        : `You have ${ctx.alarms.length} alarm(s) configured, and none are currently enabled.`,
      bullets:
        list.length > 0
          ? list.map(formatAlarmLine)
          : ['No alarms match that filter right now.'],
      inScope: true,
      followUps: ['How do alarms work?', 'How do I allow Android Overlay / Lock-Screen permissions?'],
    };
  }

  // 5. Configured Reminders query
  if (
    !isHowToQuestion &&
    /\b(reminder|reminders)\b/.test(q) &&
    /\b(my|active|paused|completed|daily|weekdays|monthly|yearly|once|list|show|what|which|configured|all|upcoming)\b/.test(
      q
    )
  ) {
    let filtered = [...ctx.reminders];
    if (/\b(active|pending)\b/.test(q)) {
      filtered = filtered.filter((r) => r.active && !r.completed);
    } else if (/\bpaused\b/.test(q)) {
      filtered = filtered.filter((r) => !r.active && !r.completed);
    } else if (/\b(completed|done)\b/.test(q)) {
      filtered = filtered.filter((r) => r.completed);
    }
    if (/\bdaily\b/.test(q)) filtered = filtered.filter((r) => r.repeat === 'daily');
    if (/\bweekdays?\b/.test(q)) filtered = filtered.filter((r) => r.repeat === 'weekdays');
    if (/\bmonthly\b/.test(q)) filtered = filtered.filter((r) => r.repeat === 'monthly');
    if (/\byearly\b/.test(q)) filtered = filtered.filter((r) => r.repeat === 'yearly');
    if (/\bonce\b/.test(q)) filtered = filtered.filter((r) => r.repeat === 'once');

    filtered.sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        hhmmToMinutes(a.time) - hhmmToMinutes(b.time)
    );

    return {
      id,
      question: rawQuestion,
      title: 'Your Configured Reminders',
      category: 'Your Data',
      summary: `Found ${filtered.length} reminder(s) matching your query (out of ${ctx.reminders.length} total).`,
      bullets:
        filtered.length > 0
          ? filtered.map(formatReminderLine)
          : ['No reminders match those criteria.'],
      inScope: true,
      followUps: ['How do reminders work?', 'What is on my schedule today?'],
    };
  }

  // 6. Configured Tasks query (category, status, time window, or general list)
  const mentionedCategory = TASK_CATEGORIES.find((c) => q.includes(c.toLowerCase()));
  const mentionedWindow = (['morning', 'afternoon', 'evening'] as const).find((w) =>
    q.includes(w)
  );
  if (
    !isHowToQuestion &&
    (/\b(task|tasks)\b/.test(q) || mentionedCategory) &&
    /\b(my|list|show|what|which|pending|completed|done|configured|all|work|personal|family|routine|morning|afternoon|evening)\b/.test(
      q
    )
  ) {
    let filtered = [...ctx.tasks];
    if (mentionedCategory) {
      filtered = filtered.filter(
        (t) => normalizeTaskCategory(t.category) === (mentionedCategory as TaskCategory)
      );
    }
    if (mentionedWindow) {
      filtered = filtered.filter(
        (t) => getTimeWindowFromHHMM(t.dueTime) === mentionedWindow
      );
    }
    if (/\b(pending|incomplete|open|remaining|todo)\b/.test(q)) {
      filtered = filtered.filter((t) => !t.completed);
    } else if (/\b(completed|done|finished)\b/.test(q)) {
      filtered = filtered.filter((t) => t.completed);
    }

    filtered.sort(
      (a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        hhmmToMinutes(a.dueTime) - hhmmToMinutes(b.dueTime)
    );

    const totalMins = filtered.reduce((acc, t) => acc + t.durationMinutes, 0);
    return {
      id,
      question: rawQuestion,
      title: `Your Configured Tasks${mentionedCategory ? ` (${mentionedCategory})` : ''}`,
      category: 'Your Data',
      summary: `Found ${filtered.length} task(s) totaling ${formatDurationDelta(totalMins)} of scheduled focus time.`,
      bullets:
        filtered.length > 0
          ? filtered.slice(0, 12).map(formatTaskLine)
          : ['No tasks match those filters right now.'],
      inScope: true,
      followUps: ['Do I have any overlapping tasks?', 'How do Time Slots and overlap warnings work?'],
    };
  }

  // 7. Configured Notes query / search
  if (
    !isHowToQuestion &&
    /\b(note|notes)\b/.test(q) &&
    /\b(my|pinned|saved|list|show|what|which|configured|all|find|search|about|for|ideas|work|general|how many)\b/.test(
      q
    )
  ) {
    let filtered = [...ctx.notes];
    if (/\bpinned\b/.test(q)) {
      filtered = filtered.filter((n) => n.pinned);
    }
    const searchMatch = q.match(/(?:for|about|containing|with)\s+["']?([a-z0-9 _-]{2,})["']?$/i);
    const searchTerm = searchMatch?.[1]?.trim();
    if (searchTerm && !['notes', 'note', 'saved', 'pinned'].includes(searchTerm)) {
      filtered = filtered.filter(
        (n) =>
          n.title.toLowerCase().includes(searchTerm) ||
          n.content.toLowerCase().includes(searchTerm) ||
          n.category.toLowerCase().includes(searchTerm) ||
          (n.tags ?? []).some((tag) => tag.toLowerCase().includes(searchTerm.replace(/^#/, '')))
      );
    }

    return {
      id,
      question: rawQuestion,
      title: 'Your Saved Notes',
      category: 'Your Data',
      summary: `Found ${filtered.length} note(s)${searchTerm ? ` matching "${searchTerm}"` : ''} (${ctx.notes.filter((n) => n.pinned).length} pinned overall).`,
      bullets:
        filtered.length > 0
          ? filtered.slice(0, 10).map(formatNoteLine)
          : ['No saved notes match that query.'],
      inScope: true,
      followUps: ['How do Note Folders, Tags, Checklists, and Voice-to-Text work?'],
    };
  }

  return null;
}

function matchTopicGuide(rawQuestion: string): HelpTopicGuide | null {
  const q = rawQuestion.toLowerCase().trim();
  const tokens = q.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);

  let bestGuide: HelpTopicGuide | null = null;
  let bestScore = 0;

  for (const guide of HELP_TOPIC_GUIDES) {
    let score = 0;
    for (const phrase of guide.phrases) {
      if (q.includes(phrase)) score += 6;
    }
    for (const kw of guide.keywords) {
      if (tokens.includes(kw)) {
        score += 3;
      } else if (kw.length >= 4 && q.includes(kw)) {
        score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestGuide = guide;
    }
  }

  return bestScore >= 2 ? bestGuide : null;
}

export function answerKairoHelpQuestion(
  rawQuestion: string,
  ctx: HelpContextData
): HelpAnswer {
  const trimmed = rawQuestion.trim();
  const id = `ans-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (!trimmed) {
    return {
      id,
      question: rawQuestion,
      title: 'Ask Kairo Help',
      category: 'Out of Scope',
      summary: 'Type a question about Kairo’s features, setup processes, or your configured tasks, alarms, reminders, and notes.',
      bullets: [
        'Try asking: "What is on my schedule today?"',
        'Try asking: "How do I allow Android Overlay / Lock-Screen permissions?"',
      ],
      inScope: false,
      followUps: HELP_QUICK_PROMPTS.slice(0, 4).map((p) => p.question),
    };
  }

  // First check live configured data questions
  const dataAnswer = tryAnswerConfiguredData(trimmed, ctx);
  if (dataAnswer) return dataAnswer;

  // Next check functionality & process guides
  const guide = matchTopicGuide(trimmed);
  if (guide) {
    return {
      id,
      question: trimmed,
      title: guide.title,
      category: guide.category,
      summary: guide.summary,
      bullets: guide.bullets,
      inScope: true,
      followUps: guide.followUps,
    };
  }

  // Fallback for general "help" / "what can you do" questions
  if (/\b(help|capabilities|features|what can|menu|how to use kairo|guide)\b/i.test(trimmed)) {
    return {
      id,
      question: trimmed,
      title: 'What Kairo Help Can Answer',
      category: 'Functionality',
      summary:
        'You can ask about any Kairo feature, workflow process, or query your live configured items offline.',
      bullets: [
        'Configured Data: Today/tomorrow schedule, P1–P3 priorities, overlapping tasks, next alarm & snooze/vibration settings, active reminders, and pinned/tagged notes.',
        'Workflows & Processes: Time Slots, Auto-Carryover, Focus Timer & DND, recurrence rules, Temporal Wheel alarms, Note Folders/Tags & checklist conversion, and Voice-to-Text.',
        'Device & Backup: Android Lock-Screen permissions & Quick-Add Widget, Backup Export & Import, Scheduled Auto-Backup, Google Drive sync, and Font Size & App Font settings.',
      ],
      inScope: true,
      followUps: [
        'What is on my schedule today?',
        'How do Time Slots, overlap warnings, and Auto-Carryover work?',
        'How do Scheduled Auto-Backup and Backup Export & Import work?',
      ],
    };
  }

  // Strict scope boundary for unrelated questions
  return {
    id,
    question: trimmed,
    title: 'Outside Kairo Help Scope',
    category: 'Out of Scope',
    summary:
      'Kairo Help only answers questions within the scope of Kairo’s functionality, workflows, and your configured Tasks, Alarms, Reminders, and Notes.',
    bullets: [
      'Live Data Queries: "What is on my schedule today?", "When is my next alarm?", "Do I have any overlapping tasks?", "What notes are pinned?"',
      'Feature & Process Guides: "How do Time Slots work?", "How do I fix Android Overlay denied?", "How do I format notes and use Voice-to-Text?", "How do backups work?"',
    ],
    inScope: false,
    followUps: [
      'What is on my schedule today?',
      'When is my next alarm?',
      'How do I allow Android Overlay / Lock-Screen permissions?',
    ],
  };
}
