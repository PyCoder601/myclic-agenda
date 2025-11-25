from django.contrib import admin
from .models import Task, CalDAVConfig, CalendarSource, CalendarShare

# Register your models here.
@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'calendar_source', 'start_date', 'end_date', 'is_completed', 'caldav_uid', 'last_synced', 'created_at')
    list_filter = ('is_completed', 'start_date', 'user', 'calendar_source')
    search_fields = ('title', 'description', 'user__username', 'caldav_uid')
    date_hierarchy = 'start_date'
    ordering = ('-start_date',)
    readonly_fields = ('caldav_uid', 'caldav_etag', 'last_synced', 'created_at', 'updated_at')


@admin.register(CalDAVConfig)
class CalDAVConfigAdmin(admin.ModelAdmin):
    list_display = ('user', 'caldav_url', 'username', 'sync_enabled', 'last_sync', 'created_at')
    list_filter = ('sync_enabled', 'last_sync')
    search_fields = ('user__username', 'caldav_url', 'username')
    readonly_fields = ('last_sync', 'created_at', 'updated_at')


@admin.register(CalendarSource)
class CalendarSourceAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'is_enabled', 'color', 'caldav_config', 'created_at')
    list_filter = ('is_enabled', 'user', 'caldav_config')
    search_fields = ('name', 'user__username', 'calendar_url')
    readonly_fields = ('created_at', 'updated_at')
    list_editable = ('is_enabled', 'color')

@admin.register(CalendarShare)
class CalendarShareAdmin(admin.ModelAdmin):
    list_display = ('calendar_source', 'user', 'permission')
    list_filter = ('permission', 'user', 'calendar_source')
    search_fields = ('calendar_source__name', 'user__username')
    list_editable = ('permission',)
    autocomplete_fields = ('calendar_source', 'user')

