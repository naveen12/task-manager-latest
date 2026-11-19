package __PACKAGE__;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.util.Locale;

public class KairoQuickWidgetProvider extends AppWidgetProvider {
  private static final String PREFS_NAME = "kairo_native_prefs";

  @Override
  public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
    if (appWidgetIds == null) return;
    for (int appWidgetId : appWidgetIds) {
      updateSingleWidget(context, appWidgetManager, appWidgetId);
    }
  }

  public static void updateAllWidgets(Context context) {
    try {
      AppWidgetManager manager = AppWidgetManager.getInstance(context);
      if (manager == null) return;
      ComponentName provider = new ComponentName(context, KairoQuickWidgetProvider.class);
      int[] ids = manager.getAppWidgetIds(provider);
      if (ids == null || ids.length == 0) return;
      for (int id : ids) {
        updateSingleWidget(context, manager, id);
      }
    } catch (Exception ignored) {}
  }

  private static void updateSingleWidget(
    Context context,
    AppWidgetManager manager,
    int appWidgetId
  ) {
    SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    int tasksLeft = prefs.getInt("widget_tasks_left", 0);
    int remindersLeft = prefs.getInt("widget_reminders_left", 0);
    String nextAlarm = prefs.getString("widget_next_alarm", "Off");
    String nextTask = prefs.getString("widget_next_task", "All caught up today");

    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.kairo_quick_add_widget);

    String alarmBadge = (nextAlarm != null && !nextAlarm.trim().isEmpty() && !"Off".equalsIgnoreCase(nextAlarm))
      ? "Alarm: " + nextAlarm
      : "Alarm: Off";
    views.setTextViewText(R.id.widget_next_alarm, alarmBadge);

    String taskWord = tasksLeft == 1 ? "task" : "tasks";
    String remWord = remindersLeft == 1 ? "reminder" : "reminders";
    views.setTextViewText(
      R.id.widget_summary,
      tasksLeft + " " + taskWord + " · " + remindersLeft + " " + remWord + " today"
    );
    views.setTextViewText(
      R.id.widget_next_task,
      (nextTask != null && !nextTask.trim().isEmpty()) ? nextTask : "All caught up today"
    );

    views.setOnClickPendingIntent(
      R.id.widget_header,
      buildLaunchIntent(context, "dashboard", 7101)
    );
    views.setOnClickPendingIntent(
      R.id.btn_quick_task,
      buildLaunchIntent(context, "tasks", 7102)
    );
    views.setOnClickPendingIntent(
      R.id.btn_quick_reminder,
      buildLaunchIntent(context, "reminders", 7103)
    );
    views.setOnClickPendingIntent(
      R.id.btn_quick_alarm,
      buildLaunchIntent(context, "alarms", 7104)
    );
    views.setOnClickPendingIntent(
      R.id.btn_quick_note,
      buildLaunchIntent(context, "notes", 7105)
    );

    manager.updateAppWidget(appWidgetId, views);
  }

  private static PendingIntent buildLaunchIntent(Context context, String target, int reqCode) {
    Intent intent = new Intent(context, MainActivity.class);
    intent.setAction("com.kairo.app.ACTION_QUICK_ADD_" + target.toUpperCase(Locale.US));
    intent.putExtra("quick_add_target", target);
    intent.addFlags(
      Intent.FLAG_ACTIVITY_NEW_TASK |
      Intent.FLAG_ACTIVITY_CLEAR_TOP |
      Intent.FLAG_ACTIVITY_SINGLE_TOP
    );
    return PendingIntent.getActivity(
      context,
      reqCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
    );
  }
}
