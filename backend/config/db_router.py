class DatabaseRouter:
    """
    Router multi-DB :
    - default : PostgreSQL (users, auth, core)
    - baikal  : MySQL Baikal (read/write, no migrations)
    - legacy  : MySQL legacy Application (read/write, no migrations)
    """

    baikal_models = { 'baikaluser', 'baikalcalendar', 'baikalcalendarinstance', 'baikalcalendarobject', 'baikalprincipal'}
    myclic_models = {"application", "compte", "affaire"}

    # -------------------------
    # READ
    # -------------------------
    def db_for_read(self, model, **hints):
        if model._meta.app_label in self.baikal_models:
            return "baikal"
        if model._meta.app_label in self.myclic_models:
            return "myclic"
        return "default"

    # -------------------------
    # WRITE
    # -------------------------
    def db_for_write(self, model, **hints):
        if model._meta.app_label in self.baikal_models:
            return "baikal"
        if model._meta.app_label in self.myclic_models:
            return "myclic"
        return "default"

    # -------------------------
    # RELATIONS
    # -------------------------
    def allow_relation(self, obj1, obj2, **hints):
        # Autoriser relations UNIQUEMENT dans la même DB
        if obj1._state.db == obj2._state.db:
            return True
        return False

    # -------------------------
    # MIGRATIONS
    # -------------------------
    def allow_migrate(self, db, app_label, model_name=None, **hints):
        # ❌ Jamais de migration sur MySQL
        if db in {"baikal", "myclic"}:
            return False
        # ✅ Migrations uniquement sur PostgreSQL
        return db == "default"
