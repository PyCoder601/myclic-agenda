from django.urls import path, include
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework.routers import DefaultRouter
from .views import (
    login,
    user_profile
)
from .baikal_views import (
    BaikalCalendarViewSet,
    BaikalEventViewSet,
)

# Router pour les ViewSets Baikal
router = DefaultRouter()
router.register(r'baikal/calendars', BaikalCalendarViewSet, basename='baikal-calendar')
router.register(r'baikal/events', BaikalEventViewSet, basename='baikal-event')

urlpatterns = [
    # Authentification
    # path('auth/signup/', csrf_exempt(signup), name='signup'),
    path('auth/login/', csrf_exempt(login), name='login'),
    path('auth/token/refresh/', csrf_exempt(TokenRefreshView.as_view()), name='token_refresh'),

    # Profil utilisateur
    path('auth/profile/', csrf_exempt(user_profile), name='user_profile'),

    # API Baikal - Routes REST
    path('', include(router.urls)),
]
