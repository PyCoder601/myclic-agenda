from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Task, CalDAVConfig, CalendarSource


class UserCreateSerializer(serializers.ModelSerializer):
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

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name')

class UserSharedSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username')

class CalendarSourceSerializer(serializers.ModelSerializer):
    shared_with = UserSharedSerializer(many=True, read_only=True)
    user = UserSharedSerializer(read_only=True)

    class Meta:
        model = CalendarSource
        fields = ('id', 'user', 'name', 'calendar_url', 'is_enabled', 'color', 'created_at', 'updated_at', 'shared_with')
        read_only_fields = ('created_at', 'updated_at', 'shared_with', 'user')



class CalDAVConfigSerializer(serializers.ModelSerializer):
    calendars = CalendarSourceSerializer(many=True, read_only=True)

    class Meta:
        model = CalDAVConfig
        fields = (
            'id', 'caldav_url', 'username', 'password', 'calendar_name',
            'sync_enabled', 'last_sync', 'created_at', 'updated_at', 'calendars'
        )
        extra_kwargs = {
            'password': {'write_only': True},
        }
        read_only_fields = ('last_sync', 'created_at', 'updated_at')


class TaskSerializer(serializers.ModelSerializer):
    calendar_source_name = serializers.CharField(source='calendar_source.name', read_only=True)
    calendar_source_color = serializers.CharField(source='calendar_source.color', read_only=True)

    class Meta:
        model = Task
        fields = (
            'id', 'title', 'description', 'is_completed', 'start_date', 'end_date',
            'created_at', 'updated_at', 'caldav_uid', 'caldav_etag', 'last_synced',
            'calendar_source', 'calendar_source_name', 'calendar_source_color'
        )
        read_only_fields = ('created_at', 'updated_at', 'caldav_uid', 'caldav_etag', 'last_synced',
                           'calendar_source_name', 'calendar_source_color')

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)

