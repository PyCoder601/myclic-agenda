from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Task, CalDAVConfig


class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password', 'first_name', 'last_name')
        extra_kwargs = {
            'password': {'write_only': True},
            'email': {'required': True}
        }

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', '')
        )
        return user


class CalDAVConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalDAVConfig
        fields = (
            'id', 'caldav_url', 'username', 'password', 'calendar_name',
            'sync_enabled', 'last_sync', 'created_at', 'updated_at'
        )
        extra_kwargs = {
            'password': {'write_only': True},
        }
        read_only_fields = ('last_sync', 'created_at', 'updated_at')


class TaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = Task
        fields = (
            'id', 'title', 'description', 'is_completed', 'start_date', 'end_date',
            'created_at', 'updated_at', 'caldav_uid', 'caldav_etag', 'last_synced'
        )
        read_only_fields = ('created_at', 'updated_at', 'caldav_uid', 'caldav_etag', 'last_synced')

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

