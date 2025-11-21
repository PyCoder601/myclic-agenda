"""
Service pour gérer la synchronisation avec le serveur CalDAV (Baikal)
"""
import caldav
from caldav.elements import dav
from icalendar import Calendar, Event
from datetime import datetime
import pytz
from django.utils import timezone
from .models import Task, CalDAVConfig


class CalDAVService:
    """Service de synchronisation CalDAV"""

    def __init__(self, caldav_config):
        """
        Initialiser le service avec la configuration CalDAV

        Args:
            caldav_config: Instance de CalDAVConfig
        """
        self.config = caldav_config
        self.client = None
        self.calendar = None

    def connect(self):
        """Établir la connexion avec le serveur CalDAV"""
        try:
            self.client = caldav.DAVClient(
                url=self.config.caldav_url,
                username=self.config.username,
                password=self.config.password
            )
            principal = self.client.principal()
            calendars = principal.calendars()

            # Trouver ou créer le calendrier
            for cal in calendars:
                if cal.name == self.config.calendar_name:
                    self.calendar = cal
                    break

            if not self.calendar and calendars:
                # Utiliser le premier calendrier disponible
                self.calendar = calendars[0]
                self.config.calendar_name = self.calendar.name
                self.config.save()

            return True
        except Exception as e:
            print(f"Erreur de connexion CalDAV: {e}")
            return False

    def task_to_ical(self, task):
        """
        Convertir une tâche Django en événement iCalendar

        Args:
            task: Instance de Task

        Returns:
            str: Événement au format iCalendar
        """
        cal = Calendar()
        cal.add('prodid', '-//Agenda App//CalDAV Sync//FR')
        cal.add('version', '2.0')

        event = Event()

        # UID unique
        if task.caldav_uid:
            event.add('uid', task.caldav_uid)
        else:
            event.add('uid', f'task-{task.id}-{task.user.id}@agenda-app')

        event.add('summary', task.title)
        event.add('description', task.description)
        event.add('dtstart', task.start_date)
        event.add('dtend', task.end_date)
        event.add('dtstamp', timezone.now())

        if task.is_completed:
            event.add('status', 'COMPLETED')
        else:
            event.add('status', 'CONFIRMED')

        cal.add_component(event)
        return cal.to_ical().decode('utf-8')

    def ical_to_task(self, ical_str, user):
        """
        Convertir un événement iCalendar en tâche Django

        Args:
            ical_str: Chaîne iCalendar
            user: Utilisateur Django

        Returns:
            dict: Données de la tâche
        """
        cal = Calendar.from_ical(ical_str)

        for component in cal.walk():
            if component.name == "VEVENT":
                uid = str(component.get('uid'))
                title = str(component.get('summary', 'Sans titre'))
                description = str(component.get('description', ''))

                start_date = component.get('dtstart').dt
                end_date = component.get('dtend').dt

                # Convertir en datetime si c'est une date
                if not isinstance(start_date, datetime):
                    start_date = datetime.combine(start_date, datetime.min.time())
                    start_date = pytz.UTC.localize(start_date)

                if not isinstance(end_date, datetime):
                    end_date = datetime.combine(end_date, datetime.min.time())
                    end_date = pytz.UTC.localize(end_date)

                # Assurer que les dates ont un timezone
                if timezone.is_naive(start_date):
                    start_date = timezone.make_aware(start_date)
                if timezone.is_naive(end_date):
                    end_date = timezone.make_aware(end_date)

                status = component.get('status', 'CONFIRMED')
                is_completed = status == 'COMPLETED'

                return {
                    'caldav_uid': uid,
                    'title': title,
                    'description': description,
                    'start_date': start_date,
                    'end_date': end_date,
                    'is_completed': is_completed,
                    'user': user
                }

        return None

    def push_task(self, task):
        """
        Envoyer une tâche vers le serveur CalDAV

        Args:
            task: Instance de Task

        Returns:
            bool: Succès de l'opération
        """
        if not self.calendar:
            if not self.connect():
                return False

        try:
            ical_data = self.task_to_ical(task)

            if task.caldav_uid and task.caldav_etag:
                # Mise à jour d'un événement existant
                events = self.calendar.events()
                for event in events:
                    try:
                        # Utiliser icalendar au lieu de vobject
                        event_cal = Calendar.from_ical(event.data)
                        for component in event_cal.walk():
                            if component.name == "VEVENT":
                                event_uid = str(component.get('uid'))
                                if event_uid == task.caldav_uid:
                                    event.data = ical_data
                                    event.save()
                                    if hasattr(event, 'props'):
                                        task.caldav_etag = event.props.get(dav.GetEtag())
                                    task.last_synced = timezone.now()
                                    task.save(update_fields=['caldav_etag', 'last_synced'])
                                    return True
                    except Exception as e:
                        print(f"Erreur lors de la lecture de l'événement: {e}")
                        continue

            # Création d'un nouvel événement
            event = self.calendar.save_event(ical_data)

            # Récupérer l'UID et l'ETag
            cal = Calendar.from_ical(ical_data)
            for component in cal.walk():
                if component.name == "VEVENT":
                    task.caldav_uid = str(component.get('uid'))
                    break

            if hasattr(event, 'props'):
                task.caldav_etag = event.props.get(dav.GetEtag())

            task.last_synced = timezone.now()
            task.save(update_fields=['caldav_uid', 'caldav_etag', 'last_synced'])

            return True

        except Exception as e:
            print(f"Erreur lors de l'envoi de la tâche: {e}")
            return False

    def pull_tasks(self, user):
        """
        Récupérer les tâches depuis le serveur CalDAV

        Args:
            user: Utilisateur Django

        Returns:
            list: Liste des tâches créées/mises à jour
        """
        if not self.calendar:
            if not self.connect():
                return []

        try:
            events = self.calendar.events()
            updated_tasks = []

            for event in events:
                ical_str = event.data
                task_data = self.ical_to_task(ical_str, user)

                if task_data:
                    # Vérifier si la tâche existe déjà
                    existing_task = Task.objects.filter(
                        caldav_uid=task_data['caldav_uid']
                    ).first()

                    if existing_task:
                        # Mettre à jour la tâche existante
                        for key, value in task_data.items():
                            if key != 'user':
                                setattr(existing_task, key, value)

                        if hasattr(event, 'props'):
                            existing_task.caldav_etag = event.props.get(dav.GetEtag())
                        existing_task.last_synced = timezone.now()
                        existing_task.save()
                        updated_tasks.append(existing_task)
                    else:
                        # Créer une nouvelle tâche
                        task = Task.objects.create(**task_data)
                        if hasattr(event, 'props'):
                            task.caldav_etag = event.props.get(dav.GetEtag())
                        task.last_synced = timezone.now()
                        task.save()
                        updated_tasks.append(task)

            # Mettre à jour la date de dernière synchronisation
            self.config.last_sync = timezone.now()
            self.config.save(update_fields=['last_sync'])

            return updated_tasks

        except Exception as e:
            print(f"Erreur lors de la récupération des tâches: {e}")
            return []

    def sync_all(self, user):
        """
        Synchronisation bidirectionnelle complète

        Args:
            user: Utilisateur Django

        Returns:
            dict: Statistiques de synchronisation
        """
        stats = {
            'pushed': 0,
            'pulled': 0,
            'errors': []
        }

        if not self.config.sync_enabled:
            stats['errors'].append("Synchronisation désactivée")
            return stats

        # Envoyer les tâches locales vers CalDAV
        local_tasks = Task.objects.filter(user=user)
        for task in local_tasks:
            if self.push_task(task):
                stats['pushed'] += 1
            else:
                stats['errors'].append(f"Erreur push: {task.title}")

        # Récupérer les tâches depuis CalDAV
        pulled_tasks = self.pull_tasks(user)
        stats['pulled'] = len(pulled_tasks)

        return stats

    def delete_task(self, task):
        """
        Supprimer une tâche du serveur CalDAV

        Args:
            task: Instance de Task

        Returns:
            bool: Succès de l'opération
        """
        if not task.caldav_uid:
            return True  # Pas sur CalDAV, rien à supprimer

        if not self.calendar:
            if not self.connect():
                return False

        try:
            events = self.calendar.events()
            for event in events:
                try:
                    # Utiliser icalendar au lieu de vobject
                    event_cal = Calendar.from_ical(event.data)
                    for component in event_cal.walk():
                        if component.name == "VEVENT":
                            event_uid = str(component.get('uid'))
                            if event_uid == task.caldav_uid:
                                event.delete()
                                print(f"Tâche supprimée du serveur CalDAV: {task.caldav_uid}")
                                return True
                except Exception as e:
                    print(f"Erreur lors de la lecture de l'événement pour suppression: {e}")
                    continue

            print(f"Tâche non trouvée sur le serveur CalDAV: {task.caldav_uid}")
            return True  # Considéré comme succès si non trouvé
        except Exception as e:
            print(f"Erreur lors de la suppression: {e}")
            return False




