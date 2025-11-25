from django.contrib.auth import authenticate, get_user_model
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
import threading
import caldav

from .models import Task, CalDAVConfig, CalendarSource
from .serializers import (
    TaskSerializer, UserSerializer, CalDAVConfigSerializer,
    CalendarSourceSerializer, UserCreateSerializer
)
from .caldav_service import CalDAVService

User = get_user_model()


@api_view(['POST'])
@permission_classes([AllowAny])
def signup(request):
    """Inscription d'un nouvel utilisateur"""
    serializer = UserCreateSerializer(data=request.data)
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
        """
        Retourner les tâches de l'utilisateur connecté et les tâches
        des calendriers partagés avec lui.
        """
        # Tâches de l'utilisateur
        user_tasks = Task.objects.filter(user=self.request.user)

        # Tâches des calendriers partagés avec l'utilisateur
        shared_calendar_sources = CalendarSource.objects.filter(shared_with=self.request.user)
        shared_tasks = Task.objects.filter(calendar_source__in=shared_calendar_sources)

        # Combiner les deux querysets
        queryset = user_tasks | shared_tasks
        
        # Filtrage par date pour pagination (optimisation)
        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)

        if start_date and end_date:
            # Retourner les tâches qui se chevauchent avec la période demandée
            queryset = queryset.filter(
                start_date__lte=end_date,
                end_date__gte=start_date
            )

        return queryset.order_by('start_date')

    def perform_create(self, serializer):
        """Associer la tâche à l'utilisateur connecté et synchroniser avec CalDAV en arrière-plan"""
        task = serializer.save(user=self.request.user)

        # Synchroniser avec CalDAV en arrière-plan si configuré (non bloquant)
        def sync_to_caldav():
            try:
                config = CalDAVConfig.objects.get(user=self.request.user)
                if config.sync_enabled:
                    service = CalDAVService(config)
                    service.push_task(task)
            except CalDAVConfig.DoesNotExist:
                pass  # Pas de configuration CalDAV, continuer normalement
            except Exception as e:
                print(f"Erreur lors de la synchronisation CalDAV en arrière-plan: {e}")

        # Lancer la synchronisation dans un thread séparé (non bloquant)
        thread = threading.Thread(target=sync_to_caldav, daemon=True)
        thread.start()

    def perform_update(self, serializer):
        """Mettre à jour la tâche et synchroniser avec CalDAV en arrière-plan"""
        task = serializer.save()

        # Synchroniser avec CalDAV en arrière-plan si configuré (non bloquant)
        def sync_to_caldav():
            try:
                config = CalDAVConfig.objects.get(user=self.request.user)
                if config.sync_enabled:
                    service = CalDAVService(config)
                    service.push_task(task)
            except CalDAVConfig.DoesNotExist:
                pass
            except Exception as e:
                print(f"Erreur lors de la synchronisation CalDAV en arrière-plan: {e}")

        # Lancer la synchronisation dans un thread séparé (non bloquant)
        thread = threading.Thread(target=sync_to_caldav, daemon=True)
        thread.start()

    def perform_destroy(self, instance):
        """Supprimer la tâche et synchroniser avec CalDAV en arrière-plan"""
        # Sauvegarder les informations nécessaires avant suppression
        caldav_uid = instance.caldav_uid
        user = self.request.user

        # Supprimer la tâche localement d'abord (retour immédiat au client)
        instance.delete()

        # Supprimer de CalDAV en arrière-plan si configuré (non bloquant)
        def delete_from_caldav():
            try:
                config = CalDAVConfig.objects.get(user=user)
                if config.sync_enabled and caldav_uid:
                    service = CalDAVService(config)
                    # Créer un objet temporaire pour la suppression
                    class TempTask:
                        def __init__(self, uid):
                            self.caldav_uid = uid

                    temp_task = TempTask(caldav_uid)
                    service.delete_task(temp_task)
            except CalDAVConfig.DoesNotExist:
                pass
            except Exception as e:
                print(f"Erreur lors de la suppression CalDAV en arrière-plan: {e}")

        # Lancer la suppression dans un thread séparé (non bloquant)
        if caldav_uid:
            thread = threading.Thread(target=delete_from_caldav, daemon=True)
            thread.start()

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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def discover_calendars(request):
    """Découvrir et lister tous les calendriers CalDAV disponibles"""
    try:
        config = CalDAVConfig.objects.get(user=request.user)
    except CalDAVConfig.DoesNotExist:
        return Response({
            'error': 'Configuration CalDAV non trouvée. Veuillez configurer CalDAV d\'abord.'
        }, status=status.HTTP_404_NOT_FOUND)

    try:
        # Se connecter au serveur CalDAV
        client = caldav.DAVClient(
            url=config.caldav_url,
            username=config.username,
            password=config.password
        )
        principal = client.principal()
        calendars = principal.calendars()

        discovered = []
        colors = ['#005f82', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE']

        for idx, cal in enumerate(calendars):
            calendar_name = cal.name or f"Calendrier {idx + 1}"
            calendar_url = cal.url.canonical()

            # Vérifier si ce calendrier existe déjà
            existing = CalendarSource.objects.filter(
                user=request.user,
                calendar_url=calendar_url
            ).first()

            if existing:
                discovered.append(CalendarSourceSerializer(existing).data)
            else:
                # Créer une nouvelle source de calendrier
                new_calendar = CalendarSource.objects.create(
                    user=request.user,
                    name=calendar_name,
                    calendar_url=calendar_url,
                    is_enabled=True,
                    color=colors[idx % len(colors)],
                    caldav_config=config
                )
                discovered.append(CalendarSourceSerializer(new_calendar).data)

        return Response({
            'calendars': discovered,
            'count': len(discovered)
        })

    except Exception as e:
        return Response({
            'error': f'Erreur lors de la découverte des calendriers: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_users(request):
    """Rechercher des utilisateurs par nom d'utilisateur"""
    query = request.query_params.get('query', '')
    if len(query) < 2:
        return Response({'users': []})

    users = User.objects.filter(username__icontains=query).exclude(id=request.user.id)
    serializer = UserSerializer(users, many=True)
    return Response({'users': serializer.data})


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def share_calendar(request, calendar_id):
    """Partager ou révoquer le partage d'un calendrier"""
    try:
        calendar = CalendarSource.objects.get(id=calendar_id, user=request.user)
    except CalendarSource.DoesNotExist:
        return Response({'error': 'Calendrier non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    user_id = request.data.get('user_id')
    try:
        target_user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    try:
        config = CalDAVConfig.objects.get(user=request.user)
        service = CalDAVService(config)
    except CalDAVConfig.DoesNotExist:
        return Response({'error': 'Configuration CalDAV non trouvée'}, status=status.HTTP_400_BAD_REQUEST)

    if request.method == 'POST':
        access_level = request.data.get('access_level', 'read')  # 'read' ou 'read-write'
        
        # Ajouter au modèle
        calendar.shared_with.add(target_user)
        
        # Partager via CalDAV
        if not service.share_calendar(calendar, target_user, access_level):
            # Rollback si le partage CalDAV échoue
            calendar.shared_with.remove(target_user)
            return Response({'error': 'Impossible de partager le calendrier sur le serveur CalDAV'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'message': f'Calendrier partagé avec {target_user.username}'
        }, status=status.HTTP_200_OK)

    elif request.method == 'DELETE':
        # Retirer du modèle
        calendar.shared_with.remove(target_user)
        
        # Révoquer via CalDAV
        if not service.unshare_calendar(calendar, target_user):
            # On ne fait pas de rollback, car on veut que la base de données soit cohérente
            return Response({'error': 'Impossible de révoquer le partage sur le serveur CalDAV, mais la base de données a été mise à jour'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({
            'message': f'Partage révoqué pour {target_user.username}'
        }, status=status.HTTP_200_OK)


@api_view(['PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def update_calendar_source(request, calendar_id):
    """Mettre à jour ou supprimer une source de calendrier"""
    try:
        calendar = CalendarSource.objects.get(id=calendar_id, user=request.user)
    except CalendarSource.DoesNotExist:
        return Response({
            'error': 'Calendrier non trouvé'
        }, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'PUT':
        serializer = CalendarSourceSerializer(calendar, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'DELETE':
        calendar.delete()
        return Response({'message': 'Calendrier supprimé'}, status=status.HTTP_204_NO_CONTENT)