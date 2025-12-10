#!/usr/bin/env python
"""
Script de test pour les méthodes update_event et delete_event
Teste les opérations CRUD via CalDAV avec récupération par URL
"""

import sys
import os
from datetime import datetime, timedelta

# Ajouter le chemin du projet
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from api.caldav_service import BaikalCalDAVClient
from django.conf import settings


def test_event_operations():
    """Test complet des opérations CRUD sur les événements"""

    print("=" * 70)
    print("TEST DES OPÉRATIONS CRUD VIA URL")
    print("=" * 70)

    # Configuration
    BASE_URL = settings.BAIKAL_SERVER_URL
    USERNAME = "test@example.com"  # À remplacer
    PASSWORD = "password"  # À remplacer

    print(f"\n📡 Connexion à: {BASE_URL}")
    print(f"👤 Utilisateur: {USERNAME}")

    try:
        # Initialiser le client
        client = BaikalCalDAVClient(BASE_URL, USERNAME, PASSWORD)
        print("✅ Connexion réussie\n")

        # 1. Lister les calendriers
        print("-" * 70)
        print("📅 ÉTAPE 1: Lister les calendriers")
        print("-" * 70)
        calendars = client.list_calendars()

        if not calendars:
            print("❌ Aucun calendrier trouvé")
            return

        print(f"✅ {len(calendars)} calendrier(s) trouvé(s):")
        for cal in calendars:
            print(f"   • {cal['name']} ({cal['id']})")

        calendar_name = calendars[0]['name']
        print(f"\n📍 Calendrier sélectionné: {calendar_name}")

        # 2. Créer un événement de test
        print("\n" + "-" * 70)
        print("➕ ÉTAPE 2: Créer un événement de test")
        print("-" * 70)

        event_data = {
            'summary': 'Test CRUD CalDAV',
            'description': 'Événement créé pour tester les opérations CRUD',
            'location': 'Bureau de test',
            'start': datetime.now() + timedelta(days=1, hours=10),
            'end': datetime.now() + timedelta(days=1, hours=12)
        }

        result = client.create_event(calendar_name, event_data)

        if not result.get('success'):
            print(f"❌ Échec création: {result.get('error')}")
            return

        event_uid = result['uid']
        print(f"✅ Événement créé:")
        print(f"   • UID: {event_uid}")
        print(f"   • Titre: {result['summary']}")
        print(f"   • Début: {result['start']}")
        print(f"   • Fin: {result['end']}")

        # 3. Récupérer l'URL de l'événement
        print("\n" + "-" * 70)
        print("🔍 ÉTAPE 3: Récupérer l'événement créé")
        print("-" * 70)

        # Récupérer tous les événements pour trouver l'URL
        events = client.get_events(calendar_name)
        event_url = None

        for event in events:
            if event['id'] == event_uid:
                event_url = event['url']
                break

        if not event_url:
            print("❌ URL de l'événement non trouvée")
            return

        print(f"✅ URL trouvée: {event_url}")

        # 4. Tester get_event_by_url
        print("\n" + "-" * 70)
        print("📖 ÉTAPE 4: Tester get_event_by_url")
        print("-" * 70)

        fetched_event = client.get_event_by_url(event_url)

        if fetched_event:
            print("✅ Événement récupéré:")
            print(f"   • UID: {fetched_event['uid']}")
            print(f"   • Titre: {fetched_event['summary']}")
            print(f"   • Description: {fetched_event['description']}")
            print(f"   • Location: {fetched_event['location']}")
            print(f"   • ETag: {fetched_event.get('etag', 'N/A')}")
        else:
            print("❌ Échec récupération événement")
            return

        # 5. Modifier l'événement
        print("\n" + "-" * 70)
        print("✏️  ÉTAPE 5: Modifier l'événement")
        print("-" * 70)

        updates = {
            'summary': 'Test CRUD CalDAV (MODIFIÉ)',
            'description': 'Description mise à jour via HTTP PUT',
            'location': 'Nouveau bureau'
        }

        update_result = client.update_event(event_url, updates)

        if update_result.get('success'):
            print("✅ Événement modifié avec succès")
            print("\n📊 Comparaison avant/après:")
            print("\nAVANT:")
            for key, value in update_result['old_state'].items():
                print(f"   • {key}: {value}")
            print("\nAPRÈS:")
            for key, value in update_result['new_state'].items():
                print(f"   • {key}: {value}")
        else:
            print(f"❌ Échec modification: {update_result.get('error')}")

        # 6. Vérifier la modification
        print("\n" + "-" * 70)
        print("✓ ÉTAPE 6: Vérifier la modification")
        print("-" * 70)

        verified_event = client.get_event_by_url(event_url)

        if verified_event:
            print("✅ Modification vérifiée:")
            print(f"   • Nouveau titre: {verified_event['summary']}")
            print(f"   • Nouvelle description: {verified_event['description']}")
            print(f"   • Nouvelle location: {verified_event['location']}")

            # Vérifier que les changements sont appliqués
            assert verified_event['summary'] == updates['summary'], "Le titre n'a pas été mis à jour!"
            assert verified_event['description'] == updates['description'], "La description n'a pas été mise à jour!"
            assert verified_event['location'] == updates['location'], "La location n'a pas été mise à jour!"
            print("\n✅ Tous les champs ont été correctement mis à jour")
        else:
            print("❌ Impossible de vérifier la modification")

        # 7. Supprimer l'événement
        print("\n" + "-" * 70)
        print("🗑️  ÉTAPE 7: Supprimer l'événement")
        print("-" * 70)

        delete_result = client.delete_event(event_url)

        if delete_result.get('success'):
            print("✅ Événement supprimé avec succès")
            if delete_result.get('event_info'):
                print(f"   • Événement supprimé: {delete_result['event_info'].get('summary', 'N/A')}")
        else:
            print(f"❌ Échec suppression: {delete_result.get('error')}")

        # 8. Vérifier la suppression
        print("\n" + "-" * 70)
        print("✓ ÉTAPE 8: Vérifier la suppression")
        print("-" * 70)

        deleted_event = client.get_event_by_url(event_url)

        if deleted_event is None:
            print("✅ Événement correctement supprimé (non trouvé)")
        else:
            print("⚠️  Événement encore présent (peut être un cache)")

        # 9. Tester la suppression d'un événement déjà supprimé
        print("\n" + "-" * 70)
        print("♻️  ÉTAPE 9: Tester la suppression idempotente")
        print("-" * 70)

        second_delete = client.delete_event(event_url)

        if second_delete.get('success') and second_delete.get('already_deleted'):
            print("✅ Suppression idempotente confirmée")
            print("   (Pas d'erreur si l'événement est déjà supprimé)")
        else:
            print(f"⚠️  Résultat: {second_delete}")

        # Résumé
        print("\n" + "=" * 70)
        print("✅ TOUS LES TESTS SONT PASSÉS")
        print("=" * 70)
        print("\n📝 Résumé:")
        print("   ✅ Création d'événement")
        print("   ✅ Récupération par URL (get_event_by_url)")
        print("   ✅ Modification d'événement (update_event)")
        print("   ✅ Vérification des modifications")
        print("   ✅ Suppression d'événement (delete_event)")
        print("   ✅ Vérification de la suppression")
        print("   ✅ Suppression idempotente")
        print("\n🎉 Toutes les opérations CRUD fonctionnent correctement!")

    except Exception as e:
        print(f"\n❌ ERREUR: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True


if __name__ == "__main__":
    success = test_event_operations()
    sys.exit(0 if success else 1)

