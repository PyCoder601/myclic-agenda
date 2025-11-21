from django.db import models
from django.contrib.auth.models import User

# Create your models here.
class CalDAVConfig(models.Model):
    """Configuration CalDAV pour chaque utilisateur"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='caldav_config')
    caldav_url = models.URLField(help_text="URL du serveur CalDAV (ex: https://example.com/baikal/dav.php)")
    username = models.CharField(max_length=200)
    password = models.CharField(max_length=200)  # En production, chiffrer ce champ
    calendar_name = models.CharField(max_length=200, default='default')
    sync_enabled = models.BooleanField(default=True)
    last_sync = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"CalDAV config for {self.user.username}"


class Task(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tasks')
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    is_completed = models.BooleanField(default=False)
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Champs pour la synchronisation CalDAV
    caldav_uid = models.CharField(max_length=500, blank=True, null=True, unique=True, help_text="UID de l'événement CalDAV")
    caldav_etag = models.CharField(max_length=200, blank=True, null=True, help_text="ETag de l'événement CalDAV")
    last_synced = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['start_date']

    def __str__(self):
        return self.title
