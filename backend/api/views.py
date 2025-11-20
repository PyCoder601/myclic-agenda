from django.contrib.auth import authenticate
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Task
from .serializers import TaskSerializer, UserSerializer


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


class TaskViewSet(viewsets.ModelViewSet):
    """ViewSet pour gérer les tâches de l'agenda"""
    serializer_class = TaskSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """Retourner uniquement les tâches de l'utilisateur connecté"""
        return Task.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        """Associer la tâche à l'utilisateur connecté"""
        serializer.save(user=self.request.user)
