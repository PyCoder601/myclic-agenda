"""
Vues pour interagir avec Baikal via CalDAV et lecture directe MySQL
- Lecture depuis MySQL (rapide)
- Écriture via CalDAV (garantit la cohérence)
CRUD complet pour calendriers et événements.
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from django.conf import settings
from datetime import datetime
import uuid
import caldav

from .baikal_models import (
    BaikalCalendarInstance,
    BaikalCalendarObject,
)
from .baikal_serializers import (
    BaikalCalendarSerializer,
    BaikalEventSerializer
)
from .caldav_service import CalDAVService

from rest_framework.decorators import api_view, permission_classes

# -----------------------------
# Helper Functions
# -----------------------------
def get_caldav_calendar_for_id(user, calendar_id):
    """
    Obtenir l'objet Calendar CalDAV pour un calendar_id donné

    Args:
        user: L'utilisateur Django
        calendar_id: ID du calendrier (calendarid de BaikalCalendarInstance)

    Returns:
        tuple: (client, calendar) ou (None, None) en cas d'erreur
    """
    try:
        # Récupérer l'instance du calendrier
        calendar_instance = BaikalCalendarInstance.objects.using('baikal').get(
            calendarid=calendar_id,
            principaluri__contains=user.username
        )

        # Connexion au serveur CalDAV
        client = caldav.DAVClient(
            url=settings.BAIKAL_SERVER_URL,
            username=user.username,
            password=user.baikal_password
        )

        # Récupérer le principal et ses calendriers
        principal = client.principal()
        calendars = principal.calendars()

        # Construire l'URL du calendrier
        calendar_uri = calendar_instance.uri_str

        # Trouver le calendrier correspondant
        for cal in calendars:
            cal_url = str(cal.url.canonical())  # Convertir URL en string
            if calendar_uri in cal_url:
                return client, cal

        # Si non trouvé, utiliser le premier calendrier
        if calendars:
            return client, calendars[0]

        return None, None
    except Exception as e:
        print(f"❌ Erreur connexion CalDAV: {e}")
        import traceback
        traceback.print_exc()
        return None, None

# -----------------------------
# Calendars - List / Create
# -----------------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def baikal_calendars_list(request):
    """Lister les calendriers de l'utilisateur"""
    user = request.user
    username = user.username

    queryset = BaikalCalendarInstance.objects.using('baikal').filter(
        principaluri__contains=username
    )

    serializer = BaikalCalendarSerializer(queryset, many=True)
    return Response(serializer.data)

# -----------------------------
# Calendars - Detail / Update / Delete
# -----------------------------
@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def baikal_calendar_detail(request, pk: int):
    """Détail / Mise à jour / Suppression d'un calendrier"""
    try:
        instance = BaikalCalendarInstance.objects.using('baikal').get(id=pk)
    except BaikalCalendarInstance.DoesNotExist:
        return Response({'error': 'Calendrier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = BaikalCalendarSerializer(instance)
        return Response(serializer.data)

    if request.method == 'PATCH':
        data = request.data

        # Toutes les mises à jour passent par CalDAV pour éviter les locks MySQL
        try:
            client, caldav_calendar = get_caldav_calendar_for_id(request.user, instance.calendarid)
            if not caldav_calendar:
                return Response(
                    {'error': 'Impossible de se connecter au calendrier CalDAV'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Update via CalDAV (supporte displayname, description, color)
            # Note: 'display' et 'is_enabled' ne sont pas des propriétés CalDAV standard
            # donc on les ignore pour éviter les problèmes de lock
            displayname = data.get('displayname')
            description = data.get('description')
            color = data.get('calendarcolor')

            success = CalDAVService.update_calendar(
                calendar=caldav_calendar,
                displayname=displayname,
                description=description,
                color=color
            )

            if not success:
                return Response(
                    {'error': 'Erreur lors de la mise à jour du calendrier via CalDAV'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Attendre que Baikal traite la modification CalDAV
            import time
            time.sleep(0.5)

            # Relire depuis la base pour obtenir les données mises à jour
            instance.refresh_from_db(using='baikal')
            serializer = BaikalCalendarSerializer(instance)
            return Response(serializer.data)

        except Exception as e:
            import traceback
            print(f"❌ ERROR in calendar update:")
            print(traceback.format_exc())
            return Response({'error': f'Erreur lors de la mise à jour: {str(e)}'},
                            status=status.HTTP_500_INTERNAL_SERVER_ERROR)


    if request.method == 'DELETE':
        # Protéger contre suppression si pas propriétaire
        if not instance.principaluri_str.endswith(request.user.username):
            return Response({'error': 'Vous ne pouvez pas supprimer ce calendrier'}, status=status.HTTP_403_FORBIDDEN)

        try:
            # Supprimer via CalDAV
            client, caldav_calendar = get_caldav_calendar_for_id(request.user, instance.calendarid)
            if not caldav_calendar:
                return Response(
                    {'error': 'Impossible de se connecter au calendrier CalDAV'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Supprimer le calendrier via CalDAV
            caldav_calendar.delete()
            print(f"✅ Calendrier supprimé via CalDAV")

            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            import traceback
            print(f"❌ ERROR in calendar deletion:")
            print(traceback.format_exc())
            return Response({'error': f'Erreur lors de la suppression: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# -----------------------------
# Events - List / Create
# -----------------------------
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def baikal_events_list(request):
    """Lister ou créer des événements"""
    user = request.user
    username = user.username

    if request.method == 'GET':
        # Récupérer les IDs des calendriers de l'utilisateur
        user_calendars = BaikalCalendarInstance.objects.using('baikal').filter(
            principaluri__contains=username
        ).values_list('calendarid', flat=True)

        queryset = BaikalCalendarObject.objects.using('baikal').filter(
            calendarid__in=list(user_calendars),
            componenttype=b'VEVENT'
        )

        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        if start_date and end_date:
            try:
                start_ts = int(datetime.fromisoformat(start_date.replace('Z', '+00:00')).timestamp())
                end_ts = int(datetime.fromisoformat(end_date.replace('Z', '+00:00')).timestamp())
                queryset = queryset.filter(Q(firstoccurence__lte=end_ts) & Q(lastoccurence__gte=start_ts))
            except Exception:
                pass
        queryset = queryset.order_by('-lastmodified')
        serializer = BaikalEventSerializer(queryset, many=True)
        return Response(serializer.data)

    # POST - création via CalDAV
    data = request.data
    calendar_id = data.get('calendar_id')
    if not calendar_id:
        return Response({'error': 'calendar_id est requis'}, status=status.HTTP_400_BAD_REQUEST)

    print(f"=== CREATE EVENT VIA CALDAV ===")
    print(f"User: {user.username}")
    print(f"Calendar ID: {calendar_id}")
    print(f"Data: {dict(data)}")

    try:
        # Obtenir le calendrier CalDAV
        client, caldav_calendar = get_caldav_calendar_for_id(user, calendar_id)
        if not caldav_calendar:
            return Response(
                {'error': 'Impossible de se connecter au calendrier CalDAV'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Générer un UID unique
        event_uid = str(uuid.uuid4())

        # Parser les dates
        start_date = datetime.fromisoformat(data['start_date'].replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))

        # Créer l'événement iCalendar via CalDAVService
        ical_string = CalDAVService.create_ical_event(
            uid=event_uid,
            title=data.get('title', 'Sans titre'),
            description=data.get('description', ''),
            start_date=start_date,
            end_date=end_date,
            is_completed=data.get('is_completed', False)
        )

        # Envoyer via CalDAV en utilisant CalDAVService
        success = CalDAVService.save_event_to_calendar(caldav_calendar, ical_string)

        if not success:
            return Response(
                {'error': 'Erreur lors de la création de l\'événement'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        print(f"✅ Événement créé avec succès!")

        # Stratégie de retry optimisée pour réponse rapide
        import time
        max_retries = 3  # Réduit de 5 à 3 pour réponse plus rapide
        retry_delay = 0.3  # Réduit de 0.5 à 0.3 seconde

        for attempt in range(max_retries):
            print(f"🔍 Tentative {attempt + 1}/{max_retries}...")

            # Attendre que Baikal écrive dans la base (délai optimisé)
            time.sleep(retry_delay)

            # Rechercher l'événement créé
            try:
                # Récupérer les 5 événements les plus récents (optimisé)
                recent_events = BaikalCalendarObject.objects.using('baikal').filter(
                    calendarid=calendar_id,
                    componenttype=b'VEVENT'
                ).order_by('-id')[:5]

                # Chercher notre événement par UID
                for evt in recent_events:
                    if evt.uid_str == event_uid:
                        print(f"✅ Trouvé en {(attempt + 1) * retry_delay:.1f}s!")
                        serializer = BaikalEventSerializer(evt)
                        return Response(serializer.data, status=status.HTTP_201_CREATED)

            except Exception as e:
                print(f"⚠️ Erreur: {e}")

        # Si non trouvé après tous les essais
        print(f"⚠️ Non trouvé après {max_retries} tentatives")
        print(f"   L'événement devrait apparaître après un rechargement manuel")

        # Retourner une réponse minimale pour éviter les erreurs frontend
        # Le frontend devra recharger pour voir l'événement
        return Response({
            'success': True,
            'message': 'Événement créé avec succès. Rechargez pour le voir.',
            'uid': event_uid,
            'calendar_id': calendar_id
        }, status=status.HTTP_202_ACCEPTED)  # 202 = Accepted (processing)

    except Exception as e:
        import traceback
        print(f"❌ ERROR in event creation:")
        print(traceback.format_exc())
        return Response({'error': f'Erreur lors de la création: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# -----------------------------
# Events - Detail / Update / Delete
# -----------------------------
@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@permission_classes([IsAuthenticated])
def baikal_event_detail(request, pk: int):
    """Détail / mise à jour / suppression d'un événement"""
    try:
        instance = BaikalCalendarObject.objects.using('baikal').get(id=pk)
    except BaikalCalendarObject.DoesNotExist:
        return Response({'error': 'Événement non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = BaikalEventSerializer(instance)
        return Response(serializer.data)

    # Vérifier accès
    user = request.user
    has_access = BaikalCalendarInstance.objects.using('baikal').filter(
        calendarid=instance.calendarid,
        principaluri__contains=user.username
    ).exists()
    if not has_access:
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    if request.method in ['PUT', 'PATCH']:
        data = request.data
        try:
            print(f"=== UPDATE EVENT VIA CALDAV ===")
            print(f"Event ID: {pk}")
            print(f"Data: {dict(data)}")

            # Obtenir le calendrier CalDAV
            client, caldav_calendar = get_caldav_calendar_for_id(user, instance.calendarid)
            if not caldav_calendar:
                return Response(
                    {'error': 'Impossible de se connecter au calendrier CalDAV'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Récupérer l'événement existant via CalDAV
            event_uri = instance.uri_str
            target_event = CalDAVService.find_event_by_uri(caldav_calendar, event_uri)

            if not target_event:
                return Response(
                    {'error': 'Événement non trouvé sur le serveur CalDAV'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Préparer les nouvelles valeurs
            title = data.get('title')
            description = data.get('description')
            start_date = None
            end_date = None
            is_completed = None

            if 'start_date' in data:
                start_date = datetime.fromisoformat(data['start_date'].replace('Z', '+00:00'))
            if 'end_date' in data:
                end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
            if 'is_completed' in data:
                is_completed = data['is_completed']

            # Mettre à jour l'événement via CalDAVService
            success = CalDAVService.update_event(
                event=target_event,
                title=title,
                description=description,
                start_date=start_date,
                end_date=end_date,
                is_completed=is_completed
            )

            if not success:
                return Response(
                    {'error': 'Erreur lors de la mise à jour de l\'événement'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            print(f"✅ Événement mis à jour via CalDAV")

            # Attendre un peu pour que la base soit mise à jour
            import time
            time.sleep(0.5)

            # Relire depuis la base
            instance.refresh_from_db(using='baikal')
            serializer = BaikalEventSerializer(instance)
            return Response(serializer.data)

        except Exception as e:
            import traceback
            print(f"❌ ERROR in event update:")
            print(traceback.format_exc())
            return Response({'error': f'Erreur lors de la mise à jour: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if request.method == 'DELETE':
        try:
            print(f"=== DELETE EVENT VIA CALDAV ===")
            print(f"Event ID: {pk}")

            # Obtenir le calendrier CalDAV
            client, caldav_calendar = get_caldav_calendar_for_id(user, instance.calendarid)
            if not caldav_calendar:
                return Response(
                    {'error': 'Impossible de se connecter au calendrier CalDAV'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Récupérer l'événement existant via CalDAV
            event_uri = instance.uri_str
            target_event = CalDAVService.find_event_by_uri(caldav_calendar, event_uri)

            if target_event:
                success = CalDAVService.delete_event(target_event)
                if not success:
                    return Response(
                        {'error': 'Erreur lors de la suppression de l\'événement'},
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )
                print(f"✅ Événement supprimé via CalDAV")

            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            import traceback
            print(f"❌ ERROR in event deletion:")
            print(traceback.format_exc())
            return Response({'error': f'Erreur lors de la suppression: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
