# Kairo

**Kairo** is a unified daily productivity workspace combining a collapsible **Calendar**, **Focus Timer with Auto Do Not Disturb**, **Tasks**, **Smart Reminders**, **Alarms**, **Notes**, **Scheduled Cloud/Local Backup**, and **Native Android Lock-Screen Alerts & Home Screen Widget** in a responsive React + TypeScript + Capacitor application.

---

## Features

- **Dashboard, Focus Timer & Collapsible Calendar**
  - Chronological **Morning / Afternoon / Evening** timeline sorted by time and priority with quick pill filters (`All`, `P1 Critical`, `Tasks`, `Reminders`, `Alarms`) and **Copy Day**.
  - Built-in **Focus Timer** (`15m`, `25m`, `45m`, `60m`) with optional task linking, quiet Kairo popup mode, automatic strict **Android Do Not Disturb** distraction blocking (restoring your prior notification state when finished or paused), and a live **Lock-Screen Countdown Timer** (`Full Screen` & `End Focus` actions) visible whenever you wake your locked phone.
  - Top collapsible monthly **Calendar** (hidden by default with a show/hide toggle) showing indicators on days with scheduled items and displaying a **Selected Day Details** breakdown.
  - Quick `+` action menu to jump directly into creating a **Task**, **Reminder**, **Alarm**, or **Note**.
- **Tasks & Auto-Carryover**
  - Priority levels (**P1 Critical**, **P2 Medium**, **P3 Low**), categories (**Work**, **Personal**, **Family**, **Routine**), explicit time slots with automatic overlap warnings, duration chips, and start-time alert scheduling.
  - **Auto-Carryover for Missed Tasks**: Automatically rolls uncompleted past-due tasks forward to today with a **From \<date\>** badge, or lets you carry over overdue items in one tap from the **Tasks** header.
- **Reminders**
  - Priority levels (**P1–P3**), independent **Active** pause toggles, and flexible recurrence: **Once**, **Daily**, **Weekdays**, **Monthly**, and **Yearly**.
- **Alarms, Per-Alarm Presets & Device Ringtones**
  - Interactive **Temporal Wheel** time picker and **New Alarm** view.
  - Built-in synthesized alarm chimes (`soundEngine.ts`), **OS / Device Ringtone** picker (`ringtoneStore.ts`) persisted offline in IndexedDB, and optional 15-second **Gradual Crescendo**.
  - Per-alarm **Snooze Presets** (`3m`, `5m`, `10m`, `15m`, `20m`) and **Vibration & Ring Modes** (`Sound + Vibrate`, `Vibrate Only`, `Sound Only`) honored across Web and Android lock-screen alerts.
- **Notes, Folders, Tags & Checklist Conversion**
  - Organize notes with **Folders** (`General`, `Work`, `Ideas`, plus custom user folders), clickable **Tags** (`#urgent`, `#meeting`, `#shopping`, custom tags), and a dedicated **Pinned** section.
  - Structured formatting toolbar (**Bullets**, **Numbered**, **Checklist**), Edit/Preview toggle, and **Voice-to-Text** dictation (Web Speech API & native Android Speech Recognition).
  - Interactive checklist toggling directly on note cards and one-tap **Convert Checklist Line → Task / Reminder** right from any checklist item.
- **Home Screen Quick-Add Widget (Android)**
  - Native `Kairo Quick Add` home screen widget displaying today’s remaining tasks, active reminders, next alarm, and next pending task, with 1-tap **`+ Task`**, **`+ Remind`**, **`+ Alarm`**, and **`+ Note`** shortcuts that open directly to creation.
- **Notifications & Lock-Screen Alerts (Web + Android)**
  - Unified alert queue for **Alarms**, **Reminders**, and **Tasks** with dynamic **Snooze** (`3m`–`20m`) and **Stop** controls.
  - **Web**: Browser Notification API + Service Worker (`public/sw.js`) + interactive full-screen overlay (`AlarmRingOverlay.tsx`).
  - **Native Android (Capacitor)**:
    - Exact scheduling via `AlarmManager.setAlarmClock` (`AlarmScheduler.java`) and reboot recovery (`BootReceiver.java`).
    - Wakes CPU with `WakeLock` (`ExactAlarmReceiver.java`) and launches a media-playback `ForegroundService` (`AlarmForegroundService.java`) playing `USAGE_ALARM` audio + vibration per alarm mode.
    - Displays **Heads-Up**, **High-Priority**, and **Lock-Screen (`VISIBILITY_PUBLIC`)** notifications with dynamic **Snooze** & **Stop** actions.
    - Launches a dedicated native lock-screen popup (`AlarmLockScreenActivity.java`) using `setShowWhenLocked(true)`, `setTurnScreenOn(true)`, and `USE_FULL_SCREEN_INTENT` / `SYSTEM_ALERT_WINDOW`.
