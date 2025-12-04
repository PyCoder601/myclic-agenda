from django.contrib.auth import authenticate
from django.db.models import Q
from rest_framework import viewsets, status, generics
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
import threading
import caldav
from django.conf import settings

from .models import Task, CalendarSource, CalendarShare, User
from .serializers import (
    TaskSerializer, UserSerializer,
    CalendarSourceSerializer
)
from .caldav_service import CalDAVService

#
# @api_view(['POST'])
# @permission_classes([AllowAny])
# def signup(request):
#     """Inscription d'un nouvel utilisateur"""
#     serializer = UserCreateSerializer(data=request.data)
#     if serializer.is_valid():
#         user = serializer.save()
#         refresh = RefreshToken.for_user(user)
#         return Response({
#             'user': UserSerializer(user).data,
#             'refresh': str(refresh),
#             'access': str(refresh.access_token),
#         }, status=status.HTTP_201_CREATED)
#     return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    """Connexion d'un utilisateur"""
    email = request.data.get('email')
    password = request.data.get('password')

    if not email or not password:
        return Response({
            'error': 'Veuillez fournir un nom d\'utilisateur et un mot de passe'
        }, status=status.HTTP_400_BAD_REQUEST)

    username = User.objects.get(email=email).username

    user = authenticate(username=username, password=password)
    print(user)
    service = CalDAVService(user)
    service.connect()
    service.sync_all(user)


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


