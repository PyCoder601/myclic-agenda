"""
Vues pour l'API Baikal
Architecture CalDAV pure: Toutes les opérations via le client CalDAV
"""
import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from datetime import datetime, timedelta

from .baikal_models import BaikalCalendarInstance
from .caldav_service import BaikalCalDAVClient
from .myclic_model import Compte, Affaire

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
            user=user
        )

    def list(self, request):
        """Liste tous les calendriers de l'utilisateur via CalDAV"""
        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible. Veuillez configurer vos identifiants.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Récupérer la liste des calendriers avec détails
            calendars = client.list_calendars()
            return Response(calendars)
        except Exception as e:
            logger.error(f"Erreur récupération calendriers: {e}", exc_info=True)
            return Response(
                {'error': f'Erreur lors de la récupération des calendriers: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def retrieve(self, request, pk=None):
        """Récupère un calendrier spécifique"""
        # Vérifier que pk est numérique pour éviter les conflits avec les actions personnalisées
        if pk and not str(pk).isdigit():
            return Response(
                {'error': f'ID de calendrier invalide: {pk}'},
                status=status.HTTP_404_NOT_FOUND
            )

        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            cal = BaikalCalendarInstance.objects.using('baikal').get(id=pk)
            return Response({
                'id': cal.id,
                'calendarid': cal.calendarid,
                'displayname': cal.displayname or cal.defined_name or 'Calendrier',
                'principaluri': cal.principaluri,
                'uri': cal.uri,
                'description': cal.description,
                'calendarcolor': cal.calendarcolor or '#005f82',
                'access': cal.access,
                'share_href': cal.share_href,
                'share_displayname': cal.share_displayname,
                'display': cal.display,
                'user_id': cal.user_id
            })


        except Exception as e:
            logger.error(f"Erreur récupération calendrier {pk}: {e}", exc_info=True)
            return Response(
                {'error': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def update(self, request, pk=None):
        """
        Met à jour un calendrier
        Note: Les propriétés sont en lecture seule via CalDAV standard
        """
        return Response(
            {
                'message': 'Mise à jour de calendrier non supportée',
                'note': 'Les propriétés de calendrier sont gérées par le serveur Baikal'
            },
            status=status.HTTP_200_OK
        )

    def partial_update(self, request, pk=None):
        """Mise à jour partielle"""
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
                user=self.request.user
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
            user=user
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
            'calendar_source_color': '#005f82',
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

            print(start_date_str)
            print(end_date_str)

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

            # Paramètre pour inclure tous les calendriers (mode groupe)
            include_all = request.query_params.get('include_all', False)

            print("include all", include_all)

            # Récupérer les événements de chaque calendrier
            all_events = []

            for cal in calendars:
                # Filtrer les ressources (description contient "Resource")
                if cal.get('description') and 'Resource' in cal.get('description', ''):
                    continue  # Ignorer les ressources

                # En mode "include_all", on ignore le filtre display
                if not include_all and (cal['display'] == 0 or cal['display'] == 'O'):
                    continue  # Calendrier masqué
                try:
                    events = client.get_events(
                        calendar=cal,
                        start_date=start_date,
                        end_date=end_date
                    )

                    all_events.extend(events)


                except Exception as e:
                    logger.warning(f"Erreur récupération événements du calendrier {cal['name']}: {e}")
                    continue

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

            print(request.data)
            # Récupérer les données
            title = request.data.get('title')
            description = request.data.get('description', '')
            location = request.data.get('location', '')
            start_date = request.data.get('start_date')
            end_date = request.data.get('end_date')
            calendar_source_name = request.data.get('calendar_source_name')
            calendar_source_color = request.data.get('calendar_source_color')
            calendar_source_uri = request.data.get('calendar_source_uri'),
            calendar_source_id = request.data.get('calendar_source_id'),
            client_id = request.data.get('client_id')
            affair_id = request.data.get('affair_id')
            sequence = request.data.get('sequence', 0)

            calendar_source_uri = isinstance(calendar_source_uri, tuple) and calendar_source_uri[0] or calendar_source_uri
            calendar_source_id = isinstance(calendar_source_id, tuple) and calendar_source_id[0] or calendar_source_id


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
                'title': title,
                'description': description,
                'client_id': client_id,
                'affair_id': affair_id,
                'location': location,
                'start': start_dt,
                'end': end_dt,
                'sequence': sequence,
            }

            result = client.create_event(calendar_source_name, event_data)

            if not result.get('id'):
                return Response(
                    {'error': result.get('error', 'Erreur lors de la création')},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            print("uri", calendar_source_uri)

            url = f'https://www.myclic.fr/baikal/html/cal.php/calendars/{self.request.user.email}/{calendar_source_uri}/{result["id"]}.ics'

            print(url)

            # Retourner les données de l'événement créé
            created_event = {
                'id': result['id'],
                'title': title,
                'description': description,
                'start_date': start_date,
                'end_date': end_date,
                'location': "",
                'client_id': client_id,
                'affair_id': affair_id,
                'url': url,
                'lastmodified': int(datetime.now().timestamp()),
                'calendar_source_name': calendar_source_name,
                'calendar_source_color': calendar_source_color,
                'calendar_source_id': calendar_source_id,
                'calendar_source_uri': calendar_source_uri,
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

            print("url", event_url)

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

            # ✅ Préserver les informations du calendrier source depuis la requête
            calendar_source_name = request.data.get('calendar_source_name')
            calendar_source_id = request.data.get('calendar_source_id')
            calendar_source_color = request.data.get('calendar_source_color')
            calendar_source_uri = request.data.get('calendar_source_uri')

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
                    'calendar_source_name': calendar_source_name,
                    'calendar_source_id': calendar_source_id,
                    'calendar_source_color': calendar_source_color,
                    'calendar_source_uri': calendar_source_uri,
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
                    'calendar_source_name': calendar_source_name,
                    'calendar_source_id': calendar_source_id,
                    'calendar_source_color': calendar_source_color,
                    'calendar_source_uri': calendar_source_uri,
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
        """Supprime un événement via CalDAV"""
        client = self._get_caldav_client()
        if not client:
            return Response(
                {'error': 'Client CalDAV non disponible'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # ✅ Récupérer l'URL depuis le body ou query params
            event_url = request.data.get('url') or request.query_params.get('url')
            print('url', event_url)

            if not event_url:
                return Response(
                        {'error': f'Événement {pk} non trouvé dans les calendriers'},
                        status=status.HTTP_404_NOT_FOUND
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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_clients(request):
    """
    Recherche de clients (comptes) avec genre=1 (strict)
    Paramètres:
    - q: terme de recherche (minimum 3 caractères)
    """
    search_query = request.GET.get('q', '').strip()

    if len(search_query) < 3:
        return Response(
            {'error': 'Veuillez saisir au moins 3 caractères pour effectuer une recherche'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        # Rechercher les comptes avec genre=1 et nom correspondant
        clients = Compte.objects.using('myclic').filter(
            application_id=request.user.application_id,
            genre=1,
            nom__icontains=search_query
        ).values('id', 'nom', 'email', 'telephone')[:20]  # Limiter à 20 résultats

        logger.info(f"Recherche clients pour '{search_query}': {len(clients)} résultats")

        return Response({
            'clients': list(clients),
            'count': len(clients)
        })

    except Exception as e:
        logger.error(f"Erreur recherche clients: {e}", exc_info=True)
        return Response(
            {'error': 'Erreur lors de la recherche de clients'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_affairs(request):
    """
    Recherche d'affaires liées à un client (compte)
    Paramètres:
    - client_id: ID du client (requis)
    - q: terme de recherche optionnel
    """
    client_id = request.GET.get('client_id')
    search_query = request.GET.get('q', '').strip()

    if not client_id:
        return Response(
            {'error': 'L\'ID du client est requis'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        # Rechercher les affaires liées au client via compte_id
        affaires = Affaire.objects.using('myclic').filter(
            compte_id=client_id,
            application_id=request.user.application_id
        )

        # Filtrer par terme de recherche si fourni
        if search_query:
            affaires = affaires.filter(nom__icontains=search_query)

        affaires = affaires.values('id', 'nom', 'descriptif', 'statut')[:20]

        logger.info(f"Recherche affaires pour client {client_id}: {len(affaires)} résultats")

        return Response({
            'affairs': list(affaires),
            'count': len(affaires)
        })

    except Exception as e:
        logger.error(f"Erreur recherche affaires: {e}", exc_info=True)
        return Response(
            {'error': 'Erreur lors de la recherche d\'affaires'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_client_affair_info(request):
    """
    Récupère les informations du client et de l'affaire par leurs IDs
    """
    try:
        client_id = request.GET.get('client_id')
        affair_id = request.GET.get('affair_id')

        print(f"client_id: {client_id}, affair_id: {affair_id}")

        result = {}

        # Récupérer le nom du client si l'ID est fourni
        if client_id:
            print("is client id", client_id)
            try:
                client = Compte.objects.using('myclic').only('id', 'nom', 'email', 'telephone').get(id=client_id)
                result['client'] = {
                    'id': client.id,
                    'nom': client.nom or '',
                }
            except Compte.DoesNotExist:
                result['client'] = None

        # Récupérer le nom de l'affaire si l'ID est fourni
        if affair_id:
            print("is Affaired id", affair_id)
            try:
                affair = Affaire.objects.using('myclic').only('id', 'nom', 'descriptif').get(id=affair_id)
                result['affair'] = {
                    'id': affair.id,
                    'nom': affair.nom or '',
                }
            except Affaire.DoesNotExist:
                result['affair'] = None

        return Response(result, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Erreur récupération info client/affaire: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
