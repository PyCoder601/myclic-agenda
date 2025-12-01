from django.urls import path, include
from django.views.decorators.csrf import csrf_exempt
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    TaskViewSet, signup, login, user_profile, update_profile,
    caldav_config, sync_caldav, test_caldav_connection,
    discover_calendars, update_calendar_source, search_users, share_calendar,
    get_all_calendars, get_writable_calendars
)

router = DefaultRouter()
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    # Authentification
    path('auth/signup/', csrf_exempt(signup), name='signup'),
    path('auth/login/', csrf_exempt(login), name='login'),
    path('auth/token/refresh/', csrf_exempt(TokenRefreshView.as_view()), name='token_refresh'),

    # Profil utilisateur
    path('auth/profile/', csrf_exempt(user_profile), name='user_profile'),
    path('auth/profile/update/', csrf_exempt(update_profile), name='update_profile'),
    path('users/search/', csrf_exempt(search_users), name='user-search'),

    # Configuration CalDAV
    path('caldav/config/', csrf_exempt(caldav_config), name='caldav_config'),
    path('caldav/sync/', csrf_exempt(sync_caldav), name='sync_caldav'),
    path('caldav/test/', csrf_exempt(test_caldav_connection), name='test_caldav'),
    path('caldav/discover/', csrf_exempt(discover_calendars), name='discover_calendars'),
    path('caldav/calendars/all/', csrf_exempt(get_all_calendars), name='get_all_calendars'),
    path('caldav/calendars/writable/', csrf_exempt(get_writable_calendars), name='get_writable_calendars'),
    path('caldav/calendars/<int:calendar_id>/', csrf_exempt(update_calendar_source), name='update_calendar_source'),
    path('caldav/calendars/<int:calendar_id>/share/', csrf_exempt(share_calendar), name='calendar-share'),

    # Routes des tâches
    path('', include(router.urls)),
]

