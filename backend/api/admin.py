from django.contrib import admin
from .models import Task, CalDAVConfig

# Register your models here.
@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'start_date', 'end_date', 'is_completed', 'caldav_uid', 'last_synced', 'created_at')
    list_filter = ('is_completed', 'start_date', 'user')
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
