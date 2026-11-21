import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlarmClock,
  Bell,
  CheckSquare,
  FileText,
  LayoutDashboard,
  Settings,
  X,
} from 'lucide-react';
import { AppLogo } from './components/AppLogo';
import {
  DEFAULT_NOTE_FOLDERS,
  DEFAULT_SETTINGS,
  doesReminderOccurOnDate,
  formatDateToYMD,
  getInitialNotes,
  getInitialReminders,
  getInitialTasks,
  getTodayDateString,
  INITIAL_ALARMS,
  normalizeTaskCategory,
  type AppFontFamily,
  type AppSettings,
  type ChronoAlarm,
  type FocusTimerState,
  type NavTab,
  type NoteItem,
  type PriorityLevel,
  type ReminderItem,
  type TaskItem,
} from './types/chrono';
import { DashboardSection, type QuickAddTarget } from './components/DashboardSection';
import { TasksSection } from './components/TasksSection';
import { RemindersSection } from './components/RemindersSection';
import { AlarmsSection } from './components/AlarmsSection';
import {
  NotesSection,
  toggleChecklistLineInContent,
} from './components/NotesSection';
import { SettingsSection } from './components/SettingsSection';
import { WEB_AUTO_BACKUP_STORAGE_KEY } from './components/BackupSection';
import { AlarmRingOverlay } from './components/AlarmRingOverlay';
import { soundEngine } from './utils/soundEngine';
import {
  closeSystemAlertNotification,
  getNotificationPermissionState,
  registerNotificationServiceWorker,
  requestOSNotificationPermission,
  showSystemAlertNotification,
  startAlertVibration,
  stopAlertVibration,
  type ActiveAlert,
  type NotificationPermissionState,
} from './utils/notificationEngine';
import {
  clearAllNativeAlerts,
  computeUpcomingNativeAlerts,
  consumeNativeQuickAddTarget,
  fetchNativeHandledAlerts,
  getAndroidAlertPermissions,
  isNativeAndroidPlatform,
  markNativeSlotHandled,
  notifyNativeServiceAction,
  saveNativeAndroidBackup,
  scheduleNativeLockScreenTest,
  setNativeFocusDndState,
  syncNativeAndroidAlerts,
  syncNativeWidgetSummary,
  triggerAndroidPermissionSetting,
  type AndroidAlertPermissionsStatus,
  type AndroidPermissionAction,
} from './utils/nativeAndroidBridge';
import { getAccessToken, initAuth } from './utils/googleAuth';
import {
  buildBackupPayload,
  createDriveBackup,
  listDriveBackups,
  updateDriveBackup,
  type ChronoBackupPayload,
} from './utils/googleDriveBackup';

const STORAGE_KEYS = {
  tasks: 'chrono_tempo_tasks_v2',
  reminders: 'chrono_tempo_reminders_v2',
  alarms: 'chrono_tempo_alarms_v2',
  notes: 'chrono_tempo_notes_v2',
  settings: 'chrono_tempo_settings_v1',
  snoozed: 'kairo_snoozed_alerts_v1',
  firedKeys: 'kairo_fired_keys_v1',
  focusState: 'kairo_focus_state_v1',
};

function loadRecentFiredKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.firedKeys);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as Record<string, number>;
    const cutoff = Date.now() - 36 * 60 * 60 * 1000;
    const set = new Set<string>();
    Object.entries(parsed).forEach(([k, ts]) => {
      if (typeof ts === 'number' && ts >= cutoff) {
        set.add(k);
      }
    });
    return set;
  } catch {
    return new Set();
  }
}

function persistFiredKeys(keys: Set<string>): void {
  try {
    const now = Date.now();
    const existingRaw = localStorage.getItem(STORAGE_KEYS.firedKeys);
    const existing = existingRaw ? (JSON.parse(existingRaw) as Record<string, number>) : {};
    const cutoff = now - 36 * 60 * 60 * 1000;
    const cleaned: Record<string, number> = {};
    Object.entries(existing).forEach(([k, ts]) => {
      if (typeof ts === 'number' && ts >= cutoff) cleaned[k] = ts;
    });
    keys.forEach((k) => {
      if (!cleaned[k]) cleaned[k] = now;
    });
    localStorage.setItem(STORAGE_KEYS.firedKeys, JSON.stringify(cleaned));
  } catch {
    // Ignore storage errors
  }
}

interface SnoozedAlertEntry {
  alert: ActiveAlert;
  triggerAtMs: number;
}

function format12HourTime(hour24: number, minute: number): string {
  const h12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  return `${String(h12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${period}`;
}

function parseHHMM(hhmm: string): { hour24: number; minute: number } | null {
  const parts = hhmm.split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) {
    return null;
  }
  return { hour24: parts[0], minute: parts[1] };
}

const FONT_STACKS: Record<AppFontFamily, { display: string; sans: string }> = {
  jakarta: {
    display: '"Plus Jakarta Sans", system-ui, sans-serif',
    sans: '"DM Sans", system-ui, sans-serif',
  },
  manrope: {
    display: '"Manrope", system-ui, sans-serif',
    sans: '"Manrope", system-ui, sans-serif',
  },
  outfit: {
    display: '"Outfit", system-ui, sans-serif',
    sans: '"Outfit", system-ui, sans-serif',
  },
  lora: {
    display: '"Lora", Georgia, serif',
    sans: '"Lora", Georgia, serif',
  },
  mono: {
    display: '"JetBrains Mono", ui-monospace, monospace',
    sans: '"JetBrains Mono", ui-monospace, monospace',
  },
};

function loadStored<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback();
    return JSON.parse(raw) as T;
  } catch {
    return fallback();
  }
}

