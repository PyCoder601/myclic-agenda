from django.contrib.auth import authenticate
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken


from .models import User
from .myclic_model import Application
from .serializers import (
    UserSerializer,
)

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

    try:
        user_for_auth = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response({'error': 'Identifiants invalides'}, status=status.HTTP_401_UNAUTHORIZED)

    user = authenticate(username=user_for_auth.username, password=password)

    application = Application.objects.using("myclic").get(id=user_for_auth.application_id)

    print(f"Application: {application.id} (ID: {application.entreprise}), {application}")

    print(f"User for auth: {user_for_auth}")

    print("User", type(user.id))

    if user is not None:
        # ✅ Plus besoin de synchronisation !
        # Les données sont lues directement depuis MySQL Baikal
        print(f"✅ Login réussi pour {user.username} - Accès direct MySQL Baikal")

        refresh = RefreshToken.for_user(user)
        return Response({
            'user': {
                'id': user.id,
                'email': user.email,
                'username': user.username,
                'prenom': user.prenom,
                'application_id': user.application_id,
            },
            'application': {
                'id': application.id,
                'entreprise': application.entreprise,
                'adresse': application.adresse,
                'telephone': application.telephone,
                'mail_resp': application.mail_resp,
            },
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


class UserUpdateApplicationIdView(generics.UpdateAPIView):
    """
    Vue pour mettre à jour le champ application_id d'un utilisateur via PATCH.
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [AllowAny]  # Attention: à changer pour une permission plus stricte en production
    lookup_field = 'email'

    def patch(self, request, *args, **kwargs):
        return self.partial_update(request, *args, **kwargs)