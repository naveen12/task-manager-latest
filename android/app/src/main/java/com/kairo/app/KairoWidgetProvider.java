package com.kairo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class KairoWidgetProvider extends AppWidgetProvider {

    public static class Small extends AppWidgetProvider {
        @Override
        public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
            updateSmallWidgets(context, appWidgetManager, appWidgetIds);
        }
    }

    public static class Medium extends AppWidgetProvider {
        @Override
        public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
            updateMediumWidgets(context, appWidgetManager, appWidgetIds);
        }
    }

    public static class Large extends AppWidgetProvider {
        @Override
        public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
            updateLargeWidgets(context, appWidgetManager, appWidgetIds);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateMediumWidgets(context, appWidgetManager, appWidgetIds);
    }

    public static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;

        // Small Widgets
        ComponentName smallComp = new ComponentName(context, Small.class);
        int[] smallIds = manager.getAppWidgetIds(smallComp);
        if (smallIds != null && smallIds.length > 0) {
            updateSmallWidgets(context, manager, smallIds);
        }

        // Medium / Legacy Widgets
        ComponentName medComp = new ComponentName(context, Medium.class);
        int[] medIds = manager.getAppWidgetIds(medComp);
        if (medIds != null && medIds.length > 0) {
            updateMediumWidgets(context, manager, medIds);
        }

        ComponentName mainComp = new ComponentName(context, KairoWidgetProvider.class);
        int[] mainIds = manager.getAppWidgetIds(mainComp);
        if (mainIds != null && mainIds.length > 0) {
            updateMediumWidgets(context, manager, mainIds);
        }

        // Large Widgets
        ComponentName largeComp = new ComponentName(context, Large.class);
        int[] largeIds = manager.getAppWidgetIds(largeComp);
        if (largeIds != null && largeIds.length > 0) {
            updateLargeWidgets(context, manager, largeIds);
        }
    }

    private static List<JSONObject> parseNext3HoursItems(Context context) {
        List<JSONObject> list = new ArrayList<>();
        AlarmStorage storage = AlarmStorage.getInstance(context);
        String json = storage.getWidgetNext3HoursJson();
        long nowMs = System.currentTimeMillis();
        long cutoff3h = nowMs + (3 * 60 * 60 * 1000L);

        try {
            JSONArray arr = new JSONArray(json);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject obj = arr.getJSONObject(i);
                long triggerAtMs = obj.optLong("triggerAtMs", 0);
                if (triggerAtMs > nowMs - 60000L && triggerAtMs <= cutoff3h) {
                    list.add(obj);
                }
            }
        } catch (Exception ignored) {}

        return list;
    }

    // 1. SMALL WIDGET (2x2)
    public static void updateSmallWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        if (appWidgetIds == null || appWidgetIds.length == 0) return;

        List<JSONObject> items3h = parseNext3HoursItems(context);
        int count3h = items3h.size();
        String subtitle = count3h > 0
                ? "Next: " + items3h.get(0).optString("timeLabel") + " · " + items3h.get(0).optString("title")
                : "No items in next 3h";

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.kairo_widget_small);

            views.setTextViewText(R.id.widget_small_count_badge, count3h + " IN 3H");
            views.setTextViewText(R.id.widget_small_number, String.valueOf(count3h));
            views.setTextViewText(R.id.widget_small_subtitle, subtitle);

            views.setOnClickPendingIntent(R.id.widget_small_root, getPendingIntent(context, 200, new Intent(context, MainActivity.class)));
            views.setOnClickPendingIntent(R.id.widget_small_btn_task, getPendingIntent(context, 201, createQuickAddIntent(context, "tasks")));
            views.setOnClickPendingIntent(R.id.widget_small_btn_alarm, getPendingIntent(context, 202, createQuickAddIntent(context, "alarms")));

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    // 2. MEDIUM WIDGET (4x2)
    public static void updateMediumWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        if (appWidgetIds == null || appWidgetIds.length == 0) return;

        AlarmStorage storage = AlarmStorage.getInstance(context);
        List<JSONObject> items3h = parseNext3HoursItems(context);
        String nextAlarm = storage.getWidgetNextAlarm();

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.kairo_widget_medium);

            views.setTextViewText(R.id.widget_medium_next_alarm, "Alarm: " + (nextAlarm != null ? nextAlarm : "None"));

            if (!items3h.isEmpty()) {
                JSONObject item1 = items3h.get(0);
                views.setTextViewText(R.id.widget_medium_time1, item1.optString("timeLabel"));
                views.setTextViewText(R.id.widget_medium_title1, item1.optString("title"));
                views.setViewVisibility(R.id.widget_medium_row1, View.VISIBLE);
            } else {
                views.setTextViewText(R.id.widget_medium_time1, "--:--");
                views.setTextViewText(R.id.widget_medium_title1, "No upcoming tasks or alarms in next 3h");
                views.setViewVisibility(R.id.widget_medium_row1, View.VISIBLE);
            }

            if (items3h.size() > 1) {
                JSONObject item2 = items3h.get(1);
                views.setTextViewText(R.id.widget_medium_time2, item2.optString("timeLabel"));
                views.setTextViewText(R.id.widget_medium_title2, item2.optString("title"));
                views.setViewVisibility(R.id.widget_medium_row2, View.VISIBLE);
            } else {
                views.setViewVisibility(R.id.widget_medium_row2, View.GONE);
            }

            views.setOnClickPendingIntent(R.id.widget_medium_root, getPendingIntent(context, 300, new Intent(context, MainActivity.class)));
            views.setOnClickPendingIntent(R.id.widget_medium_btn_task, getPendingIntent(context, 301, createQuickAddIntent(context, "tasks")));
            views.setOnClickPendingIntent(R.id.widget_medium_btn_reminder, getPendingIntent(context, 302, createQuickAddIntent(context, "reminders")));
            views.setOnClickPendingIntent(R.id.widget_medium_btn_alarm, getPendingIntent(context, 303, createQuickAddIntent(context, "alarms")));
            views.setOnClickPendingIntent(R.id.widget_medium_btn_note, getPendingIntent(context, 304, createQuickAddIntent(context, "notes")));

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    // 3. LARGE WIDGET (4x3 / 4x4)
    public static void updateLargeWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        if (appWidgetIds == null || appWidgetIds.length == 0) return;

        AlarmStorage storage = AlarmStorage.getInstance(context);
        List<JSONObject> items3h = parseNext3HoursItems(context);

        int tasksLeft = storage.getWidgetTasksLeft();
        int remindersLeft = storage.getWidgetRemindersLeft();
        String nextAlarm = storage.getWidgetNextAlarm();
        String summary = "Tasks Left: " + tasksLeft + " · Reminders: " + remindersLeft + " · Next Alarm: " + nextAlarm;

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.kairo_widget_large);

            views.setTextViewText(R.id.widget_large_badge_3h, "NEXT 3 HOURS (" + items3h.size() + ")");
            views.setTextViewText(R.id.widget_large_summary, summary);

            int[] timeIds = {R.id.widget_large_time1, R.id.widget_large_time2, R.id.widget_large_time3, R.id.widget_large_time4};
            int[] typeIds = {R.id.widget_large_type1, R.id.widget_large_type2, R.id.widget_large_type3, R.id.widget_large_type4};
            int[] titleIds = {R.id.widget_large_title1, R.id.widget_large_title2, R.id.widget_large_title3, R.id.widget_large_title4};
            int[] rowIds = {R.id.widget_large_row1, R.id.widget_large_row2, R.id.widget_large_row3, R.id.widget_large_row4};

            if (items3h.isEmpty()) {
                views.setTextViewText(R.id.widget_large_time1, "--:--");
                views.setTextViewText(R.id.widget_large_type1, "CLEAR");
                views.setTextViewText(R.id.widget_large_title1, "No upcoming tasks or alarms in next 3 hours");
                views.setViewVisibility(R.id.widget_large_row1, View.VISIBLE);
                views.setViewVisibility(R.id.widget_large_row2, View.GONE);
                views.setViewVisibility(R.id.widget_large_row3, View.GONE);
                views.setViewVisibility(R.id.widget_large_row4, View.GONE);
            } else {
                for (int i = 0; i < 4; i++) {
                    if (i < items3h.size()) {
                        JSONObject item = items3h.get(i);
                        views.setTextViewText(timeIds[i], item.optString("timeLabel"));
                        views.setTextViewText(typeIds[i], item.optString("type", "item").toUpperCase());
                        views.setTextViewText(titleIds[i], item.optString("title"));
                        views.setViewVisibility(rowIds[i], View.VISIBLE);
                    } else {
                        views.setViewVisibility(rowIds[i], View.GONE);
                    }
                }
            }

            views.setOnClickPendingIntent(R.id.widget_large_root, getPendingIntent(context, 400, new Intent(context, MainActivity.class)));
            views.setOnClickPendingIntent(R.id.widget_large_btn_task, getPendingIntent(context, 401, createQuickAddIntent(context, "tasks")));
            views.setOnClickPendingIntent(R.id.widget_large_btn_reminder, getPendingIntent(context, 402, createQuickAddIntent(context, "reminders")));
            views.setOnClickPendingIntent(R.id.widget_large_btn_alarm, getPendingIntent(context, 403, createQuickAddIntent(context, "alarms")));
            views.setOnClickPendingIntent(R.id.widget_large_btn_note, getPendingIntent(context, 404, createQuickAddIntent(context, "notes")));

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    private static Intent createQuickAddIntent(Context context, String target) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("quickAdd", target);
        return intent;
    }

    private static PendingIntent getPendingIntent(Context context, int requestCode, Intent intent) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, requestCode, intent, flags);
    }
}
