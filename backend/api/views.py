from django.contrib.auth import authenticate
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Task, CalDAVConfig
from .serializers import TaskSerializer, UserSerializer, CalDAVConfigSerializer
from .caldav_service import CalDAVService


@api_view(['POST'])
@permission_classes([AllowAny])
def signup(request):
    """Inscription d'un nouvel utilisateur"""
    serializer = UserSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """Connexion d'un utilisateur"""
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response({
            'error': 'Veuillez fournir un nom d\'utilisateur et un mot de passe'
        }, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(username=username, password=password)

    if user is not None:
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        })
    else:
        return Response({
            'error': 'Identifiants invalides'
        }, status=status.HTTP_401_UNAUTHORIZED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_profile(request):
    """Récupérer le profil de l'utilisateur connecté"""
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """Mettre à jour le profil de l'utilisateur"""
    user = request.user
    serializer = UserSerializer(user, data=request.data, partial=True)
    if serializer.is_valid():
        # Ne pas permettre la modification du mot de passe via cette route
        if 'password' in request.data:
            return Response({
                'error': 'Utilisez une route dédiée pour changer le mot de passe'
            }, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'POST', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def caldav_config(request):
    """Gérer la configuration CalDAV de l'utilisateur"""

    if request.method == 'GET':
        try:
            config = CalDAVConfig.objects.get(user=request.user)
            serializer = CalDAVConfigSerializer(config)
            return Response(serializer.data)
        except CalDAVConfig.DoesNotExist:
            return Response({
                'error': 'Configuration CalDAV non trouvée',
                'configured': False
            }, status=status.HTTP_404_NOT_FOUND)

    elif request.method == 'POST' or request.method == 'PUT':
        try:
            config = CalDAVConfig.objects.get(user=request.user)
            serializer = CalDAVConfigSerializer(config, data=request.data, partial=True)
        except CalDAVConfig.DoesNotExist:
            serializer = CalDAVConfigSerializer(data=request.data)

        if serializer.is_valid():
            config = serializer.save(user=request.user)

            # Tester la connexion
            service = CalDAVService(config)
            if service.connect():
                return Response({
                    **CalDAVConfigSerializer(config).data,
                    'connection_status': 'success'
                })
            else:
                return Response({
                    **CalDAVConfigSerializer(config).data,
                    'connection_status': 'failed',
                    'message': 'Configuration sauvegardée mais impossible de se connecter au serveur'
                }, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        try:
            config = CalDAVConfig.objects.get(user=request.user)
            config.delete()
            return Response({'message': 'Configuration supprimée'}, status=status.HTTP_204_NO_CONTENT)
        except CalDAVConfig.DoesNotExist:
            return Response({'error': 'Configuration non trouvée'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sync_caldav(request):
    """Synchroniser les tâches avec CalDAV"""
    try:
        config = CalDAVConfig.objects.get(user=request.user)
    except CalDAVConfig.DoesNotExist:
        return Response({
            'error': 'Configuration CalDAV non trouvée. Veuillez configurer CalDAV d\'abord.'
        }, status=status.HTTP_404_NOT_FOUND)

    service = CalDAVService(config)
    stats = service.sync_all(request.user)

    return Response({
        'message': 'Synchronisation terminée',
        'stats': stats
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def test_caldav_connection(request):
    """Tester la connexion CalDAV"""
    try:
        config = CalDAVConfig.objects.get(user=request.user)
    except CalDAVConfig.DoesNotExist:
        return Response({
            'error': 'Configuration CalDAV non trouvée'
        }, status=status.HTTP_404_NOT_FOUND)

    service = CalDAVService(config)
    if service.connect():
        calendar_name = service.calendar.name if service.calendar else 'Aucun'
        return Response({
            'success': True,
            'message': 'Connexion réussie',
            'calendar': calendar_name
        })
    else:
        return Response({
            'success': False,
            'message': 'Échec de la connexion'
        }, status=status.HTTP_400_BAD_REQUEST)


class TaskViewSet(viewsets.ModelViewSet):
    """ViewSet pour gérer les tâches de l'agenda"""
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Retourner uniquement les tâches de l'utilisateur connecté"""
        return Task.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        """Associer la tâche à l'utilisateur connecté et synchroniser avec CalDAV"""
        task = serializer.save(user=self.request.user)

        # Synchroniser avec CalDAV si configuré
        try:
            config = CalDAVConfig.objects.get(user=self.request.user)
            if config.sync_enabled:
                service = CalDAVService(config)
                service.push_task(task)
        except CalDAVConfig.DoesNotExist:
            pass  # Pas de configuration CalDAV, continuer normalement

    def perform_update(self, serializer):
        """Mettre à jour la tâche et synchroniser avec CalDAV"""
        task = serializer.save()

        # Synchroniser avec CalDAV si configuré
        try:
            config = CalDAVConfig.objects.get(user=self.request.user)
            if config.sync_enabled:
                service = CalDAVService(config)
                service.push_task(task)
        except CalDAVConfig.DoesNotExist:
            pass

    def perform_destroy(self, instance):
        """Supprimer la tâche et synchroniser avec CalDAV"""
        # Supprimer de CalDAV d'abord
        try:
            config = CalDAVConfig.objects.get(user=self.request.user)
            if config.sync_enabled:
                service = CalDAVService(config)
                service.delete_task(instance)
        except CalDAVConfig.DoesNotExist:
            pass

        instance.delete()

    @action(detail=False, methods=['post'])
    def sync(self, request):
        """Action personnalisée pour synchroniser toutes les tâches"""
        try:
            config = CalDAVConfig.objects.get(user=request.user)
        except CalDAVConfig.DoesNotExist:
            return Response({
                'error': 'Configuration CalDAV non trouvée'
            }, status=status.HTTP_404_NOT_FOUND)

        service = CalDAVService(config)
        stats = service.sync_all(request.user)

        return Response({
            'message': 'Synchronisation terminée',
            'stats': stats
        })
