#!/usr/bin/env python
"""
Test simple de la synchronisation rapide
Utiliser ce script pour vérifier que tout fonctionne
"""
import os
import sys
import django
import time

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from api.models import User, Task, CalendarSource
from api.baikal_db_service import BaikalDBService


def test_quick_sync():
    """Test de la synchronisation rapide utilisée au login"""
    print("\n" + "="*60)
    print("🧪 TEST DE SYNCHRONISATION RAPIDE (LOGIN)")
    print("="*60 + "\n")
    
    # Prendre le premier utilisateur ou en créer un pour le test
    user = User.objects.first()
    
    if not user:
        print("❌ Aucun utilisateur trouvé dans la base Django")
        print("💡 Créez un utilisateur d'abord avec:")
        print("   python manage.py createsuperuser")
        return
    
    print(f"👤 Utilisateur de test: {user.username} ({user.email})")
    print(f"📊 Données avant sync:")
    print(f"   - Calendriers: {CalendarSource.objects.filter(user=user).count()}")
    print(f"   - Événements: {Task.objects.filter(user=user).count()}")
    
    # Mesurer le temps de synchronisation
    print(f"\n🚀 Démarrage de la synchronisation...")
    start_time = time.time()
    
    try:
        baikal_service = BaikalDBService()
        stats = baikal_service.quick_sync_user_calendars(user)
        
        elapsed_time = time.time() - start_time
        
        print(f"\n✅ Synchronisation terminée en {elapsed_time:.3f} secondes")
        print(f"\n📊 Résultats:")
        print(f"   📅 Calendriers créés: {stats['calendars_synced']}")
        print(f"   ➕ Événements créés: {stats['events_created']}")
        print(f"   ♻️  Événements modifiés: {stats['events_updated']}")
        print(f"   ✅ Événements inchangés: {stats['events_unchanged']}")
        
        if stats['errors']:
            print(f"\n⚠️  Erreurs ({len(stats['errors'])}):")
            for error in stats['errors'][:3]:
                print(f"   - {error}")
        
        # Vérifier les données après sync
        calendars_count = CalendarSource.objects.filter(user=user).count()
        events_count = Task.objects.filter(user=user).count()
        
        print(f"\n📊 Données après sync:")
        print(f"   - Calendriers: {calendars_count}")
        print(f"   - Événements: {events_count}")
        
        # Évaluer la performance
        print(f"\n🎯 Évaluation:")
        if elapsed_time < 0.5:
            print(f"   ⚡ EXCELLENT ! < 500ms")
        elif elapsed_time < 1.0:
            print(f"   ✅ TRÈS BIEN ! < 1 seconde")
        elif elapsed_time < 2.0:
            print(f"   👍 BIEN ! < 2 secondes")
        else:
            print(f"   ⚠️  À optimiser... > 2 secondes")
        
        # Recommandation
        if events_count > 0:
            print(f"\n💡 Recommandation:")
            print(f"   La synchronisation fonctionne correctement.")
            print(f"   Au login, l'utilisateur recevra ses {events_count} événements")
            print(f"   en moins de {elapsed_time:.1f} secondes.")
        else:
            print(f"\n💡 Note:")
            print(f"   Aucun événement trouvé. Vérifiez que:")
            print(f"   1. L'utilisateur existe dans Baikal")
            print(f"   2. Il a des calendriers avec des événements")
            print(f"   3. Les variables BAIKAL_DB_* sont correctes")
        
    except Exception as e:
        print(f"\n❌ ERREUR: {e}")
        print(f"\n🔧 Vérifications:")
        print(f"   1. La base Baikal est accessible:")
        print(f"      Host: {os.getenv('BAIKAL_DB_HOST')}")
        print(f"      Port: {os.getenv('BAIKAL_DB_PORT')}")
        print(f"      Database: {os.getenv('BAIKAL_DB_NAME')}")
        print(f"   2. Les credentials sont corrects")
        print(f"   3. Les tables calendarinstances et calendarobjects existent")
        import traceback
        print(f"\n📋 Traceback:")
        traceback.print_exc()


def test_connection():
    """Test de connexion à la base Baikal"""
    print("\n" + "="*60)
    print("🔌 TEST DE CONNEXION MYSQL BAIKAL")
    print("="*60 + "\n")
    
    try:
        baikal_service = BaikalDBService()
        
        print(f"Configuration:")
        print(f"   Host: {baikal_service.baikal_host}")
        print(f"   Port: {baikal_service.baikal_port}")
        print(f"   Database: {baikal_service.baikal_database}")
        print(f"   User: {baikal_service.baikal_user}")
        
        print(f"\n🔄 Tentative de connexion...")
        
        if baikal_service.connect():
            print(f"✅ Connexion réussie !")
            
            # Lister les utilisateurs Baikal
            users = baikal_service.get_users_from_baikal()
            print(f"\n👥 Utilisateurs Baikal trouvés: {len(users)}")
            for user_data in users[:5]:
                username = user_data['username']
                if isinstance(username, bytes):
                    username = username.decode('utf-8')
                print(f"   - {username}")
            
            if len(users) > 5:
                print(f"   ... et {len(users) - 5} autres")
            
            baikal_service.close()
        else:
            print(f"❌ Impossible de se connecter")
            
    except Exception as e:
        print(f"❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()


def main():
    print("\n" + "🧪 TEST DE SYNCHRONISATION BAIKAL ".center(60, "="))
    
    # Test 1: Connexion
    test_connection()
    
    # Test 2: Synchronisation rapide
    test_quick_sync()
    
    print("\n" + "="*60)
    print("✅ Tests terminés")
    print("="*60 + "\n")


if __name__ == '__main__':
    main()

