from rest_framework import serializers
from .models import User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'password', 'username', 'prenom', 'nom', 'token', 'user_id', 'baikal_password', 'application_id')
        extra_kwargs = {
            'password': {'write_only': True},
        }
