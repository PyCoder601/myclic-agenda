from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    TaskViewSet, signup, login, user_profile, update_profile,
    caldav_config, sync_caldav, test_caldav_connection,
    discover_calendars, update_calendar_source, search_users, share_calendar
)

router = DefaultRouter()
router.register(r'tasks', TaskViewSet, basename='task')

urlpatterns = [
    # Authentification
    path('auth/signup/', signup, name='signup'),
    path('auth/login/', login, name='login'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Profil utilisateur
    path('auth/profile/', user_profile, name='user_profile'),
    path('auth/profile/update/', update_profile, name='update_profile'),
    path('users/search/', search_users, name='user-search'),

    # Configuration CalDAV
    path('caldav/config/', caldav_config, name='caldav_config'),
    path('caldav/sync/', sync_caldav, name='sync_caldav'),
    path('caldav/test/', test_caldav_connection, name='test_caldav'),
    path('caldav/discover/', discover_calendars, name='discover_calendars'),
    path('caldav/calendars/<int:calendar_id>/', update_calendar_source, name='update_calendar_source'),
    path('caldav/calendars/<int:calendar_id>/share/', share_calendar, name='calendar-share'),

    # Routes des tâches
    path('', include(router.urls)),
]

