"""
Service pour synchroniser directement avec la base de données MySQL de Baikal
Plus rapide et efficace que CalDAV pour la synchronisation
"""
import mysql.connector
from mysql.connector import Error
from icalendar import Calendar
from datetime import datetime
import pytz
from django.utils import timezone
from django.conf import settings
import os
from .models import Task, CalendarSource, User


class BaikalDBService:
    """Service de synchronisation directe avec la base MySQL de Baikal"""
    
    def __init__(self):
        """Initialiser la connexion à la base Baikal"""
        self.connection = None
        self.baikal_host = os.getenv('BAIKAL_DB_HOST')
        self.baikal_port = int(os.getenv('BAIKAL_DB_PORT', '3306'))
        self.baikal_user = os.getenv('BAIKAL_DB_USER')
        self.baikal_password = os.getenv('BAIKAL_DB_PASSWORD')
        self.baikal_database = os.getenv('BAIKAL_DB_NAME', 'baikal')
    
    def connect(self):
        """Établir la connexion à la base MySQL de Baikal"""
        try:
            self.connection = mysql.connector.connect(
                host=self.baikal_host,
                port=self.baikal_port,
                user=self.baikal_user,
                password=self.baikal_password,
                database=self.baikal_database
            )
            return True
        except Error as e:
            print(f"Erreur de connexion à la base Baikal: {e}")
            return False
    
    def close(self):
        """Fermer la connexion"""
        if self.connection and self.connection.is_connected():
            self.connection.close()
    
    def ical_to_task_data(self, ical_str, user):
        """
        Convertir un événement iCalendar en données de tâche
        
        Args:
            ical_str: Chaîne iCalendar
            user: Utilisateur Django
            
        Returns:
            dict: Données de la tâche ou None
        """
        try:
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
        except Exception as e:
            print(f"Erreur lors de la conversion iCal: {e}")
            return None
        
        return None
    

    def quick_sync_user_calendars(self, user):
        """
        Synchronisation ULTRA-RAPIDE : vérifie d'abord les etags pour ne charger
        que les événements qui ont réellement changé

        Args:
            user: Instance User Django

        Returns:
            dict: Statistiques de synchronisation
        """
        stats = {
            'calendars_synced': 0,
            'events_created': 0,
            'events_updated': 0,
            'events_unchanged': 0,
            'errors': []
        }

        if not self.connect():
            stats['errors'].append("Impossible de se connecter à la base Baikal")
            return stats

        try:
            cursor = self.connection.cursor(dictionary=True)

            # Étape 1 : Récupérer SEULEMENT les UIDs et etags (très rapide)
            query_check = """
                SELECT 
                    ci.uri as calendar_uri,
                    ci.displayname as calendar_name,
                    ci.calendarcolor as calendar_color,
                    co.uid,
                    co.etag
                FROM calendarinstances ci
                INNER JOIN calendarobjects co ON ci.calendarid = co.calendarid
                WHERE ci.principaluri LIKE %s
                    AND co.componenttype = 'VEVENT'
            """

            cursor.execute(query_check, (f'%{user.username}%',))
            check_results = cursor.fetchall()

            # Construire un dictionnaire des UIDs à synchroniser
            uids_to_sync = []
            calendars_map = {}

            for row in check_results:
                uid = row['uid']
                etag = row['etag']
                calendar_uri = row['calendar_uri']

                # Décoder si nécessaire
                if isinstance(uid, bytes):
                    uid = uid.decode('utf-8')
                if isinstance(etag, bytes):
                    etag = etag.decode('utf-8')
                if isinstance(calendar_uri, bytes):
                    calendar_uri = calendar_uri.decode('utf-8')

                # Vérifier si l'événement existe et si l'etag a changé
                existing_task = Task.objects.filter(caldav_uid=uid).first()

                if not existing_task or existing_task.caldav_etag != etag:
                    # Événement nouveau ou modifié
                    uids_to_sync.append(uid)

                    # Préparer les infos du calendrier
                    if calendar_uri not in calendars_map:
                        calendar_name = row['calendar_name'] or calendar_uri
                        calendar_color = row['calendar_color']

                        if isinstance(calendar_color, bytes):
                            calendar_color = calendar_color.decode('utf-8')
                        if not calendar_color or not calendar_color.startswith('#'):
                            calendar_color = '#005f82'

                        calendars_map[calendar_uri] = {
                            'name': calendar_name,
                            'color': calendar_color
                        }
                else:
                    stats['events_unchanged'] += 1

            # Étape 2 : Charger SEULEMENT les événements qui ont changé
            if uids_to_sync:
                placeholders = ','.join(['%s'] * len(uids_to_sync))
                query_events = f"""
                    SELECT 
                        ci.uri as calendar_uri,
                        ci.displayname as calendar_name,
                        ci.calendarcolor as calendar_color,
                        co.calendardata,
                        co.uri as event_uri,
                        co.etag,
                        co.uid
                    FROM calendarinstances ci
                    INNER JOIN calendarobjects co ON ci.calendarid = co.calendarid
                    WHERE ci.principaluri LIKE %s
                        AND co.uid IN ({placeholders})
                        AND co.componenttype = 'VEVENT'
                """

                cursor.execute(query_events, (f'%{user.username}%', *uids_to_sync))
                events = cursor.fetchall()

                # Synchroniser les événements
                for row in events:
                    try:
                        calendar_uri = row['calendar_uri']

                        if isinstance(calendar_uri, bytes):
                            calendar_uri = calendar_uri.decode('utf-8')

                        # Créer/récupérer le CalendarSource
                        calendar_url = f"{settings.BAIKAL_SERVER_URL.rstrip('/')}/calendars/{user.username}/{calendar_uri}/"

                        calendar_source, created = CalendarSource.objects.get_or_create(
                            user=user,
                            calendar_url=calendar_url,
                            defaults={
                                'name': calendars_map[calendar_uri]['name'],
                                'is_enabled': True,
                                'color': calendars_map[calendar_uri]['color']
                            }
                        )

                        if created:
                            stats['calendars_synced'] += 1

                        # Traiter l'événement
                        ical_data = row['calendardata']
                        event_etag = row['etag']
                        event_uid = row['uid']

                        if isinstance(ical_data, bytes):
                            ical_data = ical_data.decode('utf-8')
                        if isinstance(event_etag, bytes):
                            event_etag = event_etag.decode('utf-8')
                        if isinstance(event_uid, bytes):
                            event_uid = event_uid.decode('utf-8')

                        task_data = self.ical_to_task_data(ical_data, user)

                        if task_data:
                            caldav_uid = task_data['caldav_uid']
                            existing_task = Task.objects.filter(caldav_uid=caldav_uid).first()

                            if existing_task:
                                # Mise à jour
                                for key, value in task_data.items():
                                    if key != 'user':
                                        setattr(existing_task, key, value)

                                existing_task.calendar_source = calendar_source
                                existing_task.caldav_etag = event_etag
                                existing_task.last_synced = timezone.now()
                                existing_task.save()
                                stats['events_updated'] += 1
                            else:
                                # Création
                                Task.objects.create(
                                    **task_data,
                                    calendar_source=calendar_source,
                                    caldav_etag=event_etag,
                                    last_synced=timezone.now()
                                )
                                stats['events_created'] += 1

                    except Exception as e:
                        error_msg = f"Erreur événement {row.get('event_uri', 'unknown')}: {str(e)}"
                        stats['errors'].append(error_msg)
                        print(error_msg)
                        continue

            cursor.close()

        except Error as e:
            error_msg = f"Erreur MySQL: {str(e)}"
            stats['errors'].append(error_msg)
            print(error_msg)

        finally:
            self.close()

        return stats

    def sync_user_calendars(self, user):
        """
        Synchroniser les calendriers d'un utilisateur depuis la base Baikal
        Utilise une seule requête optimisée avec JOIN pour récupérer tous les événements

        Args:
            user: Instance User Django
            
        Returns:
            dict: Statistiques de synchronisation
        """
        stats = {
            'calendars_synced': 0,
            'events_created': 0,
            'events_updated': 0,
            'errors': []
        }
        
        if not self.connect():
            stats['errors'].append("Impossible de se connecter à la base Baikal")
            return stats
        
        try:
            cursor = self.connection.cursor(dictionary=True)
            
            # Requête optimisée : récupérer TOUS les événements de l'utilisateur en une seule requête
            # Utilise calendarinstances pour les calendriers utilisateur + JOIN avec calendarobjects
            query_all_events = """
                SELECT 
                    ci.id as instance_id,
                    ci.uri as calendar_uri,
                    ci.displayname as calendar_name,
                    ci.calendarcolor as calendar_color,
                    ci.principaluri,
                    co.id as event_id,
                    co.calendardata,
                    co.uri as event_uri,
                    co.etag,
                    co.uid,
                    co.lastmodified
                FROM calendarinstances ci
                INNER JOIN calendarobjects co ON ci.calendarid = co.calendarid
                WHERE ci.principaluri LIKE %s
                    AND co.componenttype = 'VEVENT'
                ORDER BY ci.id, co.lastmodified DESC
            """

            cursor.execute(query_all_events, (f'%{user.username}%',))
            all_events = cursor.fetchall()

            # Grouper les événements par calendrier
            calendars_map = {}
            current_calendar_id = None
            calendar_source = None

            for row in all_events:
                calendar_uri = row['calendar_uri']

                # Si on change de calendrier, créer/récupérer le CalendarSource
                if calendar_uri not in calendars_map:
                    calendar_name = row['calendar_name'] or calendar_uri
                    calendar_color = row['calendar_color']

                    # Décoder la couleur si nécessaire
                    if isinstance(calendar_color, bytes):
                        calendar_color = calendar_color.decode('utf-8')
                    if not calendar_color or not calendar_color.startswith('#'):
                        calendar_color = '#005f82'

                    # Construire l'URL du calendrier
                    calendar_url = f"{settings.BAIKAL_SERVER_URL.rstrip('/')}/calendars/{user.username}/{calendar_uri}/"

                    # Créer ou récupérer le CalendarSource
                    calendar_source, created = CalendarSource.objects.get_or_create(
                        user=user,
                        calendar_url=calendar_url,
                        defaults={
                            'name': calendar_name,
                            'is_enabled': True,
                            'color': calendar_color
                        }
                    )

                    calendars_map[calendar_uri] = calendar_source

                    if created:
                        stats['calendars_synced'] += 1
                else:
                    calendar_source = calendars_map[calendar_uri]

                # Synchroniser l'événement
                try:
                    ical_data = row['calendardata']
                    event_etag = row['etag']
                    event_uid = row['uid']

                    # Décoder si nécessaire
                    if isinstance(ical_data, bytes):
                        ical_data = ical_data.decode('utf-8')
                    if isinstance(event_etag, bytes):
                        event_etag = event_etag.decode('utf-8')
                    if isinstance(event_uid, bytes):
                        event_uid = event_uid.decode('utf-8')

                    task_data = self.ical_to_task_data(ical_data, user)

                    if task_data:
                        caldav_uid = task_data['caldav_uid']

                        # Vérifier si la tâche existe déjà
                        existing_task = Task.objects.filter(caldav_uid=caldav_uid).first()

                        if existing_task:
                            # Vérifier l'etag pour savoir si l'événement a changé
                            if existing_task.caldav_etag != event_etag:
                                # Mettre à jour seulement si modifié
                                for key, value in task_data.items():
                                    if key != 'user':
                                        setattr(existing_task, key, value)
                                
                                existing_task.calendar_source = calendar_source
                                existing_task.caldav_etag = event_etag
                                existing_task.last_synced = timezone.now()
                                existing_task.save()
                                stats['events_updated'] += 1
                        else:
                            # Créer une nouvelle tâche
                            task = Task.objects.create(
                                **task_data,
                                calendar_source=calendar_source,
                                caldav_etag=event_etag,
                                last_synced=timezone.now()
                            )
                            stats['events_created'] += 1

                except Exception as e:
                    error_msg = f"Erreur événement {row.get('event_uri', 'unknown')}: {str(e)}"
                    stats['errors'].append(error_msg)
                    print(error_msg)
                    continue

            cursor.close()
            
        except Error as e:
            error_msg = f"Erreur MySQL: {str(e)}"
            stats['errors'].append(error_msg)
            print(error_msg)
        
        finally:
            self.close()
        
        return stats
    
    def sync_all_users(self):
        """
        Synchroniser tous les utilisateurs (utile pour un cron job)
        
        Returns:
            dict: Statistiques globales
        """
        global_stats = {
            'users_synced': 0,
            'total_events': 0,
            'errors': []
        }
        
        users = User.objects.all()
        
        for user in users:
            try:
                stats = self.sync_user_calendars(user)
                global_stats['users_synced'] += 1
                global_stats['total_events'] += stats['events_created'] + stats['events_updated']
                global_stats['errors'].extend(stats['errors'])
            except Exception as e:
                error_msg = f"Erreur sync user {user.username}: {str(e)}"
                global_stats['errors'].append(error_msg)
                print(error_msg)
        
        return global_stats
    
    def get_users_from_baikal(self):
        """
        Récupérer la liste des utilisateurs depuis Baikal
        Utile pour synchroniser les utilisateurs
        
        Returns:
            list: Liste des utilisateurs Baikal
        """
        if not self.connect():
            return []
        
        try:
            cursor = self.connection.cursor(dictionary=True)
            
            # Table: users contient les utilisateurs Baikal
            query = "SELECT id, username, digesta1 FROM users"
            cursor.execute(query)
            users = cursor.fetchall()
            
            cursor.close()
            return users
            
        except Error as e:
            print(f"Erreur récupération users: {e}")
            return []
        
        finally:
            self.close()
    
    def sync_calendars_only(self, user):
        """
        Synchroniser UNIQUEMENT les calendriers (pas les événements)
        Utilisé pour un login ultra-rapide, les événements seront chargés à la demande
        
        Args:
            user: Instance User Django
            
        Returns:
            dict: Statistiques de synchronisation
        """
        stats = {
            'calendars_synced': 0,
            'calendars_updated': 0,
            'errors': []
        }
        
        if not self.connect():
            stats['errors'].append("Impossible de se connecter à la base Baikal")
            return stats
        
        try:
            cursor = self.connection.cursor(dictionary=True)
            
            # Récupérer uniquement les calendriers sans les événements
            query = """
                SELECT 
                    ci.uri as calendar_uri,
                    ci.displayname as calendar_name,
                    ci.calendarcolor as calendar_color,
                    ci.principaluri
                FROM calendarinstances ci
                WHERE ci.principaluri LIKE %s
                GROUP BY ci.id
            """
            
            cursor.execute(query, (f'%{user.username}%',))
            calendars = cursor.fetchall()
            
            for row in calendars:
                calendar_uri = row['calendar_uri']
                calendar_name = row['calendar_name'] or calendar_uri
                calendar_color = row['calendar_color']
                
                # Décoder si nécessaire
                if isinstance(calendar_uri, bytes):
                    calendar_uri = calendar_uri.decode('utf-8')
                if isinstance(calendar_name, bytes):
                    calendar_name = calendar_name.decode('utf-8')
                if isinstance(calendar_color, bytes):
                    calendar_color = calendar_color.decode('utf-8')
                
                if not calendar_color or not calendar_color.startswith('#'):
                    calendar_color = '#005f82'
                
                # Construire l'URL du calendrier
                calendar_url = f"{settings.BAIKAL_SERVER_URL.rstrip('/')}/calendars/{user.username}/{calendar_uri}/"
                
                # Créer ou mettre à jour le CalendarSource
                calendar_source, created = CalendarSource.objects.update_or_create(
                    user=user,
                    calendar_url=calendar_url,
                    defaults={
                        'name': calendar_name,
                        'is_enabled': True,
                        'color': calendar_color
                    }
                )
                
                if created:
                    stats['calendars_synced'] += 1
                else:
                    stats['calendars_updated'] += 1
            
            cursor.close()
            
        except Error as e:
            error_msg = f"Erreur MySQL: {str(e)}"
            stats['errors'].append(error_msg)
            print(error_msg)
        
        finally:
            self.close()
        
        return stats
    
    def get_users_from_baikal(self):
        """
        Récupérer la liste des utilisateurs depuis Baikal
        Utile pour synchroniser les utilisateurs
        
        Returns:
            list: Liste des utilisateurs Baikal
        """
        if not self.connect():
            return []
        
        try:
            cursor = self.connection.cursor(dictionary=True)
            
            # Table: users contient les utilisateurs Baikal
            query = "SELECT id, username, digesta1 FROM users"
            cursor.execute(query)
            users = cursor.fetchall()
            
            cursor.close()
            return users
            
        except Error as e:
            print(f"Erreur récupération users: {e}")
            return []
        
        finally:
            self.close()
    
    def sync_users_from_baikal(self):
        """
        Synchroniser les utilisateurs depuis Baikal vers Django
        Crée automatiquement les utilisateurs manquants
        
        Returns:
            dict: Statistiques de synchronisation
        """
        stats = {
            'users_created': 0,
            'users_updated': 0,
            'errors': []
        }
        
        baikal_users = self.get_users_from_baikal()
        
        for baikal_user in baikal_users:
            try:
                username = baikal_user['username']
                
                # Vérifier si l'utilisateur existe déjà
                user, created = User.objects.get_or_create(
                    username=username,
                    defaults={
                        'email': f"{username}@local.app",  # Email par défaut
                        'user_id': baikal_user['id'],
                        'is_active': True
                    }
                )
                
                if created:
                    stats['users_created'] += 1
                else:
                    stats['users_updated'] += 1
                
            except Exception as e:
                error_msg = f"Erreur user {baikal_user.get('username', 'unknown')}: {str(e)}"
                stats['errors'].append(error_msg)
                print(error_msg)
        
        return stats

