from django.contrib import admin
from .models import Task

# Register your models here.
@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'start_date', 'end_date', 'is_completed', 'created_at')
    list_filter = ('is_completed', 'start_date', 'user')
    search_fields = ('title', 'description', 'user__username')
    date_hierarchy = 'start_date'
    ordering = ('-start_date',)
