"""
Routeur de base de données pour diriger les requêtes vers la bonne DB
- Modèles Baikal -> MySQL Baikal
- Autres modèles -> PostgreSQL
"""


class BaikalRouter:
    """
    Routeur pour diriger les opérations sur les modèles Baikal vers MySQL
    et les autres vers PostgreSQL
    """
    
    baikal_models = {
        'baikaluser',
        'baikalcalendar',
        'baikalcalendarinstance',
        'baikalcalendarobject',
        'baikalprincipal',
    }
    
    def db_for_read(self, model, **hints):
        """Diriger les lectures"""
        if model._meta.model_name in self.baikal_models:
            return 'baikal'
        return 'default'
    
    def db_for_write(self, model, **hints):
        """Diriger les écritures"""
        if model._meta.model_name in self.baikal_models:
            return 'baikal'
        return 'default'
    
    def allow_relation(self, obj1, obj2, **hints):
        """Autoriser les relations entre modèles de la même DB"""
        db_set = {'baikal', 'default'}
        if obj1._state.db in db_set and obj2._state.db in db_set:
            return True
        return None
    
    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """
        Ne pas appliquer les migrations sur la DB Baikal
        Les modèles Baikal sont en lecture seule (unmanaged)
        """
        if model_name in self.baikal_models:
            return db == 'baikal'
        return db == 'default'

