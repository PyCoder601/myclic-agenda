# Generated manually on 2025-12-11

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_remove_calendarsource_caldav_config_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='BaikalCalendarPreference',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('calendar_uri', models.CharField(help_text='URI du calendrier Baikal', max_length=500)),
                ('is_enabled', models.BooleanField(default=True, help_text='Afficher ce calendrier')),
                ('color', models.CharField(default='#005f82', help_text="Couleur d'affichage", max_length=7)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='baikal_calendar_preferences', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Préférence de calendrier Baikal',
                'verbose_name_plural': 'Préférences de calendriers Baikal',
                'ordering': ['calendar_uri'],
                'unique_together': {('user', 'calendar_uri')},
            },
        ),
    ]
