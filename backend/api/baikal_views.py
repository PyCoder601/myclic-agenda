"""
Vues pour l'API Baikal
Architecture CalDAV pure: Toutes les opérations via le client CalDAV
"""
import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from datetime import datetime, timedelta
from .caldav_service import BaikalCalDAVClient
from .models import BaikalCalendarPreference

logger = logging.getLogger(__name__)


class BaikalCalendarViewSet(viewsets.ViewSet):
    """
    ViewSet pour gérer les calendriers Baikal
    Utilise uniquement le client CalDAV (pas d'accès MySQL direct)
    """
    permission_classes = [IsAuthenticated]

    def _get_caldav_client(self):
        """Initialise le client CalDAV pour l'utilisateur"""
        user = self.request.user

        # Récupérer le mot de passe stocké
        password = user.baikal_password

        if not password:
            logger.warning(f"Mot de passe Baikal non disponible pour {user.email}")
            return None

        return BaikalCalDAVClient(
            base_url=settings.BAIKAL_SERVER_URL,
            username=user.email,
            password=password
        )

    def list(self, request):
        """Liste tous les calendriers de l'utilisateur via CalDAV avec leurs préférences"""
        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible. Veuillez configurer vos identifiants.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Récupérer la liste des calendriers avec détails
            calendars = client.list_calendars(details=True)

            # Charger les préférences utilisateur pour tous les calendriers
            preferences = {}
            for pref in BaikalCalendarPreference.objects.filter(user=request.user):
                preferences[pref.calendar_uri] = {
                    'is_enabled': pref.is_enabled,
                    'color': pref.color
                }

            # Formater pour correspondre au format attendu par le frontend
            formatted_calendars = []
            for idx, cal in enumerate(calendars):
                calendar_uri = cal['id']
                calendar_name = cal['name']
                
                # Vérifier si des préférences existent pour ce calendrier
                if calendar_uri in preferences:
                    # Utiliser les préférences existantes
                    is_enabled = preferences[calendar_uri]['is_enabled']
                    color = preferences[calendar_uri]['color']
                else:
                    # Définir les valeurs par défaut
                    # Calendriers avec parenthèses sont désactivés par défaut
                    has_parentheses = '(' in calendar_name or ')' in calendar_name
                    is_enabled = not has_parentheses
                    color = '#005f82'
                    
                    # Créer la préférence pour la prochaine fois
                    BaikalCalendarPreference.objects.get_or_create(
                        user=request.user,
                        calendar_uri=calendar_uri,
                        defaults={
                            'is_enabled': is_enabled,
                            'color': color
                        }
                    )
                
                formatted_cal = {
                    'id': idx + 1,  # ID temporaire basé sur l'index
                    'calendarid': idx + 1,
                    'principaluri': f'principals/{request.user.email}',
                    'username': request.user.email,
                    'access': 1,  # Propriétaire
                    'displayname': calendar_name,
                    'name': calendar_name,
                    'uri': calendar_uri,
                    'description': '',
                    'calendarorder': idx,
                    'color': color,
                    'display': 1 if is_enabled else 0,  # Pour compatibilité
                    'is_enabled': is_enabled,
                    'defined_name': calendar_uri,
                    'user_id': request.user.id
                }
                formatted_calendars.append(formatted_cal)

            logger.info(f"Récupération de {len(formatted_calendars)} calendrier(s) pour {request.user.email}")

            return Response(formatted_calendars)
        except Exception as e:
            logger.error(f"Erreur récupération calendriers: {e}", exc_info=True)
            return Response(
                {'error': f'Erreur lors de la récupération des calendriers: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def retrieve(self, request, pk=None):
        """Récupère un calendrier spécifique"""
        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            calendars = client.list_calendars(details=True)

            # Convertir pk en index (pk - 1)
            try:
                idx = int(pk) - 1
                if 0 <= idx < len(calendars):
                    cal = calendars[idx]
                    formatted_cal = {
                        'id': int(pk),
                        'calendarid': int(pk),
                        'principaluri': f'principals/{request.user.email}',
                        'username': request.user.email,
                        'access': 1,
                        'displayname': cal['name'],
                        'name': cal['name'],
                        'uri': cal['id'],
                        'description': '',
                        'calendarorder': idx,
                        'color': '#005f82',
                        'display': True,
                        'is_enabled': True,
                        'defined_name': cal['id'],
                        'user_id': request.user.id
                    }
                    return Response(formatted_cal)
                else:
                    return Response(
                        {'error': 'Calendrier non trouvé'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            except (ValueError, IndexError):
                return Response(
                    {'error': 'ID de calendrier invalide'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            logger.error(f"Erreur récupération calendrier {pk}: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def update(self, request, pk=None):
        """
        Met à jour les préférences d'un calendrier (is_enabled, color)
        """
        try:
            # Récupérer tous les calendriers pour trouver le bon URI
            client = self._get_caldav_client()
            if not client:
                return Response(
                    {'error': 'Client CalDAV non disponible'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            calendars = client.list_calendars(details=True)
            
            # Convertir pk en index (pk - 1)
            try:
                idx = int(pk) - 1
                if 0 <= idx < len(calendars):
                    cal = calendars[idx]
                    calendar_uri = cal['id']
                    
                    # Mettre à jour ou créer la préférence
                    preference, created = BaikalCalendarPreference.objects.get_or_create(
                        user=request.user,
                        calendar_uri=calendar_uri,
                        defaults={
                            'is_enabled': True,
                            'color': '#005f82'
                        }
                    )
                    
                    # Mettre à jour les champs fournis
                    if 'is_enabled' in request.data:
                        preference.is_enabled = request.data['is_enabled']
                    if 'color' in request.data:
                        preference.color = request.data['color']
                    
                    preference.save()
                    
                    # Retourner le calendrier mis à jour
                    return Response({
                        'id': int(pk),
                        'calendarid': int(pk),
                        'principaluri': f'principals/{request.user.email}',
                        'username': request.user.email,
                        'access': 1,
                        'displayname': cal['name'],
                        'name': cal['name'],
                        'uri': calendar_uri,
                        'description': '',
                        'calendarorder': idx,
                        'color': preference.color,
                        'display': 1 if preference.is_enabled else 0,
                        'is_enabled': preference.is_enabled,
                        'defined_name': calendar_uri,
                        'user_id': request.user.id
                    })
                else:
                    return Response(
                        {'error': 'Calendrier non trouvé'},
                        status=status.HTTP_404_NOT_FOUND
                    )
            except (ValueError, IndexError) as e:
                return Response(
                    {'error': f'ID de calendrier invalide: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            logger.error(f"Erreur mise à jour calendrier {pk}: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def partial_update(self, request, pk=None):
        """Mise à jour partielle - même comportement que update"""
        return self.update(request, pk)

    @action(detail=False, methods=['post'])
    def configure(self, request):
        """
        Configure les identifiants Baikal pour l'utilisateur
        Body: { "password": "mot_de_passe_baikal" }
        """
        password = request.data.get('password')

        if not password:
            return Response(
                {'error': 'Le mot de passe Baikal est requis'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Tester la connexion
        try:
            test_client = BaikalCalDAVClient(
                base_url=settings.BAIKAL_SERVER_URL,
                username=request.user.email,
                password=password
            )

            # Essayer de lister les calendriers pour valider
            calendars = test_client.list_calendars()

            # Si succès, stocker le mot de passe
            request.user.baikal_password = password
            request.user.save()

            logger.info(f"Configuration Baikal réussie pour {request.user.email}")

            return Response({
                'success': True,
                'message': 'Configuration Baikal enregistrée avec succès',
                'calendars_count': len(calendars)
            })

        except Exception as e:
            logger.error(f"Erreur configuration Baikal: {e}")
            return Response(
                {'error': f'Erreur de connexion à Baikal: {str(e)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['post'])
    def test_connection(self, request):
        """Teste la connexion CalDAV avec les identifiants stockés"""
        client = self._get_caldav_client()

        if not client:
            return Response(
                {
                    'success': False,
                    'error': 'Client CalDAV non disponible. Veuillez configurer vos identifiants.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            calendars = client.list_calendars()

            return Response({
                'success': True,
                'message': 'Connexion réussie',
                'calendars_count': len(calendars),
                'calendars': calendars
            })
        except Exception as e:
            logger.error(f"Erreur test connexion: {e}")
            return Response(
                {'success': False, 'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class BaikalEventViewSet(viewsets.ViewSet):
    """
    ViewSet pour gérer les événements Baikal
    Utilise uniquement le client CalDAV (pas d'accès MySQL direct)
    """
    permission_classes = [IsAuthenticated]

    def _get_caldav_client(self):
        """Initialise le client CalDAV"""
        user = self.request.user

        # Récupérer le mot de passe stocké
        password = user.baikal_password

        if not password:
            logger.warning(f"Mot de passe Baikal non disponible pour {user.email}")
            return None

        return BaikalCalDAVClient(
            base_url=settings.BAIKAL_SERVER_URL,
            username=user.email,
            password=password
        )

    def _format_event_for_frontend(self, event, calendar_name, event_id=None):
        """Formate un événement CalDAV pour le frontend"""
        return {
            'id': event_id or hash(event['id']),
            'calendar_id': calendar_name,
            'calendar_source': calendar_name,
            'uid': event['id'],
            'etag': '',
            'url': event.get('url', ''),  # ✅ URL complète de l'événement pour PATCH/DELETE
            'uri': event.get('url', ''),
            'title': event.get('summary', 'Sans titre'),
            'description': event.get('description', ''),
            'start_date': event['start'].isoformat() if event.get('start') else None,
            'end_date': event['end'].isoformat() if event.get('end') else None,
            'is_completed': False,
            'lastmodified': int(event['last_modified'].timestamp()) if event.get('last_modified') else None,
            'calendar_source_name': calendar_name,
            'calendar_source_color': '#005f82'
        }

    def list(self, request):
        """Liste tous les événements de tous les calendriers"""
        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible. Veuillez configurer vos identifiants.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Récupérer les filtres de dates
            start_date_str = request.query_params.get('start_date')
            end_date_str = request.query_params.get('end_date')

            # Parser les dates
            start_date = None
            end_date = None

            if start_date_str:
                try:
                    start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
                except (ValueError, AttributeError):
                    pass

            if end_date_str:
                try:
                    end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
                except (ValueError, AttributeError):
                    pass

            # Dates par défaut si non spécifiées
            if not start_date:
                start_date = datetime.now() - timedelta(days=7)
            if not end_date:
                end_date = datetime.now() + timedelta(days=30)

            # Récupérer tous les calendriers
            calendars = client.list_calendars()

            # Récupérer les événements de chaque calendrier
            all_events = []
            event_counter = 1

            for cal in calendars:
                try:
                    events = client.get_events(
                        calendar_name=cal['name'],
                        start_date=start_date,
                        end_date=end_date
                    )

                    for event in events:
                        formatted_event = self._format_event_for_frontend(
                            event,
                            cal['name'],
                            event_id=event_counter
                        )
                        all_events.append(formatted_event)
                        event_counter += 1

                except Exception as e:
                    logger.warning(f"Erreur récupération événements du calendrier {cal['name']}: {e}")
                    continue

            logger.info(f"Récupération de {len(all_events)} événement(s) pour {request.user.email}")

            return Response(all_events)
        except Exception as e:
            logger.error(f"Erreur récupération événements: {e}", exc_info=True)
            return Response(
                {'error': f'Erreur lors de la récupération des événements: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def retrieve(self, request, pk=None):
        """Récupère un événement spécifique par son URL ou ID"""
        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # On doit chercher dans tous les calendriers
            calendars = client.list_calendars()

            for cal in calendars:
                try:
                    events = client.get_events(cal['name'])

                    # Chercher l'événement par ID (hash de l'UID)
                    for idx, event in enumerate(events):
                        event_id = hash(event['id'])
                        if str(event_id) == str(pk) or str(idx + 1) == str(pk):
                            formatted_event = self._format_event_for_frontend(event, cal['name'], event_id)
                            return Response(formatted_event)
                except:
                    continue

            return Response(
                {'error': 'Événement non trouvé'},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            logger.error(f"Erreur récupération événement {pk}: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def create(self, request):
        """Crée un nouvel événement via CalDAV"""
        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible. Veuillez configurer vos identifiants Baikal.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Récupérer les données
            title = request.data.get('title')
            description = request.data.get('description', '')
            start_date = request.data.get('start_date')
            end_date = request.data.get('end_date')
            calendar_source = request.data.get('calendar_source') or request.data.get('calendar_id')

            # Validation
            if not title:
                return Response(
                    {'error': 'Le titre est requis'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            if not start_date or not end_date:
                return Response(
                    {'error': 'Les dates de début et fin sont requises'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Récupérer le nom du calendrier
            calendars = client.list_calendars()

            calendar_name = None
            if calendar_source:
                # Essayer de trouver le calendrier par index
                try:
                    idx = int(calendar_source) - 1
                    if 0 <= idx < len(calendars):
                        calendar_name = calendars[idx]['name']
                except (ValueError, IndexError):
                    # Essayer par nom
                    for cal in calendars:
                        if cal['name'] == calendar_source or cal['id'] == calendar_source:
                            calendar_name = cal['name']
                            break

            # Utiliser le premier calendrier si non spécifié
            if not calendar_name and calendars:
                calendar_name = calendars[0]['name']

            if not calendar_name:
                return Response(
                    {'error': 'Aucun calendrier disponible'},
                    status=status.HTTP_404_NOT_FOUND
                )

            # Parser les dates
            try:
                start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except (ValueError, AttributeError) as e:
                return Response(
                    {'error': f'Format de date invalide: {str(e)}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Créer l'événement via CalDAV
            event_data = {
                'summary': title,
                'description': description,
                'start': start_dt,
                'end': end_dt,
            }

            result = client.create_event(calendar_name, event_data)

            if not result.get('success'):
                return Response(
                    {'error': result.get('error', 'Erreur lors de la création')},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Retourner les données de l'événement créé
            created_event = {
                'id': hash(result['uid']),
                'uid': result['uid'],
                'title': title,
                'description': description,
                'start_date': start_date,
                'end_date': end_date,
                'calendar_id': calendar_name,
                'calendar_source': calendar_name,
                'calendar_source_name': calendar_name,
                'calendar_source_color': '#005f82',
                'message': 'Événement créé avec succès'
            }

            return Response(created_event, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Erreur création événement: {e}", exc_info=True)
            return Response(
                {'error': f'Erreur lors de la création: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def update(self, request, pk=None):
        """Met à jour un événement via CalDAV en utilisant l'URL fournie"""
        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # ✅ Récupérer l'URL depuis le body de la requête
            event_url = request.data.get('url')

            if not event_url:
                return Response(
                    {'error': 'L\'URL de l\'événement est requise (champ "url")'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Préparer les données de mise à jour
            update_data = {}

            if 'title' in request.data:
                update_data['summary'] = request.data['title']
            if 'description' in request.data:
                update_data['description'] = request.data['description']
            if 'start_date' in request.data:
                update_data['start'] = request.data['start_date']
            if 'end_date' in request.data:
                update_data['end'] = request.data['end_date']
            if 'location' in request.data:
                update_data['location'] = request.data['location']

            # Mettre à jour via CalDAV
            result = client.update_event(event_url, update_data)

            if not result.get('success'):
                return Response(
                    {'error': result.get('error', 'Erreur lors de la mise à jour')},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Récupérer l'événement mis à jour pour retourner les données complètes
            updated_event = client.get_event_by_url(event_url)

            if updated_event:
                formatted_event = {
                    'id': pk,
                    'uid': updated_event['uid'],
                    'url': event_url,
                    'title': updated_event['summary'],
                    'description': updated_event['description'],
                    'start_date': updated_event['start'].isoformat() if updated_event.get('start') else None,
                    'end_date': updated_event['end'].isoformat() if updated_event.get('end') else None,
                    'location': updated_event.get('location', ''),
                    'message': 'Événement mis à jour avec succès'
                }
            else:
                # Fallback si on ne peut pas récupérer l'événement
                formatted_event = {
                    'id': pk,
                    'url': event_url,
                    'title': update_data.get('summary'),
                    'description': update_data.get('description'),
                    'start_date': update_data.get('start'),
                    'end_date': update_data.get('end'),
                    'message': 'Événement mis à jour avec succès'
                }

            return Response(formatted_event)

        except Exception as e:
            logger.error(f"Erreur mise à jour événement {pk}: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def partial_update(self, request, pk=None):
        """Mise à jour partielle"""
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        """Supprime un événement via CalDAV en utilisant l'URL fournie"""
        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # ✅ Récupérer l'URL depuis le body ou query params
            event_url = request.data.get('url') or request.query_params.get('url')

            if not event_url:
                return Response(
                    {'error': 'L\'URL de l\'événement est requise (champ "url" ou query param)'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Supprimer via CalDAV
            result = client.delete_event(event_url)

            if result.get('success'):
                return Response(
                    {
                        'message': result.get('message', 'Événement supprimé avec succès'),
                        'event_url': event_url
                    },
                    status=status.HTTP_204_NO_CONTENT
                )
            else:
                return Response(
                    {'error': result.get('error', 'Erreur lors de la suppression')},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        except Exception as e:
            logger.error(f"Erreur suppression événement {pk}: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

