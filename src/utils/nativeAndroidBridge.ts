import {
  doesReminderOccurOnDate,
  formatDateToYMD,
  parseYMDToLocalDate,
  type AlarmVibrationMode,
  type ChronoAlarm,
  type ReminderItem,
  type TaskItem,
} from '../types/chrono';
import type { ActiveAlert } from './notificationEngine';

export interface NativeScheduledAlert {
  id: string;
  slotKey: string;
  type: 'alarm' | 'reminder' | 'task' | 'snooze';
  name: string;
  triggerAtMs: number;
  timeLabel: string;
  snoozeMinutes?: number;
  vibrationMode?: AlarmVibrationMode;
}

export interface NativeHandledAlert {
  slotKey: string;
  id: string;
  type: 'alarm' | 'reminder' | 'task' | 'snooze';
  name: string;
  timeLabel: string;
  action: 'fired' | 'stopped' | 'snoozed';
  snoozeUntilMs: number;
  updatedAtMs: number;
}

export interface AndroidAlertPermissionsStatus {
  isNativeAndroid: boolean;
  postNotifications: boolean;
  exactAlarms: boolean;
  fullScreenIntent: boolean;
  overlayPermission: boolean;
  batteryOptimizationIgnored: boolean;
  dndAccess: boolean;
}

interface KairoAlarmNativePlugin {
  syncAlerts: (opts: {
    alertsJson: string;
    gradualVolume?: boolean;
  }) => Promise<{ scheduled: number }>;
  getPermissionStatus: () => Promise<Omit<AndroidAlertPermissionsStatus, 'isNativeAndroid'>>;
  requestNotificationPermission: () => Promise<{ granted: boolean }>;
  openNotificationSettings?: () => Promise<void>;
  openExactAlarmSettings: () => Promise<void>;
  openFullScreenIntentSettings: () => Promise<void>;
  openOverlaySettings: () => Promise<void>;
  openBatterySettings: () => Promise<void>;
  openAppInfoSettings: () => Promise<void>;
  openDndSettings?: () => Promise<void>;
  testLockScreenAlert?: (opts?: {
    delaySeconds?: number;
  }) => Promise<{ scheduled: boolean; triggerAtMs: number }>;
  setFocusDndState?: (opts: {
    enabled: boolean;
    enableDnd?: boolean;
    allowAlarms?: boolean;
    endsAtMs?: number;
    focusLabel?: string;
    timeLabel?: string;
  }) => Promise<{ dndGranted: boolean; dndApplied: boolean }>;
  stopActiveAlert: (opts: { action: 'stop' | 'snooze' }) => Promise<void>;
  consumeHandledAlerts: () => Promise<{
    handledJson: string;
    isAlertActive?: boolean;
    activeSlotKey?: string;
    stoppedFocusEndMs?: number;
  }>;
  markAlertHandled: (opts: { slotKey: string }) => Promise<void>;
  startVoiceDictation?: (opts?: { prompt?: string }) => Promise<{ text: string }>;
  exportBackupFile?: (opts: {
    fileName: string;
    content: string;
  }) => Promise<{ saved: boolean; location: string; fileName: string }>;
  updateWidgetSummary?: (opts: {
    tasksLeft: number;
    remindersLeft: number;
    nextAlarm: string;
    nextTaskTitle: string;
    next3HoursJson?: string;
    itemsInNext3HoursCount?: number;
  }) => Promise<{ updated: boolean }>;
  consumePendingQuickAdd?: () => Promise<{ target: string }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    KairoAlarm?: KairoAlarmNativePlugin;
  };
}

