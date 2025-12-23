from django.urls import path, include
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework.routers import DefaultRouter
from .views import (
    login,
    user_profile,
    UserUpdateApplicationIdView,
)
from .baikal_views import (
    BaikalCalendarViewSet,
    BaikalEventViewSet,
    search_affairs,
    search_clients,
    get_client_affair_info,
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
    path('auth/update_application_id/<str:email>/', csrf_exempt(UserUpdateApplicationIdView.as_view()), name='update_application_id'),

    # Profil utilisateur
    path('auth/profile/', csrf_exempt(user_profile), name='user_profile'),
    path('search-clients/', csrf_exempt(search_clients), name='search-clients'),
    path('search-affairs/', csrf_exempt(search_affairs), name='search-affairs'),

    # Client et Affaire info
    path('client-affair-info/', csrf_exempt(get_client_affair_info), name='client-affair-info'),

    # API Baikal - Routes REST
    path('', include(router.urls)),
]
