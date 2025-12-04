from rest_framework import serializers
from .models import User
from .models import Task, CalendarSource, CalendarShare


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'email', 'password', 'username', 'prenom', 'nom', 'token', 'user_id', 'baikal_password')
        extra_kwargs = {
            'password': {'write_only': True},
        }
    def create(self, validated_data):
        user = User.objects.create_user(
            email=validated_data['email'],
            username=validated_data['username'],
            password=validated_data['password'],
            prenom=validated_data.get('prenom', ''),
            nom=validated_data.get('nom', ''),
            token=validated_data.get('token', ''),
            user_id=validated_data.get('user_id', None),
            baikal_password=validated_data.get('baikal_password', '')
        )
        return user

class UserSharedSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username')

class CalendarShareSerializer(serializers.ModelSerializer):
    user = UserSharedSerializer(read_only=True)

    class Meta:
        model = CalendarShare
        fields = ('id', 'user', 'permission')


class CalendarSourceSerializer(serializers.ModelSerializer):
    shares = CalendarShareSerializer(source='calendarshare_set', many=True, read_only=True)
    user = UserSharedSerializer(read_only=True)

    class Meta:
        model = CalendarSource
        fields = ('id', 'user', 'name', 'calendar_url', 'is_enabled', 'color', 'created_at', 'updated_at', 'shares')
        read_only_fields = ('created_at', 'updated_at', 'shares', 'user')


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

