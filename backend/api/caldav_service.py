import logging
import uuid

from caldav import DAVClient
from caldav.objects import Calendar
from datetime import datetime, timedelta, timezone
import niquests
from niquests.auth import HTTPDigestAuth
from icalendar import Calendar as iCalendar, vDatetime, vDate
from datetime import datetime
import pytz
from typing import List, Optional, Dict, Any

from .baikal_models import BaikalCalendarInstance, BaikalCalendar

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class BaikalCalDAVClient:
    """Client CalDAV complet pour Baïkal"""

    def __init__(self, base_url: str, user):
        self.base_url = base_url.rstrip('/') + '/'
        self.username = user.email
        self.password = user.baikal_password

        # Session avec authentification Digest
        self._session = niquests.Session()
        self._session.auth = HTTPDigestAuth(user.email, user.baikal_password)

        # Client DAV avec notre session
        self.client = DAVClient(url=self.base_url)
        self.client.session = self._session

        # Principal
        self.principal = self.client.principal()
        logger.info(f"Connecté à Baïkal: {self.username}")

    def list_calendars(self):
        """Liste tous les calendriers disponibles via le principal CalDAV, au format dict pour le frontend/backend."""
        calendars = BaikalCalendarInstance.objects.using('baikal').filter(
            principaluri__contains=self.username
        )
        calendar_list = []
        for cal in calendars:
            # Filtrer les ressources (description contient "Resource")
            # if cal.description and 'Resource' in cal.description:
            #     continue

            cal_parent = BaikalCalendar.objects.using('baikal').get(id=cal.calendarid)
            if not cal_parent.is_visible:
                continue
            calendar_list.append({
                'id': cal.id,
                'calendarid': cal.calendarid,
                'displayname': cal.displayname or cal.defined_name or 'Calendrier',
                'principaluri': cal.principaluri,
                'uri': cal.uri,
                'description': cal.description,
                'calendarcolor': cal.calendarcolor or '#005f82',
                'defined_name': cal.defined_name,
                'access': cal.access,
                'share_href': cal.share_href,
                'share_displayname': cal.share_displayname or '',
                'display': cal.display,
                'user_id': cal.user_id
            })
        return calendar_list

    def get_calendar_by_name(self, name: str) -> Optional[Calendar]:
        """Récupère un calendrier spécifique par son nom exact"""
        for cal in self.principal.calendars():
            if getattr(cal, 'name', None) == name or getattr(cal, 'displayname', None) == name:
                return cal
        return None

    def get_events(self, calendar, start_date: datetime = None,
                   end_date: datetime = None) -> List[Dict[str, Any]]:
        """
        Récupère les événements d'un calendrier avec des filtres

        Args:
            calendar:calendrier
            start_date: Date de début (défaut: aujourd'hui - 7 jours)
            end_date: Date de fin (défaut: aujourd'hui + 30 jours)
            limit: Nombre maximum d'événements à retourner

        Returns:
            Liste d'événements formatés
        """
        calendar_obj = calendar
        calendar_name = calendar["displayname"]
        calendar = self.get_calendar_by_name(calendar_name)
        if not calendar:
            logger.error(f"Calendrier '{calendar_name}' non trouvé")
            return []

        # Dates par défaut
        if not start_date:
            start_date = datetime.now() - timedelta(days=7)
        if not end_date:
            end_date = datetime.now() + timedelta(days=30)

        try:
            # Recherche des événements avec la nouvelle API
            events = calendar.search(start=start_date, end=end_date, event=True, expand=True)
            logger.info(f"Trouvé {len(events)} événement(s) dans '{calendar_name}'")

            # Formater les événements
            formatted_events = []
            for event in events:  # Limiter le nombre
                try:
                    cal = event.icalendar_instance
                    vevent = None

                    # Trouver le composant VEVENT
                    for component in cal.walk():
                        if component.name == "VEVENT":
                            vevent = component
                            break

                    if not vevent:
                        continue

                    print("CLIENT", vevent.get('CLIENT'))
                    print("AFFAIR", vevent.get('AFFAIRE'))

                    # Parser les dates et enlever le timezone pour éviter les décalages horaires
                    start_date = self._parse_ical_date(vevent.get('dtstart')) if vevent.get('dtstart') else None
                    end_date = self._parse_ical_date(vevent.get('dtend')) if vevent.get('dtend') else None

                    # Enlever le timezone des dates (garder l'heure telle quelle)
                    if start_date and hasattr(start_date, 'tzinfo') and start_date.tzinfo:
                        start_date = start_date.replace(tzinfo=None)
                    if end_date and hasattr(end_date, 'tzinfo') and end_date.tzinfo:
                        end_date = end_date.replace(tzinfo=None)

                    # Parser le recurrence-id proprement
                    recurrence_id = ''
                    if vevent.get('recurrence-id'):
                        recurrence_id_parsed = self._parse_ical_date(vevent.get('recurrence-id'))
                        if recurrence_id_parsed:
                            # Enlever le timezone et formater en ISO
                            if hasattr(recurrence_id_parsed, 'tzinfo') and recurrence_id_parsed.tzinfo:
                                recurrence_id_parsed = recurrence_id_parsed.replace(tzinfo=None)
                            recurrence_id = recurrence_id_parsed.isoformat() if hasattr(recurrence_id_parsed, 'isoformat') else str(recurrence_id_parsed)

                    formatted_event = {
                        'id': str(vevent.get('uid', event.url)),
                        'title': str(vevent.get('summary', 'Sans titre')),
                        'description': str(vevent.get('description', '')),
                        'location': str(vevent.get('location', '')),
                        'type': str(vevent.get('eventtype', 'agenda_event')),
                        'start_date': start_date,
                        'end_date': end_date,
                        # 'lastmodified': self._parse_ical_date(vevent.get('last-modified')) if vevent.get('last-modified') else None,
                        'url': str(event.url),
                        "client_id": str(vevent.get('CLIENT', '')),
                        "affair_id": str(vevent.get('AFFAIR', '')),
                        'calendar_source_name': calendar_name,
                        'calendar_source_id': calendar_obj['id'],
                        'calendar_source_uri': calendar_obj['uri'],
                        'calendar_source_color': calendar_obj["calendarcolor"],
                        'recurrence_id': recurrence_id
                    }
                    formatted_events.append(formatted_event)
                except Exception as e:
                    logger.warning(f"Erreur formatage événement: {e}")
                    continue

            return formatted_events

        except Exception as e:
            logger.error(f"Erreur récupération événements: {e}")
            return []

    def _parse_ical_date(self, ical_date):
        """Parse une date iCalendar en datetime Python"""
        if ical_date is None:
            return None

        # Si c'est déjà un datetime
        if isinstance(ical_date, datetime):
            return ical_date

        # Si c'est un objet vDDDTypes d'icalendar
        if hasattr(ical_date, 'dt'):
            return ical_date.dt

        return ical_date

    def create_event(self, calendar_name: str, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Crée un nouvel événement

        Args:
            calendar_name: Nom du calendrier
            event_data: Données de l'événement (summary, start, end, description, location)

        Returns:
            Informations sur l'événement créé ou erreur
        """

        print("event_data", event_data)
        print("calendar_name", calendar_name)

        calendar = self.get_calendar_by_name(calendar_name)
        if not calendar:
            return {'error': f"Calendrier '{calendar_name}' non trouvé", 'success': False}

        try:
            # Validation des données requises
            required_fields = ['title', 'start', 'end']
            for field in required_fields:
                if field not in event_data:
                    return {'error': f"Champ requis manquant: {field}", 'success': False}

            # Générer un UID unique
            uid = event_data.get('uid', str(uuid.uuid4()))

            # Gérer les dates (support datetime et timestamp)
            start_date = event_data['start']
            end_date = event_data['end']

            if isinstance(start_date, (int, float)):
                start_date = datetime.fromtimestamp(start_date)
            if isinstance(end_date, (int, float)):
                end_date = datetime.fromtimestamp(end_date)

            # Construire le contenu iCalendar
            ical_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Baïkal Python Client//FR
BEGIN:VEVENT
UID:{uid}
DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}
DTSTART:{self.format_ical_date(start_date)}
DTEND:{self.format_ical_date(end_date)}
SUMMARY:{event_data.get('title', 'Nouvel événement')}
DESCRIPTION:{event_data.get('description', '')}
LOCATION:{event_data.get('location', '')}
STATUS:CONFIRMED"""

            # Ajouter CLIENT et AFFAIR si présents
            if 'client_id' in event_data and event_data['client_id']:
                ical_content += f"\nCLIENT:{event_data['client_id']}"

            if 'affair_id' in event_data and event_data['affair_id']:
                ical_content += f"\nAFFAIR:{event_data['affair_id']}"

            if 'recurrence-id' in event_data:
                ical_content += f"\nRECURRENCE-ID:{self.format_ical_date(event_data['recurrence-id'])}"

            # Ajouter SEQUENCE si fourni
            if 'sequence' in event_data:
                ical_content += f"\nSEQUENCE:{event_data['sequence']}"

            ical_content += """
END:VEVENT
END:VCALENDAR"""

            # Construire l'URL de l'événement
            # Format: base_url/calendars/user@example.com/calendar_uri/uid.ics
            calendar_url = str(calendar.url).rstrip('/')
            event_url = f"{calendar_url}/{uid}.ics"

            # Sauvegarder l'événement via PUT
            # Note: Pas de If-None-Match pour les événements récurrents (même UID, RECURRENCE-ID différents)
            headers = {
                'Content-Type': 'text/calendar; charset=utf-8',
            }

            response = self._session.put(event_url, data=ical_content.encode('utf-8'), headers=headers)

            if response.status_code not in [200, 201, 204]:
                logger.error(f"Erreur création événement: HTTP {response.status_code} - {response.text}")
                return {'error': f'Erreur HTTP {response.status_code}: {response.text}', 'success': False}

            logger.info(f"Événement créé: {event_data.get('title')} dans '{calendar_name}'")

            return {
                'id': uid,
                'title': event_data.get('title'),
                'description': event_data.get('description', ''),
                'location': event_data.get('location', ''),
                'calendar_source_name': calendar_name,
                'start': start_date.isoformat() if hasattr(start_date, 'isoformat') else str(start_date),
                'end': end_date.isoformat() if hasattr(end_date, 'isoformat') else str(end_date)
            }

        except Exception as e:
            logger.error(f"Erreur création événement: {e}", exc_info=True)
            return {'error': str(e), 'success': False}

    def format_ical_date(self, date_value):
        """
        Format une date pour iCalendar
        Supporte: datetime, timestamp, string ISO
        Les dates sans timezone sont traitées comme des heures locales
        """
        if isinstance(date_value, datetime):
            # Si la date a un timezone, enlever le timezone (garder l'heure telle quelle)
            if date_value.tzinfo is not None:
                date_value = date_value.replace(tzinfo=None)
            return date_value.strftime('%Y%m%dT%H%M%S')
        elif isinstance(date_value, (int, float)):
            # Timestamp UNIX
            dt = datetime.fromtimestamp(date_value)
            return dt.strftime('%Y%m%dT%H%M%S')
        elif isinstance(date_value, str):
            # Essayer de parser la string ISO
            try:
                # Si la date contient 'Z' ou '+', elle a un timezone
                if 'Z' in date_value or '+' in date_value:
                    dt = datetime.fromisoformat(date_value.replace('Z', '+00:00'))
                    # Enlever le timezone mais garder l'heure
                    dt = dt.replace(tzinfo=None)
                else:
                    # Date locale sans timezone - la parser directement
                    dt = datetime.fromisoformat(date_value)
                return dt.strftime('%Y%m%dT%H%M%S')
            except:
                return date_value
        return str(date_value)

    def delete_event(self, event_url: str) -> Dict[str, Any]:
        """
        Supprime un événement par son URL

        Args:
            event_url: URL complète de l'événement (format: base_url/calendars/user/cal_uri/event_uri.ics)

        Returns:
            Dictionnaire avec le résultat de la suppression
        """
        try:
            # Essayer de récupérer l'événement d'abord pour vérifier qu'il existe
            get_response = self._session.get(event_url)

            if get_response.status_code == 404:
                return {
                    'success': True,
                    'message': 'Événement déjà supprimé',
                    'event_url': event_url,
                    'already_deleted': True
                }

            # Sauvegarder quelques infos avant suppression
            event_info = {'url': event_url}
            if get_response.status_code == 200:
                try:
                    from icalendar import Calendar as iCalendar
                    cal = iCalendar.from_ical(get_response.content)
                    for component in cal.walk():
                        if component.name == "VEVENT":
                            event_info['summary'] = str(component.get('summary', ''))
                            event_info['uid'] = str(component.get('uid', ''))
                            break
                except:
                    pass

            # Supprimer l'événement via HTTP DELETE
            response = self._session.delete(event_url)

            if response.status_code in [200, 204]:
                logger.info(f"Événement supprimé: {event_url}")
                return {
                    'success': True,
                    'message': 'Événement supprimé avec succès',
                    'event_url': event_url,
                    'event_info': event_info
                }
            elif response.status_code == 404:
                return {
                    'success': True,
                    'message': 'Événement déjà supprimé',
                    'event_url': event_url,
                    'already_deleted': True
                }
            else:
                logger.error(f"Erreur suppression événement: HTTP {response.status_code}")
                return {
                    'success': False,
                    'error': f'Erreur HTTP {response.status_code}',
                    'event_url': event_url
                }

        except Exception as e:
            logger.error(f"Erreur suppression événement: {e}")
            return {
                'success': False,
                'error': str(e),
                'event_url': event_url
            }

    def delete_event_occurrence(self, event_url: str, recurrence_id: str) -> Dict[str, Any]:
        """
        Supprime une occurrence spécifique d'un événement récurrent en ajoutant une EXDATE

        Args:
            event_url: URL complète de l'événement récurrent
            recurrence_id: Date/heure de l'occurrence à supprimer (format ISO)

        Returns:
            Dictionnaire avec le résultat de la suppression
        """
        try:

            # Récupérer l'événement principal
            get_response = self._session.get(event_url)

            if get_response.status_code == 404:
                return {
                    'success': False,
                    'error': 'Événement non trouvé',
                    'event_url': event_url
                }

            # Parser l'événement iCalendar
            cal = iCalendar.from_ical(get_response.content)
            event_found = False
            main_event = None

            for component in cal.walk():
                if component.name == "VEVENT" and not component.get('RECURRENCE-ID'):
                    # C'est l'événement principal (pas une occurrence)
                    event_found = True
                    main_event = component
                    break

            if not event_found or not main_event:
                return {
                    'success': False,
                    'error': 'Événement principal non trouvé',
                    'event_url': event_url
                }

            # Parser la date de recurrence_id
            # Gérer le cas où recurrence_id est un objet vDDDTypes stringifié
            if 'vDDDTypes' in recurrence_id:
                # Format: "vDDDTypes(2026-01-29 00:00:00+01:00, Parameters({'TZID': 'Europe/Paris'}))"
                # Extraire la date entre les parenthèses
                import re
                match = re.search(r'vDDDTypes\(([^,]+),', recurrence_id)
                if match:
                    date_str = match.group(1).strip()
                    # Parser la date avec timezone
                    recurrence_dt = datetime.fromisoformat(date_str)
                else:
                    raise ValueError(f"Format vDDDTypes invalide: {recurrence_id}")
            else:
                # Format ISO standard
                recurrence_dt = datetime.fromisoformat(recurrence_id.replace('Z', '+00:00'))

            # Récupérer le timezone du DTSTART
            dtstart = main_event.get('DTSTART')
            if hasattr(dtstart, 'dt'):
                dt_value = dtstart.dt
                if hasattr(dt_value, 'tzinfo') and dt_value.tzinfo:
                    # Utiliser le même timezone que l'événement
                    if recurrence_dt.tzinfo is None:
                        recurrence_dt = recurrence_dt.replace(tzinfo=dt_value.tzinfo)
                    else:
                        recurrence_dt = recurrence_dt.astimezone(dt_value.tzinfo)
                elif recurrence_dt.tzinfo is None:
                    # Pas de timezone, utiliser Europe/Paris par défaut
                    recurrence_dt = pytz.timezone('Europe/Paris').localize(recurrence_dt)

            # Ajouter l'EXDATE (exception de récurrence)
            exdates = main_event.get('EXDATE')

            if exdates is None:
                # Pas d'EXDATE existant, en créer un nouveau
                main_event.add('EXDATE', recurrence_dt)
            elif isinstance(exdates, list):
                # Plusieurs EXDATE existantes
                main_event.add('EXDATE', recurrence_dt)
            else:
                # Une seule EXDATE, la convertir en liste
                existing_exdate = exdates.dts if hasattr(exdates, 'dts') else [exdates]
                main_event.pop('EXDATE')
                for ex in existing_exdate:
                    main_event.add('EXDATE', ex.dt)
                main_event.add('EXDATE', recurrence_dt)

            # Incrémenter SEQUENCE
            sequence = main_event.get('SEQUENCE', 0)
            main_event['SEQUENCE'] = int(sequence) + 1

            # Mettre à jour DTSTAMP
            main_event['DTSTAMP'] = vDatetime(datetime.now(pytz.UTC))

            # Mettre à jour l'événement via PUT
            ical_content = cal.to_ical()

            # Récupérer l'ETag si disponible
            etag = get_response.headers.get('ETag')
            headers = {
                'Content-Type': 'text/calendar; charset=utf-8',
            }
            if etag:
                headers['If-Match'] = etag

            response = self._session.put(
                event_url,
                data=ical_content,
                headers=headers
            )

            if response.status_code in [200, 201, 204]:
                logger.info(f"Occurrence supprimée via EXDATE: {event_url} - {recurrence_id}")
                return {
                    'success': True,
                    'message': 'Occurrence supprimée avec succès',
                    'event_url': event_url,
                    'recurrence_id': recurrence_id
                }
            else:
                logger.error(f"Erreur suppression occurrence: HTTP {response.status_code} - {response.text}")
                return {
                    'success': False,
                    'error': f'Erreur HTTP {response.status_code}: {response.text}',
                    'event_url': event_url
                }

        except Exception as e:
            logger.error(f"Erreur suppression occurrence: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'event_url': event_url
            }

    def update_event(self, event_url: str, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Met à jour un événement existant

        Args:
            event_url: URL complète de l'événement
            event_data: Nouvelles données de l'événement (summary, description, location, start, end)

        Returns:
            Résultat de la mise à jour avec ancien et nouvel état
        """
        try:
            # Récupérer l'événement existant
            response = self._session.get(event_url)

            if response.status_code != 200:
                return {
                    'success': False,
                    'error': f'Événement non trouvé: HTTP {response.status_code}',
                    'event_url': event_url
                }

            # Parser l'iCalendar existant
            from icalendar import Calendar as iCalendar
            cal = iCalendar.from_ical(response.content)

            # Trouver le VEVENT
            vevent = None
            for component in cal.walk():
                if component.name == "VEVENT":
                    vevent = component
                    break

            if not vevent:
                return {
                    'success': False,
                    'error': 'Composant VEVENT non trouvé',
                    'event_url': event_url
                }

            # Sauvegarder l'ancien état
            old_state = {
                'summary': str(vevent.get('summary', '')),
                'description': str(vevent.get('description', '')),
                'location': str(vevent.get('location', '')),
                'start': self._parse_ical_date(vevent.get('dtstart')) if vevent.get('dtstart') else None,
                'end': self._parse_ical_date(vevent.get('dtend')) if vevent.get('dtend') else None
            }

            # Appliquer les modifications
            if 'summary' in event_data:
                vevent['summary'] = event_data['summary']

            if 'description' in event_data:
                vevent['description'] = event_data['description']

            if 'location' in event_data:
                vevent['location'] = event_data['location']

            if 'start' in event_data:
                start_date = event_data['start']
                if isinstance(start_date, str):
                    # Gérer les dates avec et sans timezone
                    if 'Z' in start_date or '+' in start_date:
                        start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                        # Enlever le timezone mais garder l'heure
                        start_date = start_date.replace(tzinfo=None)
                    else:
                        # Date locale sans timezone
                        start_date = datetime.fromisoformat(start_date)
                elif isinstance(start_date, (int, float)):
                    start_date = datetime.fromtimestamp(start_date)
                vevent['dtstart'].dt = start_date

            if 'end' in event_data:
                end_date = event_data['end']
                if isinstance(end_date, str):
                    # Gérer les dates avec et sans timezone
                    if 'Z' in end_date or '+' in end_date:
                        end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                        # Enlever le timezone mais garder l'heure
                        end_date = end_date.replace(tzinfo=None)
                    else:
                        # Date locale sans timezone
                        end_date = datetime.fromisoformat(end_date)
                elif isinstance(end_date, (int, float)):
                    end_date = datetime.fromtimestamp(end_date)
                vevent['dtend'].dt = end_date

            # Mettre à jour CLIENT et AFFAIR si fournis
            if 'client_id' in event_data:
                if event_data['client_id']:
                    vevent['client'] = str(event_data['client_id'])
                elif 'client' in vevent:
                    del vevent['client']

            if 'affair_id' in event_data:
                if event_data['affair_id']:
                    vevent['affair'] = str(event_data['affair_id'])
                elif 'affair' in vevent:
                    del vevent['affair']

            # Mettre à jour LAST-MODIFIED et DTSTAMP
            from icalendar import vDatetime
            now = datetime.now(timezone.utc)
            vevent['last-modified'] = vDatetime(now)
            vevent['dtstamp'] = vDatetime(now)

            # Nouvel état
            new_state = {
                'summary': str(vevent.get('summary', '')),
                'description': str(vevent.get('description', '')),
                'location': str(vevent.get('location', '')),
                'start': self._parse_ical_date(vevent.get('dtstart')) if vevent.get('dtstart') else None,
                'end': self._parse_ical_date(vevent.get('dtend')) if vevent.get('dtend') else None
            }

            # Envoyer la mise à jour via PUT
            headers = {'Content-Type': 'text/calendar; charset=utf-8'}
            put_response = self._session.put(event_url, data=cal.to_ical(), headers=headers)

            if put_response.status_code in [200, 204]:
                logger.info(f"Événement mis à jour: {event_url}")
                return {
                    'success': True,
                    'message': 'Événement mis à jour avec succès',
                    'event_url': event_url,
                    'old_state': old_state,
                    'new_state': new_state
                }
            else:
                return {
                    'success': False,
                    'error': f'Erreur HTTP {put_response.status_code}',
                    'event_url': event_url
                }

        except Exception as e:
            logger.error(f"Erreur mise à jour événement: {e}", exc_info=True)
            return {
                'success': False,
                'error': str(e),
                'event_url': event_url
            }

    def search_events(self, query: str, calendar_names: List[str] = None) -> List[Dict[str, Any]]:
        """Recherche des événements par mot-clé"""
        all_events = []

        # Déterminer quels calendriers rechercher
        calendars_to_search = []
        if calendar_names:
            for name in calendar_names:
                cal = self.get_calendar_by_name(name)
                if cal:
                    calendars_to_search.append(cal)
        else:
            calendars_to_search = self.principal.calendars()

        # Rechercher dans chaque calendrier
        for calendar in calendars_to_search:
            try:
                # Récupérer tous les événements (sans filtre de date)
                events = calendar.events()

                for event in events:
                    try:
                        vevent = event.instance.vevent
                        summary = vevent.summary.value if hasattr(vevent, 'summary') else ''
                        description = vevent.description.value if hasattr(vevent, 'description') else ''

                        # Rechercher dans le titre et la description
                        if query.lower() in summary.lower() or query.lower() in description.lower():
                            formatted_event = {
                                'summary': summary,
                                'description': description,
                                'calendar': calendar.name,
                                'url': str(event.url),
                                'start': self._parse_ical_date(vevent.dtstart.value) if hasattr(vevent,
                                                                                                'dtstart') else None,
                                'end': self._parse_ical_date(vevent.dtend.value) if hasattr(vevent, 'dtend') else None
                            }
                            all_events.append(formatted_event)
                    except:
                        continue

            except Exception as e:
                logger.warning(f"Erreur recherche dans {calendar.name}: {e}")
                continue

        return all_events

    def get_event_by_uid(self, calendar_name: str, event_uid: str) -> Optional[Dict[str, Any]]:
        """
        Récupère un événement spécifique par son UID

        Args:
            calendar_name: Nom du calendrier
            event_uid: UID de l'événement

        Returns:
            Événement formaté ou None
        """
        calendar = self.get_calendar_by_name(calendar_name)
        if not calendar:
            logger.error(f"Calendrier '{calendar_name}' non trouvé")
            return None

        try:
            # Récupérer tous les événements du calendrier
            events = calendar.events()

            for event in events:
                try:
                    vevent = event.instance.vevent
                    if hasattr(vevent, 'uid') and vevent.uid.value == event_uid:
                        formatted_event = {
                            'id': vevent.uid.value,
                            'summary': vevent.summary.value if hasattr(vevent, 'summary') else 'Sans titre',
                            'description': vevent.description.value if hasattr(vevent, 'description') else '',
                            'location': vevent.location.value if hasattr(vevent, 'location') else '',
                            'start': self._parse_ical_date(vevent.dtstart.value) if hasattr(vevent, 'dtstart') else None,
                            'end': self._parse_ical_date(vevent.dtend.value) if hasattr(vevent, 'dtend') else None,
                            'url': str(event.url),
                            'calendar': calendar_name
                        }
                        return formatted_event
                except Exception as e:
                    logger.warning(f"Erreur parsing événement: {e}")
                    continue

            logger.warning(f"Événement avec UID '{event_uid}' non trouvé dans '{calendar_name}'")
            return None

        except Exception as e:
            logger.error(f"Erreur récupération événement: {e}")
            return None

    def get_event_by_url(self, event_url: str) -> Optional[Dict[str, Any]]:
        """
        Récupère un événement spécifique par son URL

        Args:
            event_url: URL complète de l'événement

        Returns:
            Événement formaté ou None
        """
        try:
            # Récupérer l'événement via HTTP GET
            response = self._session.get(event_url)

            if response.status_code != 200:
                logger.error(f"Événement non trouvé: HTTP {response.status_code}")
                return None

            # Parser l'iCalendar
            from icalendar import Calendar as iCalendar
            cal = iCalendar.from_ical(response.content)

            # Trouver le VEVENT
            vevent = None
            for component in cal.walk():
                if component.name == "VEVENT":
                    vevent = component
                    break

            if not vevent:
                logger.error("Composant VEVENT non trouvé")
                return None

            # Formater l'événement
            formatted_event = {
                'id': str(vevent.get('uid', '')),
                'uid': str(vevent.get('uid', '')),
                'summary': str(vevent.get('summary', 'Sans titre')),
                'description': str(vevent.get('description', '')),
                'location': str(vevent.get('location', '')),
                'start': self._parse_ical_date(vevent.get('dtstart')) if vevent.get('dtstart') else None,
                'end': self._parse_ical_date(vevent.get('dtend')) if vevent.get('dtend') else None,
                'last_modified': self._parse_ical_date(vevent.get('last-modified')) if vevent.get('last-modified') else None,
                'url': event_url,
                'etag': response.headers.get('ETag', '')
            }

            return formatted_event

        except Exception as e:
            logger.error(f"Erreur récupération événement par URL: {e}", exc_info=True)
            return None


# Exemple d'utilisation détaillée
def main():
    """Exemple d'utilisation complète du client"""
    # Configuration
    BASE_URL = "https://www.myclic.fr/baikal/html/dav.php/"
    USERNAME = "romeomanoela18@gmail.com"
    PASSWORD = "1918171615"

    try:
        # 1. Initialisation
        print("=" * 60)
        print("INITIALISATION DU CLIENT BAIKAL")
        print("=" * 60)
        baikal = BaikalCalDAVClient(BASE_URL, USERNAME, PASSWORD)

        # 2. Lister les calendriers
        print("\n📅 LISTE DES CALENDRIERS DISPONIBLES:")
        print("-" * 40)
        calendars = baikal.list_calendars()
        for i, cal in enumerate(calendars, 1):
            print(f"  {i}. {cal['name']}")

        # 3. Récupérer les événements d'un calendrier spécifique
        if calendars:
            target_calendar = calendars[0]['name']  # Premier calendrier
            print(f"\n📝 ÉVÉNEMENTS DANS '{target_calendar}':")
            print("-" * 40)

            events = baikal.get_events(
                calendar_name=target_calendar,
                start_date=datetime.now() - timedelta(days=30),
                end_date=datetime.now() + timedelta(days=30)
            )

            if events:
                for event in events:
                    start_str = event['start'].strftime('%d/%m/%Y %H:%M') if event['start'] else 'N/A'
                    end_str = event['end'].strftime('%d/%m/%Y %H:%M') if event['end'] else 'N/A'
                    print(f"  • {event['summary']}")
                    print(f"    📍 {event['location'] or 'Non spécifié'}")
                    print(f"    ⏰ {start_str} → {end_str}")
                    print(f"    📝 {event['description'][:50]}{'...' if len(event['description']) > 50 else ''}")
                    print()
            else:
                print("  Aucun événement trouvé pour cette période.")

        # 4. Exemple de création d'événement
        print("\n➕ EXEMPLE DE CRÉATION D'ÉVÉNEMENT:")
        print("-" * 40)

        new_event_data = {
            'summary': 'Réunion Python CalDAV',
            'description': 'Test d\'intégration CalDAV avec Baïkal',
            'location': 'Bureau virtuel',
            'start': datetime.now() + timedelta(days=2, hours=10),
            'end': datetime.now() + timedelta(days=2, hours=12)
        }

        if calendars:
            result = baikal.create_event(calendars[0]['name'], new_event_data)
            if result.get('success'):
                print(f"✅ {result['message']}")
                print(f"   Titre: {result['summary']}")
                print(f"   UID: {result['uid']}")
            else:
                print(f"❌ Erreur: {result.get('error')}")

        print("\n" + "=" * 60)
        print("✅ CONNEXION ET OPÉRATIONS RÉUSSIES !")
        print("=" * 60)

    except Exception as e:
        print(f"\n❌ ERREUR CRITIQUE: {type(e).__name__}")
        print(f"   Détails: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()