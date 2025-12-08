"""
Vues pour interagir directement avec la base MySQL Baikal
Plus besoin de synchronisation - lecture/écriture directe !
CRUD complet pour calendriers et événements.
"""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.db.models import Q
from icalendar import Calendar as iCalendar, Event as iEvent
from datetime import datetime
import pytz
import uuid

from .baikal_models import (
    BaikalCalendarInstance,
    BaikalCalendarObject,
    BaikalCalendar,
)
from .baikal_serializers import (
    BaikalCalendarSerializer,
    BaikalEventSerializer
)

from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes

# -----------------------------
# Calendars - List / Create
# -----------------------------
@csrf_exempt
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
@csrf_exempt
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
        # Mettre à jour les champs autorisés
        if 'displayname' in data:
            instance.displayname = data['displayname']
        if 'calendarcolor' in data:
            instance.calendarcolor = data['calendarcolor'].encode('utf-8')
        if 'description' in data:
            instance.description = data['description']
        if 'display' in data:
            instance.display = data['display']
        if 'is_enabled' in data:
            instance.display = 1 if data['is_enabled'] else 0

        instance.save(using='baikal')
        serializer = BaikalCalendarSerializer(instance)
        return Response(serializer.data)

    if request.method == 'DELETE':
        # Protéger contre suppression si pas propriétaire
        if not instance.principaluri_str.endswith(request.user.username):
            return Response({'error': 'Vous ne pouvez pas supprimer ce calendrier'}, status=status.HTTP_403_FORBIDDEN)

        # Supprimer tous les événements du calendrier
        BaikalCalendarObject.objects.using('baikal').filter(
            calendarid=instance.calendarid
        ).delete()

        instance.delete(using='baikal')
        return Response(status=status.HTTP_204_NO_CONTENT)

# -----------------------------
# Events - List / Create
# -----------------------------
@csrf_exempt
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

    # POST - création
    data = request.data
    print("=== CREATE EVENT DEBUG ===")
    print(f"User: {user.username}")
    print(f"Data received: {data}")
    print(f"calendar_id in data: {data.get('calendar_id')}")
    print("=========================")

    calendar_id = data.get('calendar_id')
    if not calendar_id:
        return Response({'error': 'calendar_id est requis', 'data_received': dict(data)}, status=status.HTTP_400_BAD_REQUEST)

    # Vérifier accès au calendrier
    try:
        BaikalCalendarInstance.objects.using('baikal').get(
            calendarid=calendar_id,
            principaluri__contains=user.username.encode('utf-8')
        )
    except BaikalCalendarInstance.DoesNotExist:
        return Response({'error': 'Calendrier non trouvé ou accès refusé'}, status=status.HTTP_404_NOT_FOUND)

    try:
        cal = iCalendar()
        event = iEvent()
        event_uid = str(uuid.uuid4())
        event.add('uid', event_uid)
        event.add('summary', data.get('title', 'Sans titre'))
        if data.get('description'):
            event.add('description', data['description'])
        start_date = datetime.fromisoformat(data['start_date'].replace('Z', '+00:00'))
        end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
        event.add('dtstart', start_date)
        event.add('dtend', end_date)
        event.add('status', 'CONFIRMED')
        event.add('dtstamp', datetime.now(pytz.UTC))
        cal.add_component(event)
        ical_string = cal.to_ical().decode('utf-8')
        event_uri = f"{event_uid}.ics"
        now_ts = int(datetime.now().timestamp())
        calendar_object = BaikalCalendarObject.objects.using('baikal').create(
            calendardata=ical_string.encode('utf-8'),
            uri=event_uri.encode('utf-8'),
            calendarid=calendar_id,
            lastmodified=now_ts,
            etag=f'"{event_uid}"'.encode('utf-8'),
            size=len(ical_string),
            componenttype=b'VEVENT',
            firstoccurence=int(start_date.timestamp()),
            lastoccurence=int(end_date.timestamp()),
            uid=event_uid.encode('utf-8')
        )
        baikal_calendar = BaikalCalendar.objects.using('baikal').get(id=calendar_id)
        baikal_calendar.synctoken += 1
        baikal_calendar.save(using='baikal')
        serializer = BaikalEventSerializer(calendar_object)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': f'Erreur lors de la création: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# -----------------------------
# Events - Detail / Update / Delete
# -----------------------------
@csrf_exempt
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
        principaluri__contains=user.username.encode('utf-8')
    ).exists()
    if not has_access:
        return Response({'error': 'Accès refusé'}, status=status.HTTP_403_FORBIDDEN)

    if request.method in ['PUT', 'PATCH']:
        data = request.data
        try:
            ical_data = instance.calendardata_str
            cal = iCalendar.from_ical(ical_data)
            for component in cal.walk():
                if component.name == 'VEVENT':
                    if 'title' in data:
                        component['summary'] = data['title']
                    if 'description' in data:
                        component['description'] = data['description']
                    if 'start_date' in data:
                        start_date = datetime.fromisoformat(data['start_date'].replace('Z', '+00:00'))
                        component['dtstart'] = start_date
                        instance.firstoccurence = int(start_date.timestamp())
                    if 'end_date' in data:
                        end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
                        component['dtend'] = end_date
                        instance.lastoccurence = int(end_date.timestamp())
                    if 'is_completed' in data:
                        component['status'] = 'COMPLETED' if data['is_completed'] else 'CONFIRMED'
                    component['dtstamp'] = datetime.now(pytz.UTC)
            ical_string = cal.to_ical().decode('utf-8')
            instance.calendardata = ical_string.encode('utf-8')
            instance.size = len(ical_string)
            instance.lastmodified = int(datetime.now().timestamp())
            instance.etag = f'"{uuid.uuid4()}"'.encode('utf-8')
            instance.save(using='baikal')
            baikal_calendar = BaikalCalendar.objects.using('baikal').get(id=instance.calendarid)
            baikal_calendar.synctoken += 1
            baikal_calendar.save(using='baikal')
            serializer = BaikalEventSerializer(instance)
            return Response(serializer.data)
        except Exception as e:
            return Response({'error': f'Erreur lors de la mise à jour: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    if request.method == 'DELETE':
        calendar_id = instance.calendarid
        instance.delete(using='baikal')
        try:
            baikal_calendar = BaikalCalendar.objects.using('baikal').get(id=calendar_id)
            baikal_calendar.synctoken += 1
            baikal_calendar.save(using='baikal')
        except Exception:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)