class TaskViewSet(viewsets.ModelViewSet):
    """ViewSet pour gérer les tâches de l'agenda"""
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Retourner les tâches des calendriers de l'utilisateur
        et des calendriers partagés avec lui.
        """
        user = self.request.user

        # Calendriers partagés avec l'utilisateur (avec n'importe quelle permission)
        shared_calendar_pks = CalendarShare.objects.filter(user=user).values_list('calendar_source_id', flat=True)

        # Critères de filtrage
        # 1. Tâches dans les calendriers de l'utilisateur
        # 2. Tâches dans les calendriers partagés avec l'utilisateur
        # 3. Tâches sans calendrier (personnelles) créées par l'utilisateur
        queryset = Task.objects.filter(
            Q(calendar_source__user=user) |
            Q(calendar_source_id__in=shared_calendar_pks) |
            Q(calendar_source__isnull=True, user=user)
        ).distinct()

        # Filtrage par date pour optimisation
        start_date = self.request.query_params.get('start_date', None)
        end_date = self.request.query_params.get('end_date', None)

        if start_date and end_date:
            queryset = queryset.filter(
                start_date__lte=end_date,
                end_date__gte=start_date
            )

        return queryset.order_by('start_date')

    def check_write_permission(self, user, calendar_source):
        """Vérifie si l'utilisateur a la permission d'écriture sur un calendrier."""
        # Si aucun calendrier, la tâche est personnelle, seul le créateur peut modifier.
        # La logique est gérée par `perform_create` et l'instance de la tâche pour les autres actions.
        if not calendar_source:
            return True

        if calendar_source.user == user:
            return True

        try:
            share = CalendarShare.objects.get(calendar_source=calendar_source, user=user)
            if share.permission == 'write':
                return True
        except CalendarShare.DoesNotExist:
            pass

        return False

    def perform_create(self, serializer):
        """Associer la tâche à l'utilisateur et vérifier les permissions d'écriture."""
        calendar_source = serializer.validated_data.get('calendar_source')

        if calendar_source and not self.check_write_permission(self.request.user, calendar_source):
            raise PermissionDenied("Vous n'avez pas la permission d'ajouter des tâches à ce calendrier.")

        task = serializer.save(user=self.request.user)

        def sync_to_caldav():
            try:
                service = CalDAVService(self.request.user)
                service.push_task(task)
            except Exception as e:
                print(f"Erreur lors de la synchronisation CalDAV en arrière-plan: {e}")

        thread = threading.Thread(target=sync_to_caldav, daemon=True)
        thread.start()

    def perform_update(self, serializer):
        """Vérifier les permissions d'écriture avant de mettre à jour."""
        instance = self.get_object()
        user = self.request.user

        # Vérifier si la source du calendrier a changé
        new_calendar_source = serializer.validated_data.get('calendar_source')
        if new_calendar_source and new_calendar_source != instance.calendar_source:
             if not self.check_write_permission(user, new_calendar_source):
                 raise PermissionDenied("Vous n'avez pas la permission de déplacer cette tâche vers ce calendrier.")

        if not self.check_write_permission(user, instance.calendar_source):
            if instance.user != user:
                raise PermissionDenied("Vous n'avez pas la permission de modifier cette tâche.")

        task = serializer.save()

        def sync_to_caldav():
            try:
                service = CalDAVService(self.request.user)
                service.push_task(task)
            except Exception as e:
                print(f"Erreur lors de la synchronisation CalDAV en arrière-plan: {e}")

        thread = threading.Thread(target=sync_to_caldav, daemon=True)
        thread.start()

    def perform_destroy(self, instance):
        """Vérifier les permissions d'écriture avant de supprimer."""
        if not self.check_write_permission(self.request.user, instance.calendar_source):
             if instance.user != self.request.user:
                raise PermissionDenied("Vous n'avez pas la permission de supprimer cette tâche.")

        caldav_uid = instance.caldav_uid
        user = self.request.user
        instance.delete()

        def delete_from_caldav():
            try:
                service = CalDAVService(self.request.user)
                class TempTask:
                    def __init__(self, uid):
                        self.caldav_uid = uid
                temp_task = TempTask(caldav_uid)
                service.delete_task(temp_task)
            except Exception as e:
                print(f"Erreur lors de la suppression CalDAV en arrière-plan: {e}")

        if caldav_uid:
            thread = threading.Thread(target=delete_from_caldav, daemon=True)
            thread.start()

    @action(detail=False, methods=['post'])
    def sync(self, request):
        """Action personnalisée pour synchroniser toutes les tâches"""
        service = CalDAVService(self.request.user)
        stats = service.sync_all(request.user)

        return Response({'message': 'Synchronisation terminée', 'stats': stats})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def discover_calendars(request):
    """Découvrir et lister tous les calendriers CalDAV disponibles"""
    try:
        # Se connecter au serveur CalDAV
        client = caldav.DAVClient(
            url=settings.BAIKAL_SERVER_URL,
            username=request.user.username,
            password=request.user.baikal_password
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
def get_all_calendars(request):
    """
    Récupérer tous les calendriers : ceux possédés par l\'utilisateur 
    et ceux partagés avec lui.
    """
    user = request.user
    
    # Utilise Q objects pour combiner les querysets
    owned_calendars = Q(user=user)
    shared_calendar_pks = CalendarShare.objects.filter(user=user).values_list('calendar_source_id', flat=True)
    shared_calendars = Q(pk__in=shared_calendar_pks)
    
    all_calendars = CalendarSource.objects.filter(owned_calendars | shared_calendars).distinct()
    
    serializer = CalendarSourceSerializer(all_calendars, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_writable_calendars(request):
    """
    Récupérer tous les calendriers sur lesquels l'utilisateur a des droits d'écriture.
    """
    user = request.user

    # Calendriers possédés par l'utilisateur
    owned_calendars = Q(user=user)

    # Calendriers partagés avec l'utilisateur avec permission 'write'
    shared_calendar_pks = CalendarShare.objects.filter(
        user=user,
        permission='write'
    ).values_list('calendar_source_id', flat=True)
    shared_calendars = Q(pk__in=shared_calendar_pks)

    writable_calendars = CalendarSource.objects.filter(owned_calendars | shared_calendars).distinct()

    serializer = CalendarSourceSerializer(writable_calendars, many=True)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_users(request):
    """Rechercher des utilisateurs par nom d\'utilisateur"""
    query = request.query_params.get('query', '')
    if len(query) < 2:
        return Response({'users': []})

    users = User.objects.filter(username__icontains=query).exclude(id=request.user.id)
    serializer = UserSerializer(users, many=True)
    return Response({'users': serializer.data})


@api_view(['POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def share_calendar(request, calendar_id):
    """Partager, mettre à jour ou révoquer le partage d\'un calendrier."""
    try:
        calendar = CalendarSource.objects.get(id=calendar_id, user=request.user)
    except CalendarSource.DoesNotExist:
        return Response({'error': 'Calendrier non trouvé ou vous n\'avez pas la permission de le partager'}, status=status.HTTP_404_NOT_FOUND)

    user_id = request.data.get('user_id')
    try:
        target_user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return Response({'error': 'Utilisateur non trouvé'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'POST':
        permission = request.data.get('permission', 'read')
        if permission not in ['read', 'write']:
            return Response({'error': 'Permission invalide. Choisissez "read" ou "write".'}, status=status.HTTP_400_BAD_REQUEST)

        share, created = CalendarShare.objects.update_or_create(
            calendar_source=calendar,
            user=target_user,
            defaults={'permission': permission}
        )
        
        message = f'Calendrier partagé avec {target_user.username} (permission: {share.get_permission_display()}).'
        if not created:
            message = f'Permission pour {target_user.username} mise à jour en {share.get_permission_display()}.'
            
        return Response({'message': message}, status=status.HTTP_200_OK)

    elif request.method == 'DELETE':
        try:
            share = CalendarShare.objects.get(calendar_source=calendar, user=target_user)
            share.delete()
            return Response({'message': f'Partage révoqué pour {target_user.username}.'}, status=status.HTTP_200_OK)
        except CalendarShare.DoesNotExist:
            return Response({'error': 'Ce calendrier n\'est pas partagé avec cet utilisateur.'}, status=status.HTTP_404_NOT_FOUND)


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


class UseCreateAPIView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]
