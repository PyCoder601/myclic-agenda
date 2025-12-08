"""
Modèles Django non-managés qui mappent les tables MySQL Baikal
Ces modèles permettent d'interagir directement avec la base Baikal
sans dupliquer les données dans PostgreSQL
"""
from django.db import models


class BaikalUser(models.Model):
    """Table users de Baikal"""
    id = models.AutoField(primary_key=True, db_column='id')
    username = models.BinaryField(max_length=255, unique=True, db_column='username')
    digesta1 = models.BinaryField(max_length=255, null=True, blank=True, db_column='digesta1')
    
    class Meta:
        managed = False  # Django ne gère pas cette table
        db_table = 'users'
        app_label = 'api'
    
    def __str__(self):
        username = self.username
        if isinstance(username, bytes):
            username = username.decode('utf-8')
        return username
    
    @property
    def username_str(self):
        """Retourne le username en string"""
        if isinstance(self.username, bytes):
            return self.username.decode('utf-8')
        return self.username


class BaikalPrincipal(models.Model):
    """Table principals de Baikal"""
    id = models.AutoField(primary_key=True, db_column='id')
    uri = models.BinaryField(max_length=255, unique=True, db_column='uri')
    email = models.CharField(max_length=255, null=True, blank=True, db_column='email')
    displayname = models.CharField(max_length=80, null=True, blank=True, db_column='displayname')
    user_id = models.IntegerField(null=True, blank=True, db_column='user_id')
    
    class Meta:
        managed = False
        db_table = 'principals'
        app_label = 'api'
    
    def __str__(self):
        return f"{self.displayname or self.email}"
    
    @property
    def uri_str(self):
        """Retourne l'URI en string"""
        if isinstance(self.uri, bytes):
            return self.uri.decode('utf-8')
        return self.uri


class BaikalCalendar(models.Model):
    """Table calendars de Baikal"""
    id = models.AutoField(primary_key=True, db_column='id')
    synctoken = models.IntegerField(db_column='synctoken')
    components = models.BinaryField(max_length=255, null=True, blank=True, db_column='components')
    is_visible = models.BooleanField(default=True, db_column='is_visible')
    
    class Meta:
        managed = False
        db_table = 'calendars'
        app_label = 'api'


class BaikalCalendarInstance(models.Model):
    """Table calendarinstances de Baikal"""
    id = models.AutoField(primary_key=True, db_column='id')
    calendarid = models.IntegerField(db_column='calendarid')
    principaluri = models.BinaryField(max_length=255, null=True, blank=True, db_column='principaluri')
    access = models.IntegerField(db_column='access')
    displayname = models.CharField(max_length=100, null=True, blank=True, db_column='displayname')
    uri = models.BinaryField(max_length=255, null=True, blank=True, db_column='uri')
    description = models.TextField(null=True, blank=True, db_column='description')
    calendarorder = models.IntegerField(db_column='calendarorder')
    calendarcolor = models.BinaryField(max_length=255, null=True, blank=True, db_column='calendarcolor')
    timezone = models.TextField(null=True, blank=True, db_column='timezone')
    transparent = models.BooleanField(default=False, db_column='transparent')
    share_href = models.CharField(max_length=255, null=True, blank=True, db_column='share_href')
    share_displayname = models.CharField(max_length=100, null=True, blank=True, db_column='share_displayname')
    share_invitestatus = models.BooleanField(default=False, db_column='share_invitestatus')
    display = models.BooleanField(default=True, db_column='display')
    defined_name = models.CharField(max_length=100, null=True, blank=True, db_column='defined_name')
    user_id = models.IntegerField(null=True, blank=True, db_column='user_id')
    
    class Meta:
        managed = False
        db_table = 'calendarinstances'
        app_label = 'api'
    
    def __str__(self):
        return self.displayname or str(self.id)
    
    @property
    def principaluri_str(self):
        """Retourne le principaluri en string"""
        if isinstance(self.principaluri, bytes):
            return self.principaluri.decode('utf-8')
        return self.principaluri
    
    @property
    def uri_str(self):
        """Retourne l'URI en string"""
        if isinstance(self.uri, bytes):
            return self.uri.decode('utf-8')
        return self.uri
    
    @property
    def color_str(self):
        """Retourne la couleur en string"""
        if isinstance(self.calendarcolor, bytes):
            color = self.calendarcolor.decode('utf-8')
        else:
            color = self.calendarcolor
        
        if not color or not color.startswith('#'):
            return '#005f82'
        return color


class BaikalCalendarObject(models.Model):
    """Table calendarobjects de Baikal - Contient les événements"""
    id = models.AutoField(primary_key=True, db_column='id')
    calendardata = models.BinaryField(null=True, blank=True, db_column='calendardata')
    uri = models.BinaryField(max_length=255, null=True, blank=True, db_column='uri')
    calendarid = models.IntegerField(db_column='calendarid')
    lastmodified = models.IntegerField(null=True, blank=True, db_column='lastmodified')
    etag = models.BinaryField(max_length=255, null=True, blank=True, db_column='etag')
    size = models.IntegerField(db_column='size')
    componenttype = models.BinaryField(max_length=255, null=True, blank=True, db_column='componenttype')
    firstoccurence = models.IntegerField(null=True, blank=True, db_column='firstoccurence')
    lastoccurence = models.IntegerField(null=True, blank=True, db_column='lastoccurence')
    uid = models.BinaryField(max_length=255, null=True, blank=True, db_column='uid')
    datesDeRecurrence = models.TextField(null=True, blank=True, db_column='datesDeRecurrence')
    
    class Meta:
        managed = False
        db_table = 'calendarobjects'
        app_label = 'api'
    
    def __str__(self):
        uid = self.uid
        if isinstance(uid, bytes):
            uid = uid.decode('utf-8')
        return uid or str(self.id)
    
    @property
    def calendardata_str(self):
        """Retourne les données iCalendar en string"""
        if isinstance(self.calendardata, bytes):
            return self.calendardata.decode('utf-8')
        return self.calendardata
    
    @property
    def uri_str(self):
        """Retourne l'URI en string"""
        if isinstance(self.uri, bytes):
            return self.uri.decode('utf-8')
        return self.uri
    
    @property
    def etag_str(self):
        """Retourne l'etag en string"""
        if isinstance(self.etag, bytes):
            return self.etag.decode('utf-8')
        return self.etag
    
    @property
    def uid_str(self):
        """Retourne l'UID en string"""
        if isinstance(self.uid, bytes):
            return self.uid.decode('utf-8')
        return self.uid
    
    @property
    def componenttype_str(self):
        """Retourne le type de composant en string"""
        if isinstance(self.componenttype, bytes):
            return self.componenttype.decode('utf-8')
        return self.componenttype

