"""
Vues pour interagir directement avec la base MySQL Baikal
Plus besoin de synchronisation - lecture/écriture directe !
CRUD complet pour calendriers et événements.
"""
from rest_framework import viewsets, status
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


class BaikalCalendarViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour les calendriers Baikal - CRUD complet
    Lecture/écriture directe depuis MySQL - temps réel !
    """
    serializer_class = BaikalCalendarSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Récupérer les calendriers de l'utilisateur"""
        user = self.request.user
        username = user.username

        print(f'username: {username}')
        i = 0
        for cal in BaikalCalendarInstance.objects.using('baikal').filter(
            principaluri__contains=username
        ):
            i += 1
            print(f"   - {cal.displayname}")
            if i > 10:
                break
        
        # Récupérer tous les calendriers (personnels et partagés)
        queryset = BaikalCalendarInstance.objects.using('baikal').filter(
            principaluri__contains=username
        )

        print(f"Calendriers trouvés: {queryset.count()}")
        for cal in queryset:
            print(f"   - {cal.displayname}")
        
        return queryset

    def update(self, request, *args, **kwargs):
        """Mettre à jour un calendrier"""
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
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

        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def partial_update(self, request, *args, **kwargs):
        """Mise à jour partielle"""
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Supprimer un calendrier"""
        instance = self.get_object()
        user = request.user

        # Vérifier que l'utilisateur possède ce calendrier
        if not instance.principaluri_str.endswith(user.username):
            return Response(
                {'error': 'Vous ne pouvez pas supprimer ce calendrier'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Supprimer tous les événements du calendrier
        BaikalCalendarObject.objects.using('baikal').filter(
            calendarid=instance.calendarid
        ).delete()

        # Supprimer le calendrier
        instance.delete(using='baikal')

        return Response(status=status.HTTP_204_NO_CONTENT)


class BaikalEventViewSet(viewsets.ModelViewSet):
    """
    ViewSet pour les événements Baikal
    CRUD direct sur MySQL - pas de synchronisation !
    """
    serializer_class = BaikalEventSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """
        Récupérer les événements des calendriers de l'utilisateur
        """
        user = self.request.user
        username = user.username
        
        # 1. Récupérer les IDs des calendriers de l'utilisateur
        user_calendars = BaikalCalendarInstance.objects.using('baikal').filter(
            principaluri__contains=username
        ).values_list('calendarid', flat=True)
        
        # 2. Récupérer les événements de ces calendriers
        queryset = BaikalCalendarObject.objects.using('baikal').filter(
            calendarid__in=list(user_calendars),
            componenttype=b'VEVENT'
        )
        
        # Filtrage par date pour optimisation
        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)
        
        if start_date and end_date:
            # Convertir les dates en timestamp Unix
            try:
                start_ts = int(datetime.fromisoformat(start_date.replace('Z', '+00:00')).timestamp())
                end_ts = int(datetime.fromisoformat(end_date.replace('Z', '+00:00')).timestamp())
                
                queryset = queryset.filter(
                    Q(firstoccurence__lte=end_ts) & Q(lastoccurence__gte=start_ts)
                )
            except:
                pass

            print(f"Événements trouvés: {queryset.count()}")
        
        return queryset.order_by('-lastmodified')
    
    def create(self, request, *args, **kwargs):
        """
        Créer un nouvel événement directement dans MySQL Baikal
        """
        user = request.user
        data = request.data
        
        # Récupérer le calendrier cible
        calendar_id = data.get('calendar_id')
        if not calendar_id:
            return Response(
                {'error': 'calendar_id est requis'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Vérifier que l'utilisateur a accès à ce calendrier
        try:
            calendar = BaikalCalendarInstance.objects.using('baikal').get(
                calendarid=calendar_id,
                principaluri__contains=user.username.encode('utf-8')
            )
        except BaikalCalendarInstance.DoesNotExist:
            return Response(
                {'error': 'Calendrier non trouvé ou accès refusé'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Créer l'événement iCalendar
        try:
            cal = iCalendar()
            event = iEvent()
            
            # UID unique
            event_uid = str(uuid.uuid4())
            event.add('uid', event_uid)
            
            # Titre
            event.add('summary', data.get('title', 'Sans titre'))
            
            # Description
            if data.get('description'):
                event.add('description', data['description'])
            
            # Dates
            start_date = datetime.fromisoformat(data['start_date'].replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(data['end_date'].replace('Z', '+00:00'))
            
            event.add('dtstart', start_date)
            event.add('dtend', end_date)
            
            # Statut
            event.add('status', 'CONFIRMED')
            event.add('dtstamp', datetime.now(pytz.UTC))
            
            cal.add_component(event)
            
            # Convertir en string iCalendar
            ical_string = cal.to_ical().decode('utf-8')
            
            # URI unique pour l'événement
            event_uri = f"{event_uid}.ics"
            
            # Timestamps
            now_ts = int(datetime.now().timestamp())
            
            # Créer l'objet dans MySQL
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
            
            # Mettre à jour le sync token du calendrier
            baikal_calendar = BaikalCalendar.objects.using('baikal').get(id=calendar_id)
            baikal_calendar.synctoken += 1
            baikal_calendar.save(using='baikal')
            
            # Retourner l'événement créé
            serializer = self.get_serializer(calendar_object)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': f'Erreur lors de la création: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def update(self, request, *args, **kwargs):
        """
        Mettre à jour un événement dans MySQL Baikal
        """
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        user = request.user
        data = request.data
        
        # Vérifier l'accès
        calendar = BaikalCalendarInstance.objects.using('baikal').filter(
            calendarid=instance.calendarid,
            principaluri__contains=user.username.encode('utf-8')
        ).first()
        
        if not calendar:
            return Response(
                {'error': 'Accès refusé'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        try:
            # Parser l'iCalendar existant
            ical_data = instance.calendardata_str
            cal = iCalendar.from_ical(ical_data)
            
            # Modifier l'événement
            for component in cal.walk():
                if component.name == "VEVENT":
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
                    
                    # Mettre à jour le timestamp
                    component['dtstamp'] = datetime.now(pytz.UTC)
            
            # Sauvegarder
            ical_string = cal.to_ical().decode('utf-8')
            instance.calendardata = ical_string.encode('utf-8')
            instance.size = len(ical_string)
            instance.lastmodified = int(datetime.now().timestamp())
            instance.etag = f'"{uuid.uuid4()}"'.encode('utf-8')
            instance.save(using='baikal')
            
            # Mettre à jour le synctoken
            baikal_calendar = BaikalCalendar.objects.using('baikal').get(id=instance.calendarid)
            baikal_calendar.synctoken += 1
            baikal_calendar.save(using='baikal')
            
            serializer = self.get_serializer(instance)
            return Response(serializer.data)
            
        except Exception as e:
            return Response(
                {'error': f'Erreur lors de la mise à jour: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def partial_update(self, request, *args, **kwargs):
        """Mise à jour partielle d'un événement"""
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """
        Supprimer un événement de MySQL Baikal
        """
        instance = self.get_object()
        user = request.user
        
        # Vérifier l'accès
        calendar = BaikalCalendarInstance.objects.using('baikal').filter(
            calendarid=instance.calendarid,
            principaluri__contains=user.username.encode('utf-8')
        ).first()
        
        if not calendar:
            return Response(
                {'error': 'Accès refusé'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        calendar_id = instance.calendarid
        
        # Supprimer l'événement
        instance.delete(using='baikal')
        
        # Mettre à jour le synctoken
        try:
            baikal_calendar = BaikalCalendar.objects.using('baikal').get(id=calendar_id)
            baikal_calendar.synctoken += 1
            baikal_calendar.save(using='baikal')
        except:
            pass
        
        return Response(status=status.HTTP_204_NO_CONTENT)

