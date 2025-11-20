from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import TaskViewSet, signup, login, user_profile, update_profile

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

    # Routes des tâches
    path('', include(router.urls)),
]

