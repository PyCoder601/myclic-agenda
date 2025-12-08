from django.urls import path, include
from django.views.decorators.csrf import csrf_exempt
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    TaskViewSet, login, user_profile, update_profile,
    discover_calendars, update_calendar_source, search_users, share_calendar,
    get_all_calendars, get_writable_calendars, UseCreateAPIView, sync_events, sync_calendars_only
)
from .baikal_views import (
    baikal_calendars_list,
    baikal_calendar_detail,
    baikal_events_list,
    baikal_event_detail,
)

router = DefaultRouter()
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    # Authentification
    # path('auth/signup/', csrf_exempt(signup), name='signup'),
    path('auth/login/', csrf_exempt(login), name='login'),
    path('auth/token/refresh/', csrf_exempt(TokenRefreshView.as_view()), name='token_refresh'),
    path('auth/bulk-create/', csrf_exempt(UseCreateAPIView.as_view()), name='bulk_create_users'),


    # Profil utilisateur
    path('auth/profile/', csrf_exempt(user_profile), name='user_profile'),
    path('auth/profile/update/', csrf_exempt(update_profile), name='update_profile'),
    path('users/search/', csrf_exempt(search_users), name='user-search'),

    # Configuration CalDAV
    path('caldav/discover/', csrf_exempt(discover_calendars), name='discover_calendars'),
    path('caldav/calendars/all/', csrf_exempt(get_all_calendars), name='get_all_calendars'),
    path('caldav/calendars/writable/', csrf_exempt(get_writable_calendars), name='get_writable_calendars'),
    path('caldav/calendars/<int:calendar_id>/', csrf_exempt(update_calendar_source), name='update_calendar_source'),
    path('caldav/calendars/<int:calendar_id>/share/', csrf_exempt(share_calendar), name='calendar-share'),
    
    # Synchronisation Baikal
    path('sync/events/', csrf_exempt(sync_events), name='sync_events'),
    path('sync/calendars/', csrf_exempt(sync_calendars_only), name='sync_calendars'),

    # Baikal (accès direct MySQL) - vues fonctionnelles
    path('baikal/calendars/', baikal_calendars_list, name='baikal-calendars-list'),
    path('baikal/calendars/<int:pk>/', baikal_calendar_detail, name='baikal-calendar-detail'),
    path('baikal/events/', baikal_events_list, name='baikal-events-list'),
    path('baikal/events/<int:pk>/', baikal_event_detail, name='baikal-event-detail'),

    # Routes des tâches
    path('', include(router.urls)),
]
