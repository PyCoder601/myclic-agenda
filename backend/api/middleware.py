"""
Middleware pour désactiver CSRF sur les routes API
Nécessaire pour les API JWT qui n'utilisent pas de cookies de session
"""
from django.utils.deprecation import MiddlewareMixin


class DisableCSRFMiddleware(MiddlewareMixin):
    """
    Désactive la vérification CSRF pour toutes les routes API
    Utilisé car l'API utilise JWT (pas de cookies de session)
    """
    def process_request(self, request):
        # Désactiver CSRF pour toutes les routes /api/
        if request.path.startswith('/api/'):
            setattr(request, '_dont_enforce_csrf_checks', True)
        return None

