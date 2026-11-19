import type { AlarmTone, AlarmVibrationMode } from '../types/chrono';

export type AlertSourceType = 'alarm' | 'reminder' | 'task';

export interface ActiveAlert {
  uid: string;
  sourceId: string;
  type: AlertSourceType;
  name: string;
  timeLabel: string;
  tone: AlarmTone;
  customRingtoneId?: string;
  snoozeMinutes?: number;
  vibrationMode?: AlarmVibrationMode;
}

export type NotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

let swRegistration: ServiceWorkerRegistration | null = null;

export function getNotificationPermissionState(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    swRegistration = reg;
    return reg;
  } catch {
    return null;
  }
}

export async function requestOSNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      await registerNotificationServiceWorker();
    }
    return result;
  } catch {
    return getNotificationPermissionState();
  }
}

const TYPE_LABEL: Record<AlertSourceType, string> = {
  alarm: 'Alarm',
  reminder: 'Reminder',
  task: 'Task',
};

export async function showSystemAlertNotification(
  alert: ActiveAlert
): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title = `${TYPE_LABEL[alert.type]} · ${alert.timeLabel}`;
  const body = alert.name;
  const snoozeMins = alert.snoozeMinutes && alert.snoozeMinutes > 0 ? alert.snoozeMinutes : 5;

  try {
    const reg =
      swRegistration ??
      (typeof navigator !== 'undefined' && 'serviceWorker' in navigator
        ? await navigator.serviceWorker.getRegistration()
        : undefined);

    if (reg && typeof reg.showNotification === 'function') {
      const options: NotificationOptions & {
        actions?: { action: string; title: string }[];
        renotify?: boolean;
        vibrate?: number[];
      } = {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: alert.uid,
        renotify: true,
        requireInteraction: true,
        ...(alert.vibrationMode === 'sound_only'
          ? {}
          : { vibrate: [400, 200, 400, 200, 400] }),
        data: {
          uid: alert.uid,
          alertType: alert.type,
          name: alert.name,
        },
        actions: [
          { action: 'snooze', title: `Snooze ${snoozeMins} min` },
          { action: 'stop', title: 'Stop' },
        ],
      };
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    // Fallback to standard Notification constructor below
  }

  try {
    const n = new Notification(title, {
      body,
      icon: '/favicon.svg',
      tag: alert.uid,
      requireInteraction: true,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Ignore environments where Notification constructor is restricted
  }
}

export async function closeSystemAlertNotification(uid: string): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = swRegistration ?? (await navigator.serviceWorker.getRegistration());
    if (!reg || typeof reg.getNotifications !== 'function') return;
    const active = await reg.getNotifications({ tag: uid });
    active.forEach((n) => n.close());
  } catch {
    // Ignore
  }
}

let vibrationInterval: number | null = null;

export function startAlertVibration(): void {
  stopAlertVibration();
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return;
  }
  try {
    navigator.vibrate([450, 220, 450]);
    vibrationInterval = window.setInterval(() => {
      navigator.vibrate([450, 220, 450]);
    }, 1800);
  } catch {
    // Ignore vibration errors
  }
}

export function stopAlertVibration(): void {
  if (vibrationInterval !== null) {
    window.clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(0);
    } catch {
      // Ignore
    }
  }
}
