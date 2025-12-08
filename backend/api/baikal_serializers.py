"""
Serializers pour les modèles Baikal
Convertissent les données MySQL Baikal en JSON pour le frontend
"""
from rest_framework import serializers
from .baikal_models import (
    BaikalCalendarInstance,
    BaikalCalendarObject,
    BaikalUser,
    BaikalPrincipal
)
from icalendar import Calendar
from datetime import datetime
import pytz
from django.utils import timezone


class BaikalCalendarSerializer(serializers.ModelSerializer):
    """Serializer pour les calendriers Baikal"""
    uri = serializers.SerializerMethodField()
    color = serializers.SerializerMethodField()
    principaluri = serializers.SerializerMethodField()
    username = serializers.SerializerMethodField()
    is_enabled = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()

    class Meta:
        model = BaikalCalendarInstance
        fields = (
            'id', 'calendarid', 'principaluri', 'username', 'access',
            'displayname', 'name', 'uri', 'description', 'calendarorder',
            'color', 'display', 'is_enabled', 'defined_name', 'user_id'
        )
    
    def get_uri(self, obj):
        """Convertir l'URI en string"""
        return obj.uri_str
    
    def get_color(self, obj):
        """Convertir la couleur en string"""
        return obj.color_str
    
    def get_principaluri(self, obj):
        """Convertir le principaluri en string"""
        return obj.principaluri_str
    
    def get_username(self, obj):
        """Extraire le username du principaluri"""
        principaluri = obj.principaluri_str
        if principaluri and 'principals/' in principaluri:
            return principaluri.split('principals/')[-1]
        return None

    def get_is_enabled(self, obj):
        """Convertir display en is_enabled pour compatibilité frontend"""
        return obj.display == 1

    def get_name(self, obj):
        """Alias pour displayname pour compatibilité frontend"""
        return obj.displayname or obj.defined_name or 'Calendrier'


class BaikalEventSerializer(serializers.ModelSerializer):
    """Serializer pour les événements Baikal"""
    title = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    start_date = serializers.SerializerMethodField()
    end_date = serializers.SerializerMethodField()
    is_completed = serializers.SerializerMethodField()
    uid = serializers.SerializerMethodField()
    etag = serializers.SerializerMethodField()
    uri = serializers.SerializerMethodField()
    calendar_id = serializers.IntegerField(source='calendarid')
    calendar_source = serializers.IntegerField(source='calendarid')  # Alias pour compatibilité
    calendar_source_name = serializers.SerializerMethodField()
    calendar_source_color = serializers.SerializerMethodField()

    class Meta:
        model = BaikalCalendarObject
        fields = (
            'id', 'calendar_id', 'calendar_source', 'uid', 'etag', 'uri',
            'title', 'description', 'start_date', 'end_date',
            'is_completed', 'lastmodified',
            'calendar_source_name', 'calendar_source_color'
        )
    
    def get_uid(self, obj):
        """Convertir l'UID en string"""
        return obj.uid_str
    
    def get_etag(self, obj):
        """Convertir l'etag en string"""
        return obj.etag_str
    
    def get_uri(self, obj):
        """Convertir l'URI en string"""
        return obj.uri_str
    
    def _parse_ical(self, obj):
        """Parser les données iCalendar"""
        try:
            ical_data = obj.calendardata_str
            if not ical_data:
                return None
            
            cal = Calendar.from_ical(ical_data)
            
            for component in cal.walk():
                if component.name == "VEVENT":
                    return component
            
            return None
        except Exception as e:
            print(f"Erreur parsing iCal: {e}")
            return None
    
    def get_title(self, obj):
        """Extraire le titre de l'événement"""
        component = self._parse_ical(obj)
        if component:
            return str(component.get('summary', 'Sans titre'))
        return 'Sans titre'
    
    def get_description(self, obj):
        """Extraire la description"""
        component = self._parse_ical(obj)
        if component:
            return str(component.get('description', ''))
        return ''
    
    def get_start_date(self, obj):
        """Extraire la date de début"""
        component = self._parse_ical(obj)
        if component:
            dtstart = component.get('dtstart')
            if dtstart:
                dt = dtstart.dt
                # Convertir en datetime si c'est une date
                if not isinstance(dt, datetime):
                    dt = datetime.combine(dt, datetime.min.time())
                    dt = pytz.UTC.localize(dt)
                
                # Assurer que la date a un timezone
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt)
                
                return dt.isoformat()
        return None
    
    def get_end_date(self, obj):
        """Extraire la date de fin"""
        component = self._parse_ical(obj)
        if component:
            dtend = component.get('dtend')
            if dtend:
                dt = dtend.dt
                # Convertir en datetime si c'est une date
                if not isinstance(dt, datetime):
                    dt = datetime.combine(dt, datetime.min.time())
                    dt = pytz.UTC.localize(dt)
                
                # Assurer que la date a un timezone
                if timezone.is_naive(dt):
                    dt = timezone.make_aware(dt)
                
                return dt.isoformat()
        return None
    
    def get_is_completed(self, obj):
        """Vérifier si l'événement est complété"""
        component = self._parse_ical(obj)
        if component:
            status = component.get('status', 'CONFIRMED')
            return str(status) == 'COMPLETED'
        return False

    def get_calendar_source_name(self, obj):
        """Récupérer le nom du calendrier"""
        try:
            calendar = BaikalCalendarInstance.objects.using('baikal').filter(
                calendarid=obj.calendarid
            ).first()
            if calendar:
                return calendar.displayname or calendar.defined_name or 'Calendrier'
        except:
            pass
        return None

    def get_calendar_source_color(self, obj):
        """Récupérer la couleur du calendrier"""
        try:
            calendar = BaikalCalendarInstance.objects.using('baikal').filter(
                calendarid=obj.calendarid
            ).first()
            if calendar:
                return calendar.color_str or '#005f82'
        except:
            pass
        return '#005f82'