function normalizePriority(p?: string): PriorityLevel {
  if (p === 'high' || p === 'medium' || p === 'low') return p;
  return 'medium';
}

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [now, setNow] = useState<Date>(() => new Date());

  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = loadStored(STORAGE_KEYS.settings, () => DEFAULT_SETTINGS);
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      noteFolders:
        Array.isArray(stored.noteFolders) && stored.noteFolders.length > 0
          ? stored.noteFolders
          : [...DEFAULT_NOTE_FOLDERS],
    };
  });

  const [tasks, setTasks] = useState<TaskItem[]>(() =>
    loadStored(STORAGE_KEYS.tasks, getInitialTasks).map((t) => ({
      ...t,
      priority: normalizePriority(t.priority),
      category: normalizeTaskCategory(t.category),
    }))
  );
  const [reminders, setReminders] = useState<ReminderItem[]>(() =>
    loadStored(STORAGE_KEYS.reminders, getInitialReminders).map((r) => ({
      ...r,
      priority: normalizePriority(r.priority),
    }))
  );
  const [alarms, setAlarms] = useState<ChronoAlarm[]>(() =>
    loadStored(STORAGE_KEYS.alarms, () => INITIAL_ALARMS)
  );
  const [notes, setNotes] = useState<NoteItem[]>(() =>
    loadStored(STORAGE_KEYS.notes, getInitialNotes)
  );

  // Trigger counters for Dashboard '+' Quick Add actions
  const [quickAddDate, setQuickAddDate] = useState<string | undefined>(undefined);
  const [createTriggers, setCreateTriggers] = useState<Record<QuickAddTarget, number>>({
    tasks: 0,
    reminders: 0,
    alarms: 0,
    notes: 0,
  });

  const [alertQueue, setAlertQueue] = useState<ActiveAlert[]>([]);
  const [snoozedAlerts, setSnoozedAlerts] = useState<SnoozedAlertEntry[]>(() =>
    loadStored<SnoozedAlertEntry[]>(STORAGE_KEYS.snoozed, () => [])
  );
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>(() => getNotificationPermissionState());
  const [notifBannerDismissed, setNotifBannerDismissed] = useState<boolean>(false);
  const [androidPermissions, setAndroidPermissions] =
    useState<AndroidAlertPermissionsStatus>({
      isNativeAndroid: false,
      postNotifications: false,
      exactAlarms: false,
      fullScreenIntent: false,
      overlayPermission: false,
      batteryOptimizationIgnored: false,
      dndAccess: false,
    });

  const [focusState, setFocusState] = useState<FocusTimerState>(() => {
    const fallback: FocusTimerState = {
      presetMinutes: 25,
      secondsLeft: 25 * 60,
      running: false,
      endAtMs: null,
      linkedTaskId: null,
      dndActive: false,
    };
    const stored = loadStored<FocusTimerState>(STORAGE_KEYS.focusState, () => fallback);
    if (stored.running && stored.endAtMs) {
      const rem = Math.max(0, Math.ceil((stored.endAtMs - Date.now()) / 1000));
      if (rem > 0) {
        return { ...stored, secondsLeft: rem };
      }
      return { ...stored, running: false, endAtMs: null, secondsLeft: 0, dndActive: false };
    }
    return { ...fallback, ...stored, running: false, endAtMs: null, dndActive: false };
  });

  const sessionStartMsRef = useRef<number>(Date.now());
  const firedKeysRef = useRef<Set<string>>(loadRecentFiredKeys());
  const nativeSyncedOnceRef = useRef<boolean>(!isNativeAndroidPlatform());
  const alarmsRef = useRef<ChronoAlarm[]>(alarms);
  alarmsRef.current = alarms;
  const autoBackupInFlightRef = useRef<boolean>(false);

  // Google Account auth state (token cached strictly in memory)
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState<boolean>(true);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
        setNeedsGoogleAuth(false);
      },
      (user) => {
        setGoogleUser(user);
        setNeedsGoogleAuth(true);
      }
    );
    return unsubscribe;
  }, []);

  // Apply theme, font size, and font family to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    root.style.fontSize = `${settings.fontSizePx}px`;
    const stack = FONT_STACKS[settings.fontFamily] ?? FONT_STACKS.jakarta;
    root.style.setProperty('--ct-font-display', stack.display);
    root.style.setProperty('--ct-font-sans', stack.sans);

    try {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch {
      // Ignore storage errors
    }
  }, [settings]);

  // Persist all 4 data modules to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
    } catch {
      // Ignore
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.reminders, JSON.stringify(reminders));
    } catch {
      // Ignore
    }
  }, [reminders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.alarms, JSON.stringify(alarms));
    } catch {
      // Ignore
    }
  }, [alarms]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
    } catch {
      // Ignore
    }
  }, [notes]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.snoozed, JSON.stringify(snoozedAlerts));
    } catch {
      // Ignore
    }
  }, [snoozedAlerts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.focusState, JSON.stringify(focusState));
    } catch {
      // Ignore
    }
  }, [focusState]);

  // Register Service Worker for interactive OS notifications
  useEffect(() => {
    if (notificationPermission === 'granted') {
      void registerNotificationServiceWorker();
    }
  }, [notificationPermission]);

  const activeAlert = alertQueue[0] ?? null;

  // Keep sound loop + vibration synced with the frontmost active alert & its vibrationMode
  useEffect(() => {
    if (!activeAlert) {
      soundEngine.stopAlarmLoop();
      stopAlertVibration();
      return;
    }

    // On Native Android, native AlarmService owns ringtone and vibration.
    // Mute Web Audio loop to prevent double ringing!
    if (isNativeAndroidPlatform()) {
      soundEngine.stopAlarmLoop();
      stopAlertVibration();
      return;
    }

    const mode = activeAlert.vibrationMode ?? 'sound_and_vibrate';
    if (mode !== 'vibrate_only') {
      soundEngine.startAlarmLoop(
        activeAlert.tone,
        activeAlert.customRingtoneId,
        settings.gradualAlarmVolume
      );
    } else {
      soundEngine.stopAlarmLoop();
    }
    if (mode !== 'sound_only') {
      startAlertVibration();
    } else {
      stopAlertVibration();
    }
  }, [activeAlert?.uid, activeAlert?.vibrationMode, settings.gradualAlarmVolume]);

  const enqueueAlerts = useCallback((incoming: ActiveAlert[]) => {
    if (incoming.length === 0) return;
    incoming.forEach((a) => {
      firedKeysRef.current.add(a.uid);
      void markNativeSlotHandled(a.uid);
    });
    persistFiredKeys(firedKeysRef.current);

    setAlertQueue((prev) => {
      const existingUids = new Set(prev.map((a) => a.uid));
      const fresh = incoming.filter((a) => !existingUids.has(a.uid));
      if (fresh.length === 0) return prev;
      fresh.forEach((a) => {
        if (!isNativeAndroidPlatform()) {
          void showSystemAlertNotification(a);
        }
      });
      return [...prev, ...fresh];
    });
  }, []);

  // Sync handled alerts from Native Android so alerts stopped/snoozed on lock screen never ring again in WebView
  const syncHandledFromNative = useCallback(async () => {
    if (!isNativeAndroidPlatform()) {
      nativeSyncedOnceRef.current = true;
      return {
        isAlertActive: false,
        activeSlotKey: '',
        handledSlotKeys: new Set<string>(),
      };
    }
    const { handled, isAlertActive, activeSlotKey, stoppedFocusEndMs } =
      await fetchNativeHandledAlerts();
    if (stoppedFocusEndMs > 0) {
      setFocusState((prev) => {
        if (!prev.running) return prev;
        if (
          prev.endAtMs &&
          Math.abs(prev.endAtMs - stoppedFocusEndMs) > 5000
        ) {
          return prev;
        }
        return {
          ...prev,
          running: false,
          endAtMs: null,
          secondsLeft: prev.presetMinutes * 60,
          dndActive: false,
        };
      });
    }
    let changed = false;
    const nowMs = Date.now();
    const nativeSnoozes: SnoozedAlertEntry[] = [];

    for (const item of handled) {
      if (item.slotKey && !firedKeysRef.current.has(item.slotKey)) {
        firedKeysRef.current.add(item.slotKey);
        changed = true;
      }
      if (item.action === 'snoozed' && item.snoozeUntilMs > nowMs + 1000) {
        const snoozeDate = new Date(item.snoozeUntilMs);
        const typeSafe =
          item.type === 'reminder' || item.type === 'task' ? item.type : 'alarm';
        const matchedAlarm =
          typeSafe === 'alarm'
            ? alarmsRef.current.find((a) => a.id === item.id)
            : undefined;
        nativeSnoozes.push({
          alert: {
            uid: `${item.id}-snooze-${item.snoozeUntilMs}`,
            sourceId: item.id,
            type: typeSafe,
            name: item.name,
            timeLabel: format12HourTime(
              snoozeDate.getHours(),
              snoozeDate.getMinutes()
            ),
            tone: matchedAlarm?.tone ?? 'dawn',
            customRingtoneId: matchedAlarm?.customRingtoneId,
            snoozeMinutes: matchedAlarm?.snoozeMinutes ?? 5,
            vibrationMode: matchedAlarm?.vibrationMode ?? 'sound_and_vibrate',
          },
          triggerAtMs: item.snoozeUntilMs,
        });
      }
    }

    if (changed) {
      persistFiredKeys(firedKeysRef.current);
      const handledSlots = new Set(handled.map((h) => h.slotKey));
      setAlertQueue((prev) => prev.filter((a) => !handledSlots.has(a.uid)));
    }

    if (nativeSnoozes.length > 0) {
      setSnoozedAlerts((prev) => {
        const existingKeys = new Set(
          prev.map((s) => `${s.alert.sourceId}-${s.triggerAtMs}`)
        );
        const toAdd = nativeSnoozes.filter(
          (ns) => !existingKeys.has(`${ns.alert.sourceId}-${ns.triggerAtMs}`)
        );
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });
    }

    nativeSyncedOnceRef.current = true;
    const handledSlotKeys = new Set(handled.map((h) => h.slotKey).filter(Boolean));
    return { isAlertActive, activeSlotKey, handledSlotKeys };
  }, []);

  // Sync upcoming Alarms, Reminders, Tasks, and Snoozes to Native Android AlarmManager
  useEffect(() => {
    const upcoming = computeUpcomingNativeAlerts(
      alarms,
      reminders,
      tasks,
      snoozedAlerts
    );
    void syncNativeAndroidAlerts(upcoming, settings.gradualAlarmVolume);
  }, [alarms, reminders, tasks, snoozedAlerts, settings.gradualAlarmVolume]);

  // Unlock Web Audio on first user interaction & refresh native Android permission status on resume
  useEffect(() => {
    const unlock = () => soundEngine.unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    const refreshNativePerms = () => {
      void getAndroidAlertPermissions().then(setAndroidPermissions);
      void syncHandledFromNative();
    };
    refreshNativePerms();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshNativePerms();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', refreshNativePerms);

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', refreshNativePerms);
    };
  }, [syncHandledFromNative]);

  // Real-time 1s clock + Task, Reminder, Alarm & Snooze trigger check (with native Android dedup)
  const evaluateDueAlerts = useCallback(() => {
    const current = new Date();
    const nowMs = current.getTime();
    setNow(current);

    const isNative = isNativeAndroidPlatform();
    if (isNative && !nativeSyncedOnceRef.current) {
      void syncHandledFromNative();
      return;
    }

    const runEvaluation = (handledSlotKeys: Set<string>, isAlertActive: boolean) => {
      if (isNative && isAlertActive) {
        // Native AlarmRingActivity is actively ringing on screen — do not show duplicate in-app popup
        return;
      }

      const todayStr = formatDateToYMD(current);
      const currentDay = current.getDay();
      const dueAlerts: ActiveAlert[] = [];
      const nativeGraceMs = isNative ? 2500 : 0;
      const catchupWindowMs = isNative ? 60 * 1000 : 60 * 60 * 1000;

      const isDueInWindow = (hour24: number, minute: number, key: string): boolean => {
        if (firedKeysRef.current.has(key) || handledSlotKeys.has(key)) return false;
        const scheduled = new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate(),
          hour24,
          minute,
          0,
          0
        ).getTime();
        const deltaMs = nowMs - scheduled;
        if (
          deltaMs >= nativeGraceMs &&
          deltaMs <= catchupWindowMs &&
          scheduled >= sessionStartMsRef.current - 60 * 1000
        ) {
          firedKeysRef.current.add(key);
          persistFiredKeys(firedKeysRef.current);
          return true;
        }
        return false;
      };

      // 1. Alarms
      alarms.forEach((a) => {
        if (!a.enabled) return;
        if (a.days.length > 0 && !a.days.includes(currentDay)) return;
        const key = `alarm:${a.id}:${todayStr}:${a.hour24}:${a.minute}`;
        if (isDueInWindow(a.hour24, a.minute, key)) {
          dueAlerts.push({
            uid: key,
            sourceId: a.id,
            type: 'alarm',
            name: a.label || 'Kairo Alarm',
            timeLabel: format12HourTime(a.hour24, a.minute),
            tone: a.tone,
            customRingtoneId: a.customRingtoneId,
            snoozeMinutes: a.snoozeMinutes ?? 5,
            vibrationMode: a.vibrationMode ?? 'sound_and_vibrate',
          });
        }
      });

      const suppressNonAlarmInFocus =
        focusState.running && settings.focusMuteInAppAlerts;

      // 2. Reminders
      if (!suppressNonAlarmInFocus) {
        reminders.forEach((r) => {
          if (!r.active || r.completed) return;
          if (!doesReminderOccurOnDate(r, todayStr)) return;
          const parsed = parseHHMM(r.time);
          if (!parsed) return;
          const key = `reminder:${r.id}:${todayStr}:${r.time}`;
          if (isDueInWindow(parsed.hour24, parsed.minute, key)) {
            dueAlerts.push({
              uid: key,
              sourceId: r.id,
              type: 'reminder',
              name: r.title,
              timeLabel: format12HourTime(parsed.hour24, parsed.minute),
              tone: 'zenith',
            });
          }
        });

        // 3. Tasks
        tasks.forEach((t) => {
          if (t.completed || t.dueDate !== todayStr) return;
          const parsed = parseHHMM(t.dueTime);
          if (!parsed) return;
          const key = `task:${t.id}:${todayStr}:${t.dueTime}`;
          if (isDueInWindow(parsed.hour24, parsed.minute, key)) {
            dueAlerts.push({
              uid: key,
              sourceId: t.id,
              type: 'task',
              name: t.title,
              timeLabel: format12HourTime(parsed.hour24, parsed.minute),
              tone: 'dawn',
            });
          }
        });
      }

      // 4. Snoozed Alerts
      const dueSnoozes = snoozedAlerts.filter((entry) => {
        const deltaMs = nowMs - entry.triggerAtMs;
        return deltaMs >= nativeGraceMs && deltaMs <= catchupWindowMs;
      });
      if (dueSnoozes.length > 0) {
        setSnoozedAlerts((prev) => prev.filter((entry) => nowMs < entry.triggerAtMs));
        dueSnoozes.forEach((entry) => {
          const snoozeUid = `${entry.alert.sourceId}-snooze-${entry.triggerAtMs}`;
          if (firedKeysRef.current.has(snoozeUid) || handledSlotKeys.has(snoozeUid)) return;
          firedKeysRef.current.add(snoozeUid);
          persistFiredKeys(firedKeysRef.current);
          const d = new Date(entry.triggerAtMs);
          dueAlerts.push({
            ...entry.alert,
            uid: snoozeUid,
            timeLabel: format12HourTime(d.getHours(), d.getMinutes()),
          });
        });
      }

      if (dueAlerts.length > 0) {
        if (!isNative) {
          enqueueAlerts(dueAlerts);
        }
      }
    };

    if (isNative) {
      void syncHandledFromNative().then(({ handledSlotKeys, isAlertActive }) => {
        runEvaluation(handledSlotKeys, isAlertActive);
      });
    } else {
      runEvaluation(new Set(), false);
    }
  }, [
    alarms,
    reminders,
    tasks,
    snoozedAlerts,
    focusState.running,
    settings.focusMuteInAppAlerts,
    enqueueAlerts,
    syncHandledFromNative,
  ]);

  useEffect(() => {
    const id = window.setInterval(evaluateDueAlerts, 1000);
    const onWake = () => {
      if (document.visibilityState === 'visible') {
        void syncHandledFromNative().then(() => {
          evaluateDueAlerts();
        });
      }
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [evaluateDueAlerts, syncHandledFromNative]);

  // Timestamp-accurate Focus Timer tick + automatic Android DND restore on finish
  useEffect(() => {
    if (!focusState.running || !focusState.endAtMs) return;

    const completeFocusSession = (completedEndMs: number) => {
      void markNativeSlotHandled(`focus-${completedEndMs}`);
      void setNativeFocusDndState({ enabled: false });
      soundEngine.playCompletionChime();
      setFocusState((prev) => ({
        ...prev,
        running: false,
        endAtMs: null,
        secondsLeft: 0,
        dndActive: false,
      }));
    };

    const syncRemaining = () => {
      if (!focusState.endAtMs) return;
      const rem = Math.max(0, Math.ceil((focusState.endAtMs - Date.now()) / 1000));
      if (rem <= 0) {
        completeFocusSession(focusState.endAtMs);
      } else {
        setFocusState((prev) =>
          prev.secondsLeft === rem ? prev : { ...prev, secondsLeft: rem }
        );
      }
    };

    syncRemaining();
    const id = window.setInterval(syncRemaining, 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') syncRemaining();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [focusState.running, focusState.endAtMs]);

  const handleSelectFocusPreset = useCallback((minutes: number) => {
    soundEngine.playTick(800, 0.02);
    void setNativeFocusDndState({ enabled: false });
    setFocusState((prev) => ({
      ...prev,
      presetMinutes: minutes,
      secondsLeft: minutes * 60,
      running: false,
      endAtMs: null,
      dndActive: false,
    }));
  }, []);

  const handleSelectFocusTask = useCallback((taskId: string | null) => {
    setFocusState((prev) => ({ ...prev, linkedTaskId: taskId }));
  }, []);

  const handleResetFocus = useCallback(() => {
    soundEngine.playTick(600, 0.02);
    void setNativeFocusDndState({ enabled: false });
    setFocusState((prev) => ({
      ...prev,
      running: false,
      endAtMs: null,
      secondsLeft: prev.presetMinutes * 60,
      dndActive: false,
    }));
  }, []);

  const handleToggleFocusRunning = useCallback(() => {
    if (focusState.running) {
      soundEngine.playTick(620, 0.03);
      const rem = focusState.endAtMs
        ? Math.max(1, Math.ceil((focusState.endAtMs - Date.now()) / 1000))
        : focusState.secondsLeft;
      void setNativeFocusDndState({ enabled: false });
      setFocusState((prev) => ({
        ...prev,
        running: false,
        endAtMs: null,
        secondsLeft: rem,
        dndActive: false,
      }));
      return;
    }

    soundEngine.playTick(940, 0.03);
    const durationSec =
      focusState.secondsLeft > 0
        ? focusState.secondsLeft
        : focusState.presetMinutes * 60;
    const endAtMs = Date.now() + durationSec * 1000;

    setFocusState((prev) => ({
      ...prev,
      secondsLeft: durationSec,
      running: true,
      endAtMs,
    }));
  }, [
    focusState.running,
    focusState.endAtMs,
    focusState.secondsLeft,
    focusState.presetMinutes,
  ]);

  const linkedFocusTaskTitle = useMemo(
    () => tasks.find((t) => t.id === focusState.linkedTaskId)?.title ?? '',
    [tasks, focusState.linkedTaskId]
  );

  // Single deduplicated native Focus DND + lock-screen countdown sync
  useEffect(() => {
    if (!focusState.running || !focusState.endAtMs) return;
    const endDate = new Date(focusState.endAtMs);
    const focusLabel = linkedFocusTaskTitle
      ? `Focus Complete: ${linkedFocusTaskTitle}`
      : 'Focus Session Complete';

    void setNativeFocusDndState({
      enabled: true,
      enableDnd: settings.focusAutoDnd,
      allowAlarms: true,
      endsAtMs: focusState.endAtMs,
      focusLabel,
      timeLabel: format12HourTime(endDate.getHours(), endDate.getMinutes()),
    }).then((res) => {
      setFocusState((prev) =>
        prev.running && prev.dndActive !== res.dndApplied
          ? { ...prev, dndActive: res.dndApplied }
          : prev
      );
    });
  }, [
    settings.focusAutoDnd,
    androidPermissions.dndAccess,
    focusState.running,
    focusState.endAtMs,
    linkedFocusTaskTitle,
  ]);

  // Quick Add handler from Dashboard '+' button or Android Home Widget
  const handleQuickAdd = useCallback(
    (target: QuickAddTarget, defaultDate?: string) => {
      soundEngine.playTick(880, 0.025);
      setQuickAddDate(defaultDate);
      setActiveTab(target);
      setCreateTriggers((prev) => ({ ...prev, [target]: prev[target] + 1 }));
    },
    []
  );

  // Consume Android Home Screen Widget Quick-Add launch intent on mount & foreground wake
  const checkPendingNativeQuickAdd = useCallback(async () => {
    const target = await consumeNativeQuickAddTarget();
    if (!target) return;
    if (target === 'dashboard') {
      setActiveTab('dashboard');
      return;
    }
    handleQuickAdd(target, getTodayDateString());
  }, [handleQuickAdd]);

  useEffect(() => {
    void checkPendingNativeQuickAdd();
    const onWakeQuickAdd = () => {
      if (document.visibilityState === 'visible') {
        void checkPendingNativeQuickAdd();
      }
    };
    document.addEventListener('visibilitychange', onWakeQuickAdd);
    window.addEventListener('focus', checkPendingNativeQuickAdd);
    return () => {
      document.removeEventListener('visibilitychange', onWakeQuickAdd);
      window.removeEventListener('focus', checkPendingNativeQuickAdd);
    };
  }, [checkPendingNativeQuickAdd]);

  // Task CRUD handlers & Auto-Carryover for Missed Tasks
  const carryOverMissedTasks = useCallback(() => {
    const todayStr = getTodayDateString();
    setTasks((prev) => {
      let changed = false;
      const updated = prev.map((t) => {
        if (!t.completed && t.dueDate < todayStr) {
          changed = true;
          return {
            ...t,
            dueDate: todayStr,
            carriedOverFrom: t.carriedOverFrom ?? t.dueDate,
          };
        }
        return t;
      });
      return changed ? updated : prev;
    });
  }, []);

  const currentDayKey = formatDateToYMD(now);
  useEffect(() => {
    if (!settings.autoCarryoverTasks) return;
    carryOverMissedTasks();
  }, [settings.autoCarryoverTasks, currentDayKey, carryOverMissedTasks]);

  const handleToggleTask = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  const handleCreateTask = useCallback(
    (data: Omit<TaskItem, 'id' | 'completed'>) => {
      setTasks((prev) => [
        ...prev,
        { ...data, id: `task-${Date.now()}`, completed: false },
      ]);
    },
    []
  );

  const handleUpdateTask = useCallback(
    (id: string, updates: Omit<TaskItem, 'id'>) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const dateEdited = updates.dueDate !== t.dueDate;
          return {
            ...updates,
            id,
            carriedOverFrom: dateEdited ? undefined : t.carriedOverFrom,
          };
        })
      );
    },
    []
  );

  const handleDeleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Reminder CRUD handlers
  const handleCreateReminder = useCallback(
    (data: Omit<ReminderItem, 'id' | 'completed'>) => {
      setReminders((prev) => [
        ...prev,
        { ...data, id: `rem-${Date.now()}`, completed: false },
      ]);
    },
    []
  );

  const handleUpdateReminder = useCallback(
    (id: string, updates: Omit<ReminderItem, 'id'>) => {
      setReminders((prev) =>
        prev.map((r) => (r.id === id ? { ...updates, id } : r))
      );
    },
    []
  );

  const handleDeleteReminder = useCallback((id: string) => {
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleToggleReminderActive = useCallback((id: string, active: boolean) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, active } : r))
    );
  }, []);

  const handleToggleReminderDone = useCallback((id: string) => {
    setReminders((prev) =>
      prev.map((r) => (r.id === id ? { ...r, completed: !r.completed } : r))
    );
  }, []);

  // Alarm CRUD handlers
  const handleToggleAlarm = useCallback((id: string, enabled: boolean) => {
    setAlarms((prev) =>
      prev.map((a) => (a.id === id ? { ...a, enabled } : a))
    );
  }, []);

  const handleSaveAlarm = useCallback(
    (data: Omit<ChronoAlarm, 'id'>, existingId?: string) => {
      if (existingId) {
        setAlarms((prev) =>
          prev.map((a) => (a.id === existingId ? { ...data, id: existingId } : a))
        );
      } else {
        setAlarms((prev) => [...prev, { ...data, id: `alarm-${Date.now()}` }]);
      }
    },
    []
  );

  const handleDeleteAlarm = useCallback((id: string) => {
    setAlarms((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleTriggerTestRing = useCallback(
    (alarm: ChronoAlarm) => {
      enqueueAlerts([
        {
          uid: `test-${alarm.id}-${Date.now()}`,
          sourceId: alarm.id,
          type: 'alarm',
          name: alarm.label || 'Kairo Alarm',
          timeLabel: format12HourTime(alarm.hour24, alarm.minute),
          tone: alarm.tone,
          customRingtoneId: alarm.customRingtoneId,
          snoozeMinutes: alarm.snoozeMinutes ?? 5,
          vibrationMode: alarm.vibrationMode ?? 'sound_and_vibrate',
        },
      ]);
    },
    [enqueueAlerts]
  );

  const handleStopAlert = useCallback(
    (targetUid?: string) => {
      const target = targetUid
        ? alertQueue.find((a) => a.uid === targetUid)
        : alertQueue[0];
      void notifyNativeServiceAction('stop');
      if (target) {
        void closeSystemAlertNotification(target.uid);
        setAlertQueue((prev) => prev.filter((a) => a.uid !== target.uid));
      } else {
        soundEngine.stopAlarmLoop();
        stopAlertVibration();
      }
    },
    [alertQueue]
  );

  const handleSnoozeAlert = useCallback(
    (targetUid?: string) => {
      const target = targetUid
        ? alertQueue.find((a) => a.uid === targetUid)
        : alertQueue[0];
      if (!target) return;

      void notifyNativeServiceAction('snooze');
      void closeSystemAlertNotification(target.uid);
      const snoozeMins = target.snoozeMinutes ?? 5;
      const triggerAtMs = Date.now() + snoozeMins * 60 * 1000;
      const snoozeDate = new Date(triggerAtMs);
      setSnoozedAlerts((prev) => [
        ...prev,
        {
          alert: {
            ...target,
            timeLabel: format12HourTime(
              snoozeDate.getHours(),
              snoozeDate.getMinutes()
            ),
          },
          triggerAtMs,
        },
      ]);
      setAlertQueue((prev) => prev.filter((a) => a.uid !== target.uid));
    },
    [alertQueue]
  );

  // Listen to Service Worker notification Snooze/Stop action button clicks
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    const handleMessage = (event: MessageEvent) => {
      const payload = event.data as
        | { type?: string; action?: string; uid?: string }
        | undefined;
      if (!payload || payload.type !== 'KAIRO_NOTIFICATION_ACTION') return;
      if (payload.action === 'snooze') {
        handleSnoozeAlert(payload.uid);
      } else if (payload.action === 'stop') {
        handleStopAlert(payload.uid);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [handleSnoozeAlert, handleStopAlert]);

  const handleRequestNotificationPermission = useCallback(async () => {
    soundEngine.playTick(860, 0.02);
    const next = await requestOSNotificationPermission();
    setNotificationPermission(next);
  }, []);

  const handleTestAlertPopup = useCallback(() => {
    const d = new Date();
    enqueueAlerts([
      {
        uid: `test-alert-${Date.now()}`,
        sourceId: 'test-reminder',
        type: 'reminder',
        name: 'Sample Alert · Tap Snooze or Stop',
        timeLabel: format12HourTime(d.getHours(), d.getMinutes()),
        tone: 'amber',
      },
    ]);
  }, [enqueueAlerts]);

  const handleTriggerAndroidPermission = useCallback(
    async (kind: AndroidPermissionAction) => {
      soundEngine.playTick(860, 0.02);
      await triggerAndroidPermissionSetting(kind);
      const refreshed = await getAndroidAlertPermissions();
      setAndroidPermissions(refreshed);
    },
    []
  );

  const handleTestLockScreenAlert = useCallback(async () => {
    soundEngine.playTick(880, 0.02);
    return scheduleNativeLockScreenTest(5);
  }, []);

  const handleResetAllData = useCallback(async () => {
    soundEngine.playTick(880, 0.03);
    // 1. Clear Native Android Alarms & Storage
    await clearAllNativeAlerts();

    // 2. Clear Local Storage keys
    Object.values(STORAGE_KEYS).forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore
      }
    });

    // 3. Reset React states to initial defaults
    setTasks(getInitialTasks());
    setReminders(getInitialReminders());
    setAlarms(INITIAL_ALARMS);
    setNotes(getInitialNotes());
    setSettings(DEFAULT_SETTINGS);
    setSnoozedAlerts([]);
    setAlertQueue([]);
    firedKeysRef.current = new Set();
  }, []);

  // Note CRUD handlers
  const handleCreateNote = useCallback(
    (data: Omit<NoteItem, 'id' | 'updatedAt'>) => {
      setNotes((prev) => [
        {
          ...data,
          id: `note-${Date.now()}`,
          updatedAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    []
  );

  const handleUpdateNote = useCallback(
    (id: string, updates: Omit<NoteItem, 'id' | 'updatedAt'>) => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...updates, id, updatedAt: new Date().toISOString() }
            : n
        )
      );
    },
    []
  );

  const handleDeleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const handleToggleNotePin = useCallback((id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    );
  }, []);

  const handleToggleNoteChecklistLine = useCallback(
    (noteId: string, lineIdx: number) => {
      setNotes((prev) =>
        prev.map((n) => {
          if (n.id !== noteId) return n;
          const nextContent = toggleChecklistLineInContent(n.content, lineIdx);
          if (nextContent === null) return n;
          return {
            ...n,
            content: nextContent,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    []
  );

  const handleRestoreBackup = useCallback((payload: ChronoBackupPayload) => {
    setTasks(
      payload.data.tasks.map((t) => ({
        ...t,
        priority: normalizePriority(t.priority),
        category: normalizeTaskCategory(t.category),
      }))
    );
    setReminders(
      payload.data.reminders.map((r) => ({
        ...r,
        priority: normalizePriority(r.priority),
      }))
    );
    setAlarms(payload.data.alarms);
    setNotes(payload.data.notes);
    const restoredFolders = Array.from(
      new Set(
        payload.data.notes
          .map((n) => n.category)
          .filter((c): c is string => Boolean(c && c.trim()))
      )
    );
    if (restoredFolders.length > 0) {
      setSettings((prev) => ({
        ...prev,
        noteFolders: Array.from(
          new Set([
            ...(prev.noteFolders ?? [...DEFAULT_NOTE_FOLDERS]),
            ...restoredFolders,
          ])
        ),
      }));
    }
  }, []);

  // Scheduled Auto-Backup runner
  const runAutoBackup = useCallback(
    async (manual = false) => {
      if (autoBackupInFlightRef.current) return;
      autoBackupInFlightRef.current = true;
      try {
        const payload = buildBackupPayload({ tasks, reminders, alarms, notes });
        const serialized = JSON.stringify(payload, null, 2);
        const dest = settings.autoBackupDestination;
        const statusParts: string[] = [];

        if (dest === 'local' || dest === 'both') {
          if (isNativeAndroidPlatform()) {
            const autoFileName = `kairo-auto-backup-${getTodayDateString()}.json`;
            const nativeRes = await saveNativeAndroidBackup(autoFileName, serialized);
            if (nativeRes.saved) {
              statusParts.push(`Saved to ${nativeRes.location}`);
            } else {
              statusParts.push(nativeRes.error ?? 'Local save failed');
            }
          } else {
            try {
              localStorage.setItem(WEB_AUTO_BACKUP_STORAGE_KEY, serialized);
              statusParts.push('Saved snapshot in browser storage');
            } catch {
              statusParts.push('Browser storage full');
            }
          }
        }

        if (dest === 'drive' || dest === 'both') {
          const token = getAccessToken();
          if (!token) {
            if (manual) {
              throw new Error(
                'Google Drive is not signed in. Sign in with Google first or switch destination to Local.'
              );
            }
            statusParts.push('Google Drive skipped (sign in needed)');
          } else {
            const existing = await listDriveBackups(token);
            const autoFile = existing.find((f) => f.name === 'kairo-auto-backup.json');
            if (autoFile) {
              await updateDriveBackup(token, autoFile.id, payload);
              statusParts.push('Updated kairo-auto-backup.json in Google Drive');
            } else {
              await createDriveBackup(token, 'kairo-auto-backup.json', payload);
              statusParts.push('Created kairo-auto-backup.json in Google Drive');
            }
          }
        }

        const nowIso = new Date().toISOString();
        setSettings((prev) => ({
          ...prev,
          lastAutoBackupAt: nowIso,
          lastAutoBackupStatus: statusParts.join(' · ') || 'Completed',
        }));
      } finally {
        autoBackupInFlightRef.current = false;
      }
    },
    [tasks, reminders, alarms, notes, settings.autoBackupDestination]
  );

  useEffect(() => {
    if (!settings.autoBackupEnabled) return;

    const checkSchedule = () => {
      const intervalMs =
        settings.autoBackupFrequency === 'weekly'
          ? 7 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
      const lastMs = settings.lastAutoBackupAt
        ? new Date(settings.lastAutoBackupAt).getTime()
        : 0;
      if (!lastMs || Number.isNaN(lastMs) || Date.now() - lastMs >= intervalMs) {
        void runAutoBackup(false);
      }
    };

    checkSchedule();
    const timer = window.setInterval(checkSchedule, 15 * 60 * 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') checkSchedule();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [
    settings.autoBackupEnabled,
    settings.autoBackupFrequency,
    settings.lastAutoBackupAt,
    runAutoBackup,
  ]);

  // Derived clock & summary
  const clockDisplay = useMemo(() => {
    const h = now.getHours();
    const m = now.getMinutes();
    const s = now.getSeconds();
    const h12 = h % 12 || 12;
    const period = h >= 12 ? 'PM' : 'AM';
    return {
      hm: `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
      sec: String(s).padStart(2, '0'),
      period,
      dateLabel: now.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
      greeting: getGreeting(h),
    };
  }, [now]);

  const nextAlarmLabel = useMemo(() => {
    const active = alarms.filter((a) => a.enabled);
    if (active.length === 0) return 'Off';
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const sorted = [...active].sort((a, b) => {
      const aMin = a.hour24 * 60 + a.minute;
      const bMin = b.hour24 * 60 + b.minute;
      const aDelta = aMin > nowMinutes ? aMin - nowMinutes : aMin + 1440 - nowMinutes;
      const bDelta = bMin > nowMinutes ? bMin - nowMinutes : bMin + 1440 - nowMinutes;
      return aDelta - bDelta;
    });
    const next = sorted[0];
    const h12 = next.hour24 % 12 || 12;
    const period = next.hour24 >= 12 ? 'PM' : 'AM';
    return `${String(h12).padStart(2, '0')}:${String(next.minute).padStart(
      2,
      '0'
    )} ${period}`;
  }, [alarms, now]);

  const primaryNavItems: {
    id: NavTab;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Today', icon: LayoutDashboard },
    { id: 'tasks', label: 'Tasks', mobileLabel: 'Tasks', icon: CheckSquare },
    { id: 'reminders', label: 'Reminders', mobileLabel: 'Reminders', icon: Bell },
    { id: 'alarms', label: 'Alarms', mobileLabel: 'Alarms', icon: AlarmClock },
    { id: 'notes', label: 'Notes', mobileLabel: 'Notes', icon: FileText },
  ];

  const desktopNavItems = [
    ...primaryNavItems,
    { id: 'settings' as NavTab, label: 'Settings', mobileLabel: 'Settings', icon: Settings },
  ];

  const today = getTodayDateString();
  const todayPendingTasks = tasks
    .filter((t) => t.dueDate === today && !t.completed)
    .sort((a, b) => a.dueTime.localeCompare(b.dueTime));
  const todayTasksRemaining = todayPendingTasks.length;
  const todayRemindersRemaining = reminders.filter(
    (r) => r.active && !r.completed && doesReminderOccurOnDate(r, today)
  ).length;
  const nextPendingTaskTitle = todayPendingTasks[0]?.title ?? 'All caught up today';

  const syncWidgetNow = useCallback(() => {
    const upcoming = computeUpcomingNativeAlerts(alarms, reminders, tasks, snoozedAlerts);
    const nowMs = Date.now();
    const cutoff3h = nowMs + 3 * 60 * 60 * 1000;
    const items3h = upcoming.filter(
      (item) => item.triggerAtMs > nowMs && item.triggerAtMs <= cutoff3h
    );

    const next3HoursList = items3h.map((item) => ({
      type: item.type,
      title: item.name,
      timeLabel: item.timeLabel,
      triggerAtMs: item.triggerAtMs,
    }));

    void syncNativeWidgetSummary({
      tasksLeft: todayTasksRemaining,
      remindersLeft: todayRemindersRemaining,
      nextAlarm: nextAlarmLabel,
      nextTaskTitle: nextPendingTaskTitle,
      next3HoursJson: JSON.stringify(next3HoursList),
      itemsInNext3HoursCount: next3HoursList.length,
    });
  }, [
    alarms,
    reminders,
    tasks,
    snoozedAlerts,
    todayTasksRemaining,
    todayRemindersRemaining,
    nextAlarmLabel,
    nextPendingTaskTitle,
  ]);

  useEffect(() => {
    syncWidgetNow();
  }, [syncWidgetNow]);

  return (
    <div className="min-h-screen bg-[#F4F6FB] dark:bg-[#090A0F] text-slate-900 dark:text-[#F8FAFC] flex flex-col lg:flex-row transition-colors duration-200">
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:w-[272px] lg:shrink-0 lg:flex-col lg:justify-between bg-white dark:bg-[#12141F] border-r border-slate-200 dark:border-white/[0.08] p-6 sticky top-0 h-screen overflow-y-auto">
        <div>
          {/* Wordmark */}
          <div className="flex items-center gap-3">
            <AppLogo className="h-9 w-9" />
            <span className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-[#F8FAFC]">
              Kairo
            </span>
          </div>

          {/* Live Clock */}
          <div className="mt-7 pb-5 border-b border-slate-200 dark:border-white/[0.06]">
            <p className="text-xs font-medium text-slate-500 dark:text-[#94A3B8]">
              {clockDisplay.dateLabel}
            </p>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono tabular-nums">
              <span className="text-4xl font-semibold tracking-tight text-slate-900 dark:text-[#F8FAFC]">
                {clockDisplay.hm}
              </span>
              <span className="text-sm font-medium text-slate-400 dark:text-[#64748B]">
                :{clockDisplay.sec}
              </span>
              <span className="ml-1 text-xs font-semibold text-indigo-600 dark:text-[#818CF8]">
                {clockDisplay.period}
              </span>
            </div>
          </div>

          {/* Clear Navigation */}
          <nav aria-label="Primary sections" className="mt-5 flex flex-col gap-1">
            {desktopNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playTick(820, 0.02);
                    setActiveTab(item.id);
                  }}
                  className={`flex min-h-[44px] items-center gap-3 rounded-2xl px-4 py-2 text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-[#1A1D2D] text-indigo-700 dark:text-[#F8FAFC] border border-indigo-200 dark:border-white/12 shadow-xs dark:shadow-[0_0_20px_rgba(99,102,241,0.12)]'
                      : 'text-slate-600 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-white/[0.03] border border-transparent'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive
                        ? 'text-indigo-600 dark:text-[#818CF8]'
                        : 'text-slate-400 dark:text-[#64748B]'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Quiet Temporal Summary */}
        <div className="pt-5 mt-4 border-t border-slate-200 dark:border-white/[0.06] flex flex-col gap-2.5 text-xs">
          {focusState.running && (
            <button
              type="button"
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-[#34D399]/12 border border-emerald-200 dark:border-[#34D399]/30 px-3 py-2 text-left cursor-pointer"
            >
              <span className="font-medium text-emerald-700 dark:text-[#34D399]">
                {focusState.dndActive ? 'Focus · DND ON' : 'Focus Active'}
              </span>
              <span className="font-mono font-semibold text-emerald-700 dark:text-[#34D399] tabular-nums">
                {String(Math.floor(focusState.secondsLeft / 60)).padStart(2, '0')}:
                {String(focusState.secondsLeft % 60).padStart(2, '0')}
              </span>
            </button>
          )}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-[#64748B]">Next alarm</span>
            <span className="font-mono font-medium text-amber-600 dark:text-[#F59E0B] tabular-nums">
              {nextAlarmLabel}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-[#64748B]">Tasks due today</span>
            <span className="font-mono font-medium text-emerald-600 dark:text-[#34D399] tabular-nums">
              {todayTasksRemaining} left
            </span>
          </div>
        </div>
      </aside>

      {/* Mobile Compact Header with OS Status Bar Safe Area */}
      <header className="lg:hidden sticky top-0 z-30 bg-[#F4F6FB]/92 dark:bg-[#090A0F]/92 backdrop-blur-xl border-b border-slate-200 dark:border-white/[0.06] px-4 safe-top-header flex items-center justify-between gap-2 min-h-[60px]">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <AppLogo className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-base font-semibold leading-snug text-slate-900 dark:text-[#F8FAFC] truncate">
              {activeTab === 'dashboard'
                ? 'Kairo'
                : (desktopNavItems.find((n) => n.id === activeTab)?.label ?? 'Kairo')}
            </h1>
            <p className="text-[11px] leading-snug text-slate-500 dark:text-[#94A3B8] truncate">
              {clockDisplay.dateLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="text-right font-mono tabular-nums mr-1">
            <div className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC] leading-snug">
              {clockDisplay.hm}{' '}
              <span className="text-[11px] text-indigo-600 dark:text-[#818CF8]">
                {clockDisplay.period}
              </span>
            </div>
            <div className="text-[10px] leading-snug text-amber-600 dark:text-[#F59E0B]">
              {nextAlarmLabel}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.playTick(820, 0.02);
              setActiveTab('settings');
            }}
            aria-label="Settings"
            className={`flex h-10 w-10 items-center justify-center rounded-full border transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-indigo-50 dark:bg-[#6366F1]/25 border-indigo-300 dark:border-[#6366F1]/50 text-indigo-700 dark:text-[#c0c1ff]'
                : 'bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-600 dark:text-[#94A3B8]'
            }`}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 pt-5 pb-32 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          {/* Desktop Page Header */}
          <div className="hidden lg:flex items-end justify-between mb-8">
            <div>
              <p className="text-xs font-medium text-indigo-600 dark:text-[#818CF8]">
                {clockDisplay.greeting}
              </p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-[#F8FAFC] text-balance">
                {activeTab === 'dashboard' && 'Daily Overview'}
                {activeTab === 'tasks' && 'Tasks'}
                {activeTab === 'reminders' && 'Reminders'}
                {activeTab === 'alarms' && 'Alarms'}
                {activeTab === 'notes' && 'Notes'}
                {activeTab === 'settings' && 'Settings'}
              </h1>
            </div>
            <p className="text-sm text-slate-600 dark:text-[#94A3B8] tabular-nums">
              {clockDisplay.dateLabel} · {todayTasksRemaining} tasks remaining today
            </p>
          </div>

          {/* One-tap Notification Permission Prompt (when not yet granted) */}
          {notificationPermission === 'default' && !notifBannerDismissed && (
            <div
              role="region"
              aria-label="Enable notifications"
              className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-indigo-50 dark:bg-[#6366F1]/12 border border-indigo-200 dark:border-[#6366F1]/35 px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Bell className="h-4 w-4 text-indigo-600 dark:text-[#818CF8] shrink-0" />
                <p className="text-xs sm:text-sm text-slate-800 dark:text-[#F8FAFC]">
                  Enable notifications so Tasks, Reminders, and Alarms alert you with Snooze &amp; Stop controls.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleRequestNotificationPermission()}
                  className="h-9 rounded-full bg-gradient-to-r from-[#6366F1] to-[#818CF8] px-4 text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                >
                  Enable Alerts
                </button>
                <button
                  type="button"
                  onClick={() => setNotifBannerDismissed(true)}
                  aria-label="Dismiss notification prompt"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 dark:text-[#94A3B8] hover:text-slate-900 dark:hover:text-[#F8FAFC] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Screen Switcher */}
          {activeTab === 'dashboard' && (
            <DashboardSection
              tasks={tasks}
              reminders={reminders}
              alarms={alarms}
              notes={notes}
              focusState={focusState}
              onSelectFocusPreset={handleSelectFocusPreset}
              onSelectFocusTask={handleSelectFocusTask}
              onToggleFocusRunning={handleToggleFocusRunning}
              onResetFocus={handleResetFocus}
              onNavigate={setActiveTab}
              onQuickAdd={handleQuickAdd}
              onToggleTask={handleToggleTask}
              onToggleReminderDone={handleToggleReminderDone}
              onToggleAlarm={handleToggleAlarm}
              onToggleNoteChecklistLine={handleToggleNoteChecklistLine}
              isNativeAndroid={androidPermissions.isNativeAndroid}
              dndAccessGranted={androidPermissions.dndAccess}
              focusAutoDndEnabled={settings.focusAutoDnd}
              onEnableDndAccess={() => {
                void handleTriggerAndroidPermission('dnd');
              }}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksSection
              tasks={tasks}
              autoOpenCreateKey={createTriggers.tasks}
              defaultCreateDate={quickAddDate}
              autoCarryoverEnabled={settings.autoCarryoverTasks}
              onToggleAutoCarryover={(enabled) =>
                setSettings((prev) => ({ ...prev, autoCarryoverTasks: enabled }))
              }
              onCarryOverOverdue={carryOverMissedTasks}
              onToggleTask={handleToggleTask}
              onCreateTask={handleCreateTask}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
            />
          )}

          {activeTab === 'reminders' && (
            <RemindersSection
              reminders={reminders}
              autoOpenCreateKey={createTriggers.reminders}
              defaultCreateDate={quickAddDate}
              onCreateReminder={handleCreateReminder}
              onUpdateReminder={handleUpdateReminder}
              onDeleteReminder={handleDeleteReminder}
              onToggleActive={handleToggleReminderActive}
              onToggleCompleted={handleToggleReminderDone}
            />
          )}

          {activeTab === 'alarms' && (
            <AlarmsSection
              alarms={alarms}
              autoOpenCreateKey={createTriggers.alarms}
              onToggleAlarm={handleToggleAlarm}
              onSaveAlarm={handleSaveAlarm}
              onDeleteAlarm={handleDeleteAlarm}
              onTriggerTestRing={handleTriggerTestRing}
            />
          )}

          {activeTab === 'notes' && (
            <NotesSection
              notes={notes}
              folders={settings.noteFolders ?? [...DEFAULT_NOTE_FOLDERS]}
              onUpdateFolders={(next) =>
                setSettings((prev) => ({ ...prev, noteFolders: next }))
              }
              autoOpenCreateKey={createTriggers.notes}
              onCreateNote={handleCreateNote}
              onUpdateNote={handleUpdateNote}
              onDeleteNote={handleDeleteNote}
              onTogglePin={handleToggleNotePin}
              onCreateTaskFromNote={handleCreateTask}
              onCreateReminderFromNote={handleCreateReminder}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsSection
              settings={settings}
              onUpdateSettings={setSettings}
              googleUser={googleUser}
              needsGoogleAuth={needsGoogleAuth}
              onAuthUpdated={(user, needs) => {
                setGoogleUser(user);
                setNeedsGoogleAuth(needs);
              }}
              tasks={tasks}
              reminders={reminders}
              alarms={alarms}
              notes={notes}
              onRestoreBackup={handleRestoreBackup}
              onRunAutoBackupNow={() => runAutoBackup(true)}
              onRefreshWidget={syncWidgetNow}
              notificationPermission={notificationPermission}
              onRequestNotificationPermission={() => {
                void handleRequestNotificationPermission();
              }}
              onTestLockScreenAlert={handleTestLockScreenAlert}
              androidPermissions={androidPermissions}
              onTriggerAndroidPermission={(kind) => {
                void handleTriggerAndroidPermission(kind);
              }}
              onResetAllData={handleResetAllData}
            />
          )}
        </div>
      </main>

      {/* Mobile Fixed Bottom Thumb Navigation Bar */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/94 dark:bg-[#12141F]/92 backdrop-blur-xl border-t border-slate-200 dark:border-white/[0.08] px-1 pt-1.5 safe-bottom-nav"
      >
        <div className="grid grid-cols-5 min-h-[58px] items-center">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  soundEngine.playTick(820, 0.02);
                  setActiveTab(item.id);
                }}
                className="flex min-h-[48px] flex-col items-center justify-center gap-1 px-1 py-1 cursor-pointer"
              >
                <Icon
                  className={`h-5 w-5 shrink-0 transition-colors ${
                    isActive
                      ? 'text-indigo-600 dark:text-[#818CF8]'
                      : 'text-slate-400 dark:text-[#64748B]'
                  }`}
                />
                <span
                  className={`text-[10px] leading-tight font-medium tracking-tight truncate max-w-full ${
                    isActive
                      ? 'text-slate-900 dark:text-[#F8FAFC]'
                      : 'text-slate-500 dark:text-[#94A3B8]'
                  }`}
                >
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Minimal Lock-Screen Ready Alert Popup (Task, Reminder, Alarm) */}
      <AlarmRingOverlay
        alert={activeAlert}
        queueCount={alertQueue.length}
        onSnooze={() => handleSnoozeAlert()}
        onStop={() => handleStopAlert()}
      />
    </div>
  );
}
