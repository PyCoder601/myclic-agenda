import logging
from caldav import DAVClient
from caldav.objects import Calendar, Event
from datetime import datetime, timedelta
import niquests
from niquests.auth import HTTPDigestAuth
from typing import List, Optional, Dict, Any
import json

# Configuration du logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


class BaikalCalDAVClient:
    """Client CalDAV complet pour Baïkal"""

    def __init__(self, base_url: str, username: str, password: str):
        self.base_url = base_url.rstrip('/') + '/'
        self.username = username
        self.password = password

        # Session avec authentification Digest
        self._session = niquests.Session()
        self._session.auth = HTTPDigestAuth(username, password)

        # Client DAV avec notre session
        self.client = DAVClient(url=self.base_url)
        self.client.session = self._session

        # Principal
        self.principal = self.client.principal()
        logger.info(f"Connecté à Baïkal: {self.username}")

    def list_calendars(self, details: bool = False) -> List[Dict[str, Any]]:
        """Liste tous les calendriers avec option pour plus de détails"""
        calendars = self.principal.calendars()

        result = []
        for cal in calendars:
            cal_info = {
                'name': cal.name,
                'url': str(cal.url),
                'id': str(cal.url).split('/')[-2] if len(str(cal.url).split('/')) >= 2 else 'unknown'
            }

            if details:
                try:
                    # Récupérer les propriétés détaillées
                    props = cal.get_properties(['{DAV:}displayname', '{DAV:}resourcetype'])
                    cal_info['properties'] = dict(props)
                except:
                    cal_info['properties'] = {}

            result.append(cal_info)

        logger.info(f"Trouvé {len(result)} calendrier(s)")
        return result

    def get_calendar_by_name(self, name: str) -> Optional[Calendar]:
        """Récupère un calendrier spécifique par son nom exact"""
        for cal in self.principal.calendars():
            if cal.name == name:
                return cal
        return None

    def get_events(self, calendar_name: str, start_date: datetime = None,
                   end_date: datetime = None, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Récupère les événements d'un calendrier avec des filtres

        Args:
            calendar_name: Nom du calendrier
            start_date: Date de début (défaut: aujourd'hui - 7 jours)
            end_date: Date de fin (défaut: aujourd'hui + 30 jours)
            limit: Nombre maximum d'événements à retourner

        Returns:
            Liste d'événements formatés
        """
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
            # Recherche des événements
            events = calendar.date_search(start=start_date, end=end_date, expand=True)
            logger.info(f"Trouvé {len(events)} événement(s) dans '{calendar_name}'")

            # Formater les événements
            formatted_events = []
            for event in events[:limit]:  # Limiter le nombre
                try:
                    vevent = event.instance.vevent
                    formatted_event = {
                        'id': vevent.uid.value if hasattr(vevent, 'uid') else str(event.url),
                        'summary': vevent.summary.value if hasattr(vevent, 'summary') else 'Sans titre',
                        'description': vevent.description.value if hasattr(vevent, 'description') else '',
                        'location': vevent.location.value if hasattr(vevent, 'location') else '',
                        'start': self._parse_ical_date(vevent.dtstart.value) if hasattr(vevent, 'dtstart') else None,
                        'end': self._parse_ical_date(vevent.dtend.value) if hasattr(vevent, 'dtend') else None,
                        'last_modified': self._parse_ical_date(vevent.last_modified.value) if hasattr(vevent,
                                                                                                      'last_modified') else None,
                        'url': str(event.url),
                        'calendar': calendar_name
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
        if hasattr(ical_date, 'dt'):
            return ical_date.dt
        return ical_date

    def create_event(self, calendar_name: str, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Crée un nouvel événement

        Args:
            calendar_name: Nom du calendrier
            event_data: Données de l'événement

        Returns:
            Informations sur l'événement créé ou erreur
        """
        calendar = self.get_calendar_by_name(calendar_name)
        if not calendar:
            return {'error': f"Calendrier '{calendar_name}' non trouvé", 'success': False}

        try:
            # Validation des données requises
            required_fields = ['summary', 'start', 'end']
            for field in required_fields:
                if field not in event_data:
                    return {'error': f"Champ requis manquant: {field}", 'success': False}

            # Générer un UID unique
            uid = f"{datetime.now().timestamp()}_{hash(calendar_name)}@baikal"

            # Construire le contenu iCalendar
            ical_content = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Baïkal Python Client//FR
BEGIN:VEVENT
UID:{uid}
DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}
DTSTART:{self._format_ical_date(event_data['start'])}
DTEND:{self._format_ical_date(event_data['end'])}
SUMMARY:{event_data.get('summary', 'Nouvel événement')}
DESCRIPTION:{event_data.get('description', '')}
LOCATION:{event_data.get('location', '')}
END:VEVENT
END:VCALENDAR"""

            # Sauvegarder l'événement
            calendar.save_event(ical_content)

            logger.info(f"Événement créé: {event_data.get('summary')}")

            return {
                'success': True,
                'uid': uid,
                'message': f"Événement créé dans '{calendar_name}'",
                'summary': event_data.get('summary'),
                'start': event_data['start'],
                'end': event_data['end']
            }

        except Exception as e:
            logger.error(f"Erreur création événement: {e}")
            return {'error': str(e), 'success': False}

    def _format_ical_date(self, date_value):
        """Format une date pour iCalendar"""
        if isinstance(date_value, datetime):
            return date_value.strftime('%Y%m%dT%H%M%S')
        return date_value

    def delete_event(self, event_url: str) -> bool:
        """Supprime un événement par son URL"""
        try:
            event = self.client.event(url=event_url)
            event.delete()
            logger.info(f"Événement supprimé: {event_url}")
            return True
        except Exception as e:
            logger.error(f"Erreur suppression événement: {e}")
            return False

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
        calendars = baikal.list_calendars(details=False)
        print(calendars)

        # 3. Récupérer les événements d'un calendrier spécifique
        if calendars:
            target_calendar = calendars[0]['name']  # Premier calendrier
            print(f"\n📝 ÉVÉNEMENTS DANS '{target_calendar}':")
            print("-" * 40)

            events = baikal.get_events(
                calendar_name=target_calendar,
                start_date=datetime.now() - timedelta(days=30),
                end_date=datetime.now() + timedelta(days=30),
                limit=10
            )

            if events:
                for event in events:
                    print(event)
            else:
                print("  Aucun événement trouvé pour cette période.")

        # # 4. Exemple de création d'événement
        # print("\n➕ EXEMPLE DE CRÉATION D'ÉVÉNEMENT:")
        # print("-" * 40)
        #
        # new_event_data = {
        #     'summary': 'Réunion Python CalDAV',
        #     'description': 'Test d\'intégration CalDAV avec Baïkal',
        #     'location': 'Bureau virtuel',
        #     'start': datetime.now() + timedelta(days=2, hours=10),
        #     'end': datetime.now() + timedelta(days=2, hours=12)
        # }
        #
        # if calendars:
        #     result = baikal.create_event(calendars[0]['name'], new_event_data)
        #     if result.get('success'):
        #         print(f"✅ {result['message']}")
        #         print(f"   Titre: {result['summary']}")
        #         print(f"   UID: {result['uid']}")
        #     else:
        #         print(f"❌ Erreur: {result.get('error')}")

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