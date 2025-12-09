"""
Service pour gérer la synchronisation avec le serveur CalDAV (Baikal)
"""
import os

import caldav
from caldav.elements import dav
from icalendar import Calendar, Event
from datetime import datetime
import pytz
from django.utils import timezone
from .models import Task

from dotenv import load_dotenv
load_dotenv()


class CalDAVService:
    """Service de synchronisation CalDAV"""

    def __init__(self, caldav_config):
        """
        Initialiser le service avec la configuration CalDAV et l'URL de base du serveur.

        Args:
            caldav_config: Instance de CalDAVConfig (contient username/password)
        """

        self.config = caldav_config
        self.base_caldav_url = os.getenv("BAIKAL_SERVER_URL")
        self.client = None
        self.calendar = None

    @staticmethod
    def get_caldav_client(username, password):
        """
        Créer un client CalDAV simple

        Args:
            username: Nom d'utilisateur
            password: Mot de passe Baikal

        Returns:
            tuple: (client, principal) ou (None, None) en cas d'erreur
        """
        try:
            client = caldav.DAVClient(
                url=os.getenv("BAIKAL_SERVER_URL"),
                username=username,
                password=password
            )
            principal = client.principal()
            return client, principal
        except Exception as e:
            print(f"❌ Erreur connexion CalDAV: {e}")
            import traceback
            traceback.print_exc()
            return None, None

    @staticmethod
    def get_calendar_by_url(principal, calendar_url):
        """
        Récupérer un calendrier par son URL

        Args:
            principal: Principal CalDAV
            calendar_url: URL du calendrier ou URI

        Returns:
            Calendar ou None
        """
        try:
            calendars = principal.calendars()
            for cal in calendars:
                cal_url = str(cal.url.canonical())  # Convertir URL en string
                if calendar_url in cal_url or cal_url.endswith(calendar_url):
                    return cal
            return None
        except Exception as e:
            print(f"❌ Erreur récupération calendrier: {e}")
            return None

    @staticmethod
    def create_ical_event(uid, title, description, start_date, end_date, is_completed=False):
        """
        Créer un événement iCalendar

        Args:
            uid: UID unique de l'événement
            title: Titre
            description: Description
            start_date: Date de début (datetime)
            end_date: Date de fin (datetime)
            is_completed: Statut complété

        Returns:
            str: Chaîne iCalendar
        """
        cal = Calendar()
        cal.add('prodid', '-//Agenda App//Baikal Direct//FR')
        cal.add('version', '2.0')

        event = Event()
        event.add('uid', uid)
        event.add('summary', title)
        if description:
            event.add('description', description)
        event.add('dtstart', start_date)
        event.add('dtend', end_date)
        event.add('status', 'COMPLETED' if is_completed else 'CONFIRMED')
        event.add('dtstamp', datetime.now(pytz.UTC))

        cal.add_component(event)
        return cal.to_ical().decode('utf-8')

    @staticmethod
    def save_event_to_calendar(calendar, ical_string):
        """
        Sauvegarder un événement sur un calendrier

        Args:
            calendar: Objet Calendar CalDAV
            ical_string: Chaîne iCalendar

        Returns:
            bool: Succès
        """
        try:
            calendar.save_event(ical_string)
            return True
        except Exception as e:
            print(f"❌ Erreur sauvegarde événement: {e}")
            import traceback
            traceback.print_exc()
            return False

    @staticmethod
    def find_event_by_uri(calendar, event_uri):
        """
        Trouver un événement par son URI

        Args:
            calendar: Objet Calendar CalDAV
            event_uri: URI de l'événement

        Returns:
            Event CalDAV ou None
        """
        try:
            events = calendar.events()
            for event in events:
                event_url = str(event.url.canonical())  # Convertir URL en string
                if event_uri in event_url:
                    return event
            return None
        except Exception as e:
            print(f"❌ Erreur recherche événement: {e}")
            import traceback
            traceback.print_exc()
            return None

    @staticmethod
    def update_event(event, title=None, description=None, start_date=None, end_date=None, is_completed=None):
        """
        Mettre à jour un événement existant

        Args:
            event: Objet Event CalDAV
            title: Nouveau titre (optionnel)
            description: Nouvelle description (optionnel)
            start_date: Nouvelle date de début (optionnel)
            end_date: Nouvelle date de fin (optionnel)
            is_completed: Nouveau statut (optionnel)

        Returns:
            bool: Succès
        """
        try:
            ical_data = event.data
            cal = Calendar.from_ical(ical_data)

            for component in cal.walk():
                if component.name == 'VEVENT':
                    # Mettre à jour les propriétés en supprimant d'abord l'ancienne valeur
                    if title is not None:
                        if 'summary' in component:
                            del component['summary']
                        component.add('summary', title)

                    if description is not None:
                        if 'description' in component:
                            del component['description']
                        component.add('description', description)

                    if start_date is not None:
                        if 'dtstart' in component:
                            del component['dtstart']
                        component.add('dtstart', start_date)

                    if end_date is not None:
                        if 'dtend' in component:
                            del component['dtend']
                        component.add('dtend', end_date)

                    if is_completed is not None:
                        status = 'COMPLETED' if is_completed else 'CONFIRMED'
                        if 'status' in component:
                            del component['status']
                        component.add('status', status)

                    # Mettre à jour le timestamp
                    if 'dtstamp' in component:
                        del component['dtstamp']
                    component.add('dtstamp', datetime.now(pytz.UTC))

            ical_string = cal.to_ical()
            event.data = ical_string
            event.save()
            return True
        except Exception as e:
            print(f"❌ Erreur mise à jour événement: {e}")
            import traceback
            traceback.print_exc()
            return False

    @staticmethod
    def delete_event(event):
        """
        Supprimer un événement

        Args:
            event: Objet Event CalDAV

        Returns:
            bool: Succès
        """
        try:
            event.delete()
            return True
        except Exception as e:
            print(f"❌ Erreur suppression événement: {e}")
            return False

    @staticmethod
    def update_calendar(calendar, displayname=None, description=None, color=None):
        """
        Mettre à jour les propriétés d'un calendrier via CalDAV.

        Args:
            calendar: Objet caldav.Calendar
            displayname (str, optional): Nouveau nom d'affichage.
            description (str, optional): Nouvelle description.
            color (str, optional): Nouvelle couleur (#RRGGBB).

        Returns:
            bool: True si succès, False sinon.
        """
        try:
            properties_to_set = []
            if displayname is not None:
                properties_to_set.append(dav.DisplayName.from_string(displayname))
            if description is not None:
                from caldav.elements import cdav
                properties_to_set.append(cdav.CalendarDescription.from_string(description))
            if color is not None:
                from caldav.elements import apple
                properties_to_set.append(apple.CalendarColor.from_string(color))

            if properties_to_set:
                calendar.set_properties(properties_to_set)

            return True
        except Exception as e:
            print(f"❌ Erreur mise à jour calendrier CalDAV: {e}")
            import traceback
            traceback.print_exc()
            return False

    def fetch_tasks_from_caldav(self, user):
        """
        Récupérer les tâches depuis CalDAV et les synchroniser

        Args:
            user: Utilisateur Django

        Returns:
            list: Liste des tâches créées/mises à jour
        """
        # Méthode non implémentée pour le moment
        return []

    def sync_all(self, user):
        """
        Synchronisation bidirectionnelle complète avec tous les calendriers activés

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

        try:
            # Importer ici pour éviter les dépendances circulaires
            from .models import CalendarSource

            # Se connecter au serveur CalDAV
            client = caldav.DAVClient(
                url=os.getenv("BAIKAL_SERVER_URL"),
                username=self.config.username,
                password=self.config.baikal_password
            )
            principal = client.principal()

            # Récupérer tous les calendriers activés pour cet utilisateur
            calendar_sources = CalendarSource.objects.filter(
                user=user,
                is_enabled=True
            )

            # Synchroniser chaque calendrier activé
            for cal_source in calendar_sources:
                try:
                    # Trouver le calendrier CalDAV correspondant
                    calendars = principal.calendars()
                    target_calendar = None

                    for cal in calendars:
                        cal_url = str(cal.url.canonical())  # Convertir URL en string
                        print(f"Calendrier trouvé: {cal_url}")
                        if cal_url == cal_source.calendar_url:
                            target_calendar = cal
                            break

                    if not target_calendar:
                        continue

                    # Récupérer les événements de ce calendrier
                    events = target_calendar.events()

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
                                existing_task.calendar_source = cal_source
                                existing_task.save()
                                stats['pulled'] += 1
                            else:
                                # Créer une nouvelle tâche
                                task = Task.objects.create(**task_data)
                                if hasattr(event, 'props'):
                                    task.caldav_etag = event.props.get(dav.GetEtag())
                                task.last_synced = timezone.now()
                                task.calendar_source = cal_source
                                task.save()
                                stats['pulled'] += 1

                except Exception as e:
                    stats['errors'].append(f"Erreur calendrier {cal_source.name}: {str(e)}")
                    print(f"Erreur lors de la synchronisation du calendrier {cal_source.name}: {e}")


        except Exception as e:
            stats['errors'].append(f"Erreur générale: {str(e)}")
            print(f"Erreur lors de la synchronisation: {e}")

        return stats

    def delete_task(self, task):
        """
        Supprimer une tâche du serveur CalDAV

        Args:
            task: Instance de Task ou objet avec caldav_uid

        Returns:
            bool: Succès de l'opération
        """
        try:
            if not hasattr(task, 'caldav_uid') or not task.caldav_uid:
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
                print(f"Erreur lors de la récupération des événements: {e}")
                return False
        except Exception as e:
            print(f"Erreur générale lors de la suppression: {e}")
            return False




