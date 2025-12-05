"""
Test de performance des méthodes de synchronisation
Compare la synchronisation CalDAV classique vs MySQL directe
"""
import os
import sys
import django
import time

# Setup Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from api.models import User
from api.baikal_db_service import BaikalDBService


def test_quick_sync():
    """Test de la synchronisation ultra-rapide"""
    print("\n" + "="*60)
    print("🚀 TEST: Synchronisation ULTRA-RAPIDE (quick_sync)")
    print("="*60)
    
    # Prendre le premier utilisateur
    user = User.objects.first()
    if not user:
        print("❌ Aucun utilisateur trouvé")
        return
    
    print(f"👤 Utilisateur: {user.username}")
    
    # Mesurer le temps
    start_time = time.time()
    
    baikal_service = BaikalDBService()
    stats = baikal_service.quick_sync_user_calendars(user)
    
    elapsed_time = time.time() - start_time
    
    print(f"\n📊 Résultats:")
    print(f"   ⏱️  Temps: {elapsed_time:.3f} secondes")
    print(f"   📅 Calendriers synchronisés: {stats['calendars_synced']}")
    print(f"   ➕ Événements créés: {stats['events_created']}")
    print(f"   ♻️  Événements modifiés: {stats['events_updated']}")
    print(f"   ✅ Événements inchangés: {stats['events_unchanged']}")
    print(f"   ❌ Erreurs: {len(stats['errors'])}")
    
    if stats['errors']:
        print(f"\n⚠️  Erreurs détectées:")
        for error in stats['errors'][:5]:  # Afficher les 5 premières erreurs
            print(f"   - {error}")
    
    return elapsed_time, stats


def test_full_sync():
    """Test de la synchronisation complète"""
    print("\n" + "="*60)
    print("📦 TEST: Synchronisation COMPLÈTE (sync_user_calendars)")
    print("="*60)
    
    user = User.objects.first()
    if not user:
        print("❌ Aucun utilisateur trouvé")
        return
    
    print(f"👤 Utilisateur: {user.username}")
    
    # Mesurer le temps
    start_time = time.time()
    
    baikal_service = BaikalDBService()
    stats = baikal_service.sync_user_calendars(user)
    
    elapsed_time = time.time() - start_time
    
    print(f"\n📊 Résultats:")
    print(f"   ⏱️  Temps: {elapsed_time:.3f} secondes")
    print(f"   📅 Calendriers synchronisés: {stats['calendars_synced']}")
    print(f"   ➕ Événements créés: {stats['events_created']}")
    print(f"   ♻️  Événements modifiés: {stats['events_updated']}")
    print(f"   ❌ Erreurs: {len(stats['errors'])}")
    
    if stats['errors']:
        print(f"\n⚠️  Erreurs détectées:")
        for error in stats['errors'][:5]:
            print(f"   - {error}")
    
    return elapsed_time, stats


def main():
    print("\n" + "🔬 COMPARAISON DES PERFORMANCES DE SYNCHRONISATION ".center(60, "="))
    
    # Test 1: Synchronisation rapide
    quick_time, quick_stats = test_quick_sync()
    
    # Test 2: Synchronisation complète
    full_time, full_stats = test_full_sync()
    
    # Comparaison
    print("\n" + "="*60)
    print("📈 COMPARAISON")
    print("="*60)
    
    if quick_time and full_time:
        improvement = ((full_time - quick_time) / full_time) * 100
        speedup = full_time / quick_time
        
        print(f"\n⚡ Synchronisation rapide: {quick_time:.3f}s")
        print(f"📦 Synchronisation complète: {full_time:.3f}s")
        print(f"\n🎯 Amélioration: {improvement:.1f}%")
        print(f"🚀 Vitesse: {speedup:.2f}x plus rapide")
        
        if quick_time < 1:
            print(f"\n✨ EXCELLENT ! La synchronisation rapide prend moins d'1 seconde !")
        elif quick_time < 2:
            print(f"\n👍 BIEN ! La synchronisation rapide prend moins de 2 secondes.")
        else:
            print(f"\n⚠️  La synchronisation prend encore {quick_time:.1f} secondes...")
    
    print("\n" + "="*60)
    print("💡 RECOMMANDATION")
    print("="*60)
    print("\n👉 Utiliser 'quick_sync_user_calendars()' pour le login")
    print("   Cette méthode vérifie d'abord les etags avant de charger les données.")
    print("\n✅ Avantages:")
    print("   - Ne charge que les événements modifiés")
    print("   - Utilise des requêtes SQL optimisées avec JOIN")
    print("   - Pas besoin de parser iCal pour les événements inchangés")
    print("\n")


if __name__ == '__main__':
    main()