function getCapacitor(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativeAndroidPlatform(): boolean {
  const cap = getCapacitor();
  return Boolean(cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'android');
}

function getKairoAlarmPlugin(): KairoAlarmNativePlugin | null {
  if (!isNativeAndroidPlatform()) return null;
  return getCapacitor()?.Plugins?.KairoAlarm ?? null;
}

function format12Hour(hour24: number, minute: number): string {
  const h12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}

export function computeUpcomingNativeAlerts(
  alarms: ChronoAlarm[],
  reminders: ReminderItem[],
  tasks: TaskItem[],
  snoozedAlerts: { alert: ActiveAlert; triggerAtMs: number }[]
): NativeScheduledAlert[] {
  const now = new Date();
  const nowMs = now.getTime();
  const list: NativeScheduledAlert[] = [];

  // 1. Next upcoming occurrence (within 7 days) for each enabled Alarm
  for (const alarm of alarms) {
    if (!alarm.enabled) continue;
    for (let offset = 0; offset <= 7; offset++) {
      const candidate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + offset,
        alarm.hour24,
        alarm.minute,
        0,
        0
      );
      if (candidate.getTime() <= nowMs + 1000) continue;
      if (alarm.days.length > 0 && !alarm.days.includes(candidate.getDay())) {
        continue;
      }
      const dateStr = formatDateToYMD(candidate);
      list.push({
        id: alarm.id,
        slotKey: `alarm:${alarm.id}:${dateStr}:${alarm.hour24}:${alarm.minute}`,
        type: 'alarm',
        name: alarm.label || 'Kairo Alarm',
        triggerAtMs: candidate.getTime(),
        timeLabel: format12Hour(alarm.hour24, alarm.minute),
        snoozeMinutes: alarm.snoozeMinutes ?? 5,
        vibrationMode: alarm.vibrationMode ?? 'sound_and_vibrate',
      });
      break;
    }
  }

  // 2. Next upcoming occurrence (within 31 / 366 days) for each active Reminder
  for (const rem of reminders) {
    if (!rem.active || rem.completed) continue;
    const [hh, mm] = rem.time.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;

    const maxDays = rem.repeat === 'yearly' ? 366 : 31;
    for (let offset = 0; offset <= maxDays; offset++) {
      const candidate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + offset,
        hh,
        mm,
        0,
        0
      );
      if (candidate.getTime() <= nowMs + 1000) continue;
      const dateStr = formatDateToYMD(candidate);
      if (doesReminderOccurOnDate(rem, dateStr)) {
        list.push({
          id: rem.id,
          slotKey: `reminder:${rem.id}:${dateStr}:${rem.time}`,
          type: 'reminder',
          name: rem.title,
          triggerAtMs: candidate.getTime(),
          timeLabel: format12Hour(hh, mm),
        });
        break;
      }
    }
  }

  // 3. Upcoming uncompleted Tasks
  for (const task of tasks) {
    if (task.completed) continue;
    const [hh, mm] = task.dueTime.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
    const d = parseYMDToLocalDate(task.dueDate);
    d.setHours(hh, mm, 0, 0);
    if (d.getTime() <= nowMs + 1000) continue;
    list.push({
      id: task.id,
      slotKey: `task:${task.id}:${task.dueDate}:${task.dueTime}`,
      type: 'task',
      name: task.title,
      triggerAtMs: d.getTime(),
      timeLabel: format12Hour(hh, mm),
    });
  }

  // 4. Active Snoozes
  for (const s of snoozedAlerts) {
    if (s.triggerAtMs <= nowMs + 1000) continue;
    const d = new Date(s.triggerAtMs);
    list.push({
      id: s.alert.sourceId,
      slotKey: `${s.alert.sourceId}-snooze-${s.triggerAtMs}`,
      type: s.alert.type,
      name: s.alert.name,
      triggerAtMs: s.triggerAtMs,
      timeLabel: format12Hour(d.getHours(), d.getMinutes()),
      snoozeMinutes: s.alert.snoozeMinutes ?? 5,
      vibrationMode: s.alert.vibrationMode ?? 'sound_and_vibrate',
    });
  }

  return list.sort((a, b) => a.triggerAtMs - b.triggerAtMs).slice(0, 48);
}

export async function syncNativeAndroidAlerts(
  alerts: NativeScheduledAlert[],
  gradualVolume = true
): Promise<void> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin) return;
  try {
    await plugin.syncAlerts({
      alertsJson: JSON.stringify(alerts),
      gradualVolume,
    });
  } catch {
    // Ignore when native plugin not installed yet
  }
}

export async function fetchNativeHandledAlerts(): Promise<{
  handled: NativeHandledAlert[];
  isAlertActive: boolean;
  activeSlotKey: string;
  stoppedFocusEndMs: number;
}> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin || !plugin.consumeHandledAlerts) {
    return {
      handled: [],
      isAlertActive: false,
      activeSlotKey: '',
      stoppedFocusEndMs: 0,
    };
  }
  try {
    const res = await plugin.consumeHandledAlerts();
    const parsed = JSON.parse(res.handledJson || '[]') as NativeHandledAlert[];
    return {
      handled: Array.isArray(parsed) ? parsed : [],
      isAlertActive: Boolean(res.isAlertActive),
      activeSlotKey: res.activeSlotKey ?? '',
      stoppedFocusEndMs: Number(res.stoppedFocusEndMs ?? 0) || 0,
    };
  } catch {
    return {
      handled: [],
      isAlertActive: false,
      activeSlotKey: '',
      stoppedFocusEndMs: 0,
    };
  }
}

export async function markNativeSlotHandled(slotKey: string): Promise<void> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin || !plugin.markAlertHandled || !slotKey) return;
  try {
    await plugin.markAlertHandled({ slotKey });
  } catch {
    // Ignore
  }
}

export async function getAndroidAlertPermissions(): Promise<AndroidAlertPermissionsStatus> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin) {
    return {
      isNativeAndroid: false,
      postNotifications: false,
      exactAlarms: false,
      fullScreenIntent: false,
      overlayPermission: false,
      batteryOptimizationIgnored: false,
      dndAccess: false,
    };
  }
  try {
    const status = await plugin.getPermissionStatus();
    return {
      isNativeAndroid: true,
      ...status,
      dndAccess: Boolean(status.dndAccess),
    };
  } catch {
    return {
      isNativeAndroid: true,
      postNotifications: false,
      exactAlarms: false,
      fullScreenIntent: false,
      overlayPermission: false,
      batteryOptimizationIgnored: false,
      dndAccess: false,
    };
  }
}