- **Settings, Offline Help & Scheduled Auto-Backup**
  - **Settings** cards collapsed by default with **Expand All / Collapse All**, Light & Dark themes, combined **Font Size & App Font** module (`Plus Jakarta Sans`, `Manrope`, `Outfit`, `Lora`, `JetBrains Mono`; `13px`–`22px`), and an offline **Help & Interactive Q&A** assistant.
  - **Backup Export & Import**: `Copy Backup`, `Paste Backup`, `Export Backup` (saves to `Internal Storage/Download/Kairo/` on Android with path preview), `Import Backup`, **Google Drive** cloud sync, and **Scheduled Auto-Backup** (`Daily` / `Weekly` to Local, Google Drive, or Both).

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Motion, Lucide React
- **Storage**: `localStorage` + IndexedDB (for custom device ringtones)
- **Mobile Wrapper**: Capacitor (`android-native/` Java plugin, widget provider, DND manager, foreground service, receivers, and lock-screen activity)

---

## Project Structure

```text
├── android-native/
│   ├── java/                     # Native Android Java templates injected by android:setup
│   │   ├── AlarmForegroundService.java
│   │   ├── AlarmLockScreenActivity.java
│   │   ├── AlarmScheduler.java
│   │   ├── BootReceiver.java
│   │   ├── ExactAlarmReceiver.java
│   │   ├── FocusDndManager.java
│   │   ├── KairoAlarmPlugin.java
│   │   ├── KairoQuickWidgetProvider.java
│   │   └── MainActivity.java
│   └── res/                      # Android Home Screen Widget layouts, drawables, strings & provider XML
├── public/
│   ├── favicon.svg               # Kairo app icon
│   └── sw.js                     # Service Worker for web notifications
├── scripts/
│   └── apply-android-native.mjs  # Copies Java + res files & patches AndroidManifest.xml
├── src/
│   ├── components/               # UI sections, TemporalWheel, AlarmRingOverlay, toggles, Help/Backup
│   ├── types/chrono.ts           # Core data models & date/time helpers
│   ├── utils/                    # Sound, ringtone store, offline Help engine, notifications, Drive & Android bridge
│   ├── App.tsx
│   └── index.css
├── index.html
├── package.json
└── vite.config.ts
```

---

## Getting Started (Web)

### Prerequisites
- **Node.js** 18+ (or 20+ recommended)

### Install & Run Locally
```bash
npm install
npm run dev
```

### Type-Check & Production Build
```bash
npm run lint
npm run build
```

---

## Building the Android APK (Capacitor)

### Prerequisites
- **Android Studio** + Android SDK (API 33–35)
- **JDK 17+**

### 1. Build Web Bundle & Initialize Android (First Time Only)
```bash
npm install
npm run build
npx cap init "Kairo" "com.kairo.app" --web-dir=dist
npx cap add android
```

> If `android/` already exists in your local workspace, skip `npx cap init` and `npx cap add android`.

### 2. Apply Native Lock-Screen, Widget & DND Code & Sync
```bash
npm run build
npm run android:setup
npx cap sync android
```

`npm run android:setup` automatically detects your Android package ID, copies the Java classes into `android/app/src/main/java/<package>/`, installs `android-native/res/` widget resources into `android/app/src/main/res/`, and adds required permissions, receivers, and `KairoQuickWidgetProvider` entries to `AndroidManifest.xml`, including:
- `POST_NOTIFICATIONS`
- `SCHEDULE_EXACT_ALARM` & `USE_EXACT_ALARM`
- `USE_FULL_SCREEN_INTENT`
- `WAKE_LOCK` & `DISABLE_KEYGUARD`
- `SYSTEM_ALERT_WINDOW`
- `FOREGROUND_SERVICE` & `FOREGROUND_SERVICE_MEDIA_PLAYBACK`
- `RECEIVE_BOOT_COMPLETED`, `VIBRATE`, `MODIFY_AUDIO_SETTINGS`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, and `ACCESS_NOTIFICATION_POLICY`
- `RECORD_AUDIO`, `READ_MEDIA_AUDIO`, `READ_EXTERNAL_STORAGE` (<= API 32), `WRITE_EXTERNAL_STORAGE` (<= API 29), and `ACCESS_NETWORK_STATE`

### 3. Build the Debug APK

**Windows (PowerShell / CMD):**
```powershell
cd android
.\gradlew.bat assembleDebug
```

**macOS / Linux:**
```bash
cd android
./gradlew assembleDebug
```

Output APK path:
`android/app/build/outputs/apk/debug/app-debug.apk`

### 4. Grant Device Permissions & Add Home Widget After Installing
Open **Kairo → Settings → Notifications & Alert Popups** on your Android device and tap **Enable** on all 8 listed permissions:
1. **Notifications (Heads-Up & Lock-Screen Alerts)**
2. **Full-Screen Intent (Show Alert Over Lock Screen)**
3. **Overlay / Draw Over Other Apps**
4. **Exact Alarm & Reminder Timing**
5. **Unrestricted Background / Battery Optimization Off**
6. **Do Not Disturb Access (Focus Distraction Shield)**
7. **Microphone (Voice-to-Text Notes)**
8. **Music, Audio & Storage (Ringtones & Local Backups)**

Tap **Test Lock-Screen (5s)** and lock your screen immediately to verify lock-screen Snooze/Stop popups. (On Xiaomi, Oppo, Vivo, Realme & OnePlus, also enable **"Show on Lock Screen"** and **"Display pop-up windows while running in background"** in **Open App Info → Other permissions**.)

To add the **Kairo Quick Add** widget: long-press an empty space on your Android home screen → **Widgets** → **Kairo Quick Add**.
