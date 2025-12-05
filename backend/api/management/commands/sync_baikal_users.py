"""
Commande Django pour synchroniser tous les utilisateurs avec Baikal
Usage: python manage.py sync_baikal_users
"""
from django.core.management.base import BaseCommand
from api.baikal_db_service import BaikalDBService


class Command(BaseCommand):
    help = 'Synchronise tous les utilisateurs avec la base MySQL de Baikal'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--sync-users',
            action='store_true',
            help='Synchroniser également les utilisateurs depuis Baikal',
        )
    
    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('🚀 Début de la synchronisation Baikal...'))
        
        service = BaikalDBService()
        
        # Synchroniser les utilisateurs si demandé
        if options['sync_users']:
            self.stdout.write('📥 Synchronisation des utilisateurs...')
            user_stats = service.sync_users_from_baikal()
            self.stdout.write(
                self.style.SUCCESS(
                    f"✅ Utilisateurs: {user_stats['users_created']} créés, "
                    f"{user_stats['users_updated']} mis à jour"
                )
            )
            
            if user_stats['errors']:
                for error in user_stats['errors']:
                    self.stdout.write(self.style.ERROR(f"❌ {error}"))
        
        # Synchroniser tous les calendriers
        self.stdout.write('📅 Synchronisation des calendriers et événements...')
        stats = service.sync_all_users()
        
        self.stdout.write(
            self.style.SUCCESS(
                f"\n✅ Synchronisation terminée !\n"
                f"   • Utilisateurs synchronisés: {stats['users_synced']}\n"
                f"   • Événements synchronisés: {stats['total_events']}\n"
            )
        )
        
        if stats['errors']:
            self.stdout.write(self.style.WARNING(f"\n⚠️  {len(stats['errors'])} erreurs:"))
            for error in stats['errors'][:10]:  # Afficher seulement les 10 premières
                self.stdout.write(self.style.ERROR(f"   • {error}"))