export type AndroidPermissionAction =
  | 'notifications'
  | 'notificationSettings'
  | 'exactAlarm'
  | 'fullScreen'
  | 'overlay'
  | 'battery'
  | 'dnd'
  | 'appInfo';

export async function triggerAndroidPermissionSetting(
  kind: AndroidPermissionAction
): Promise<void> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin) return;
  try {
    if (kind === 'notifications') {
      await plugin.requestNotificationPermission();
    } else if (kind === 'notificationSettings') {
      await plugin.openNotificationSettings?.();
    } else if (kind === 'exactAlarm') {
      await plugin.openExactAlarmSettings();
    } else if (kind === 'fullScreen') {
      await plugin.openFullScreenIntentSettings();
    } else if (kind === 'overlay') {
      await plugin.openOverlaySettings();
    } else if (kind === 'battery') {
      await plugin.openBatterySettings();
    } else if (kind === 'dnd') {
      await plugin.openDndSettings?.();
    } else if (kind === 'appInfo') {
      await plugin.openAppInfoSettings?.();
    }
  } catch {
    // Ignore
  }
}

export async function scheduleNativeLockScreenTest(
  delaySeconds = 5
): Promise<boolean> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin || !plugin.testLockScreenAlert) return false;
  try {
    const res = await plugin.testLockScreenAlert({ delaySeconds });
    return Boolean(res?.scheduled);
  } catch {
    return false;
  }
}

export async function notifyNativeServiceAction(
  action: 'stop' | 'snooze'
): Promise<void> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin) return;
  try {
    await plugin.stopActiveAlert({ action });
  } catch {
    // Ignore
  }
}

export async function startNativeVoiceDictation(
  prompt = 'Speak your note...'
): Promise<{ supported: boolean; text: string | null; error?: string }> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin || !plugin.startVoiceDictation) {
    return { supported: false, text: null };
  }
  try {
    const res = await plugin.startVoiceDictation({ prompt });
    return { supported: true, text: res?.text ?? '' };
  } catch (err) {
    return {
      supported: true,
      text: null,
      error: err instanceof Error ? err.message : 'Voice dictation canceled or unavailable.',
    };
  }
}

export async function setNativeFocusDndState(opts: {
  enabled: boolean;
  enableDnd?: boolean;
  allowAlarms?: boolean;
  endsAtMs?: number;
  focusLabel?: string;
  timeLabel?: string;
}): Promise<{ dndGranted: boolean; dndApplied: boolean }> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin || !plugin.setFocusDndState) {
    return { dndGranted: false, dndApplied: false };
  }
  try {
    return await plugin.setFocusDndState(opts);
  } catch {
    return { dndGranted: false, dndApplied: false };
  }
}

export async function saveNativeAndroidBackup(
  fileName: string,
  content: string
): Promise<{
  supported: boolean;
  saved: boolean;
  location: string;
  error?: string;
}> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin || !plugin.exportBackupFile) {
    return { supported: false, saved: false, location: '' };
  }
  try {
    const res = await plugin.exportBackupFile({ fileName, content });
    return {
      supported: true,
      saved: Boolean(res?.saved),
      location: res?.location ?? '',
    };
  } catch (err) {
    return {
      supported: true,
      saved: false,
      location: '',
      error: err instanceof Error ? err.message : 'Unable to save backup file.',
    };
  }
}

export type NativeQuickAddTarget =
  | 'dashboard'
  | 'tasks'
  | 'reminders'
  | 'alarms'
  | 'notes';

export async function syncNativeWidgetSummary(summary: {
  tasksLeft: number;
  remindersLeft: number;
  nextAlarm: string;
  nextTaskTitle: string;
  next3HoursJson?: string;
  itemsInNext3HoursCount?: number;
}): Promise<boolean> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin || !plugin.updateWidgetSummary) return false;
  try {
    const res = await plugin.updateWidgetSummary(summary);
    return Boolean(res?.updated);
  } catch {
    return false;
  }
}

export async function consumeNativeQuickAddTarget(): Promise<NativeQuickAddTarget | null> {
  const plugin = getKairoAlarmPlugin();
  if (!plugin || !plugin.consumePendingQuickAdd) return null;
  try {
    const res = await plugin.consumePendingQuickAdd();
    const t = res?.target;
    if (
      t === 'dashboard' ||
      t === 'tasks' ||
      t === 'reminders' ||
      t === 'alarms' ||
      t === 'notes'
    ) {
      return t;
    }
    return null;
  } catch {
    return null;
  }
}
