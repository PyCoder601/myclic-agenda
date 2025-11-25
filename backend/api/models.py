from django.db import models
from django.contrib.auth.models import User

# Create your models here.
class CalDAVConfig(models.Model):
    """Configuration CalDAV pour chaque utilisateur"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='caldav_config')
    username = models.CharField(max_length=200)
    password = models.CharField(max_length=200)  # En production, chiffrer ce champ
    calendar_name = models.CharField(max_length=200, default='default')
    sync_enabled = models.BooleanField(default=True)
    last_sync = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"CalDAV config for {self.user.username}"


class CalendarShare(models.Model):
    """Modèle intermédiaire pour le partage de calendriers avec permissions."""
    PERMISSION_CHOICES = [
        ('read', 'Lecture seule'),
        ('write', 'Lecture/Écriture'),
    ]
    calendar_source = models.ForeignKey('CalendarSource', on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    permission = models.CharField(
        max_length=10,
        choices=PERMISSION_CHOICES,
        default='read',
        help_text="Niveau de permission pour l'utilisateur partagé"
    )

    class Meta:
        unique_together = ('calendar_source', 'user')
        verbose_name = "Partage de calendrier"
        verbose_name_plural = "Partages de calendriers"

    def __str__(self):
        return f"{self.user.username} a un accès en {self.get_permission_display()} à {self.calendar_source.name}"


class CalendarSource(models.Model):
    """Source de calendrier CalDAV pour un utilisateur"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='calendar_sources')
    name = models.CharField(max_length=200, help_text="Nom du calendrier")
    calendar_url = models.URLField(help_text="URL du calendrier")
    is_enabled = models.BooleanField(default=True, help_text="Afficher ce calendrier")
    color = models.CharField(max_length=7, default='#005f82', help_text="Couleur d'affichage")
    caldav_config = models.ForeignKey('CalDAVConfig', on_delete=models.CASCADE, related_name='calendars')
    shared_with = models.ManyToManyField(
        User,
        through='CalendarShare',
        related_name='shared_calendars',
        blank=True,
        help_text="Utilisateurs avec qui ce calendrier est partagé"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        unique_together = ['user', 'calendar_url']

    def __str__(self):
        return f"{self.name} ({self.user.username})"


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
    calendar_source = models.ForeignKey(CalendarSource, on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks', help_text="Calendrier source")

    class Meta:
        ordering = ['start_date']

    def __str__(self):
        return self.title