#!/usr/bin/env python
"""
Script de test pour vérifier que l'API Baikal fonctionne correctement
"""
import os
import sys
import django

# Ajouter le répertoire parent au path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Configuration Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from api.baikal_models import BaikalCalendarInstance, BaikalCalendarObject
from api.baikal_serializers import BaikalCalendarSerializer, BaikalEventSerializer

def test_calendars():
    """Tester la récupération des calendriers"""
    print("\n" + "="*50)
    print("TEST: Récupération des calendriers")
    print("="*50)
    
    try:
        calendars = BaikalCalendarInstance.objects.using('baikal').all()[:5]
        print(f"✅ {calendars.count()} calendriers trouvés")
        
        for cal in calendars:
            print(f"\n📅 Calendrier ID: {cal.id}")
            print(f"   - calendarid: {cal.calendarid}")
            print(f"   - displayname: {cal.displayname}")
            print(f"   - principaluri: {cal.principaluri_str}")
            print(f"   - color: {cal.color_str}")
            print(f"   - display: {cal.display}")
            
            # Test du serializer
            serializer = BaikalCalendarSerializer(cal)
            data = serializer.data
            print(f"   - Sérialisé: is_enabled={data.get('is_enabled')}, name={data.get('name')}")
            
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()

def test_events():
    """Tester la récupération des événements"""
    print("\n" + "="*50)
    print("TEST: Récupération des événements")
    print("="*50)
    
    try:
        events = BaikalCalendarObject.objects.using('baikal').filter(
            componenttype=b'VEVENT'
        )[:5]
        print(f"✅ {events.count()} événements trouvés")
        
        for event in events:
            print(f"\n📆 Événement ID: {event.id}")
            print(f"   - calendarid: {event.calendarid}")
            print(f"   - uid: {event.uid_str}")
            print(f"   - firstoccurence: {event.firstoccurence}")
            
            # Test du serializer
            serializer = BaikalEventSerializer(event)
            data = serializer.data
            print(f"   - Sérialisé:")
            print(f"     • title: {data.get('title')}")
            print(f"     • start_date: {data.get('start_date')}")
            print(f"     • calendar_source: {data.get('calendar_source')}")
            print(f"     • calendar_source_name: {data.get('calendar_source_name')}")
            print(f"     • calendar_source_color: {data.get('calendar_source_color')}")
            
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    print("\n🧪 TEST DE L'API BAIKAL")
    print("="*50)
    
    test_calendars()
    test_events()
    
    print("\n" + "="*50)
    print("✅ Tests terminés")
    print("="*50 + "\n")

