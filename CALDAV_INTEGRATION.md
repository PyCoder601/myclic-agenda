# Intégration CalDAV avec Baikal

Ce projet inclut une intégration complète avec le serveur CalDAV Baikal pour la synchronisation des tâches de l'agenda.

## Fonctionnalités

### Backend (Django)

- **Modèle CalDAVConfig** : Stocke la configuration CalDAV pour chaque utilisateur
- **Service CalDAV** : Gère toutes les opérations de synchronisation
  - Connexion au serveur Baikal
  - Conversion bidirectionnelle entre tâches Django et événements iCalendar
  - Synchronisation automatique lors de la création/modification/suppression de tâches
  - Synchronisation manuelle complète

### Frontend (Next.js)

- **Page de paramètres** (`/settings`) : Interface pour configurer CalDAV
- **Bouton de synchronisation** : Dans le header du dashboard
- **Indicateurs visuels** : Messages de statut de synchronisation
- **Gestion d'erreurs** : Retour d'information clair sur les problèmes de connexion

## Configuration

### 1. Configuration du serveur Baikal

Assurez-vous que votre serveur Baikal est installé et accessible. Vous aurez besoin de :

- **URL CalDAV** : `https://votre-serveur.com/baikal/dav.php`
- **Nom d'utilisateur** : Créé dans l'interface d'administration Baikal
- **Mot de passe** : Du compte utilisateur Baikal
- **Nom du calendrier** : Par défaut "default"

### 2. Configuration dans l'application

1. Connectez-vous à votre compte
2. Cliquez sur l'icône "Paramètres" (⚙️) dans le header
3. Remplissez le formulaire de configuration CalDAV
4. Testez la connexion avec le bouton "Tester la connexion"
5. Sauvegardez la configuration

### 3. Variables d'environnement (optionnel)

Créez un fichier `.env` dans le dossier `backend/` :

```env
# Django settings
SECRET_KEY=votre-secret-key
DEBUG=True

# Baikal CalDAV server settings (optionnel - peut être configuré par utilisateur)
CALDAV_URL=https://votre-serveur.com/baikal/dav.php
CALDAV_USERNAME=votre-username
CALDAV_PASSWORD=votre-password
CALDAV_CALENDAR_NAME=default
```

## Utilisation

### Synchronisation automatique

La synchronisation est automatique quand elle est activée dans les paramètres :

- ✅ Création d'une tâche → envoyée vers Baikal
- ✅ Modification d'une tâche → mise à jour sur Baikal
- ✅ Suppression d'une tâche → supprimée de Baikal

### Synchronisation manuelle

Utilisez le bouton de synchronisation (🔄) dans le header pour :

- Récupérer les nouvelles tâches depuis Baikal
- Envoyer les tâches locales vers Baikal
- Synchroniser les modifications

## API Endpoints

### Configuration CalDAV

```
GET    /api/caldav/config/    - Récupérer la configuration
POST   /api/caldav/config/    - Créer la configuration
PUT    /api/caldav/config/    - Mettre à jour la configuration
DELETE /api/caldav/config/    - Supprimer la configuration
```

### Synchronisation

```
POST   /api/caldav/sync/      - Synchroniser toutes les tâches
POST   /api/caldav/test/      - Tester la connexion
POST   /api/tasks/sync/       - Synchroniser via le viewset des tâches
```

## Architecture technique

### Backend

```
api/
├── models.py              # CalDAVConfig et Task (avec champs CalDAV)
├── serializers.py         # Serializers pour CalDAVConfig
├── views.py               # Vues pour la configuration et synchronisation
├── caldav_service.py      # Service de synchronisation CalDAV
└── urls.py                # Routes API
```

### Frontend

```
app/
├── settings/
│   └── page.tsx           # Page de configuration CalDAV
└── dashboard/
    └── page.tsx           # Dashboard avec bouton de sync

lib/
├── api.ts                 # API client avec fonctions CalDAV
└── types.ts               # Types TypeScript incluant CalDAVConfig
```

## Format iCalendar

Les tâches sont converties en événements iCalendar (VEVENT) avec :

- **UID** : Identifiant unique de la tâche
- **SUMMARY** : Titre de la tâche
- **DESCRIPTION** : Description de la tâche
- **DTSTART** : Date/heure de début
- **DTEND** : Date/heure de fin
- **STATUS** : CONFIRMED ou COMPLETED

## Dépendances

### Backend

```toml
caldav>=2.1.2           # Client CalDAV Python
icalendar>=6.3.2        # Manipulation des fichiers iCalendar
pytz>=2025.2            # Gestion des fuseaux horaires
```

### Frontend

```json
{
  "axios": "^1.x.x"     // Requêtes HTTP
}
```

## Sécurité

⚠️ **Important** : Le mot de passe CalDAV est stocké en clair dans la base de données.

Pour la production, il est recommandé de :

1. Chiffrer le champ `password` dans le modèle `CalDAVConfig`
2. Utiliser des variables d'environnement pour les credentials sensibles
3. Implémenter HTTPS pour toutes les communications
4. Utiliser des tokens d'application au lieu de mots de passe

## Dépannage

### Problème de connexion

1. Vérifiez que l'URL CalDAV est correcte et accessible
2. Vérifiez les identifiants dans Baikal
3. Assurez-vous que le calendrier existe
4. Vérifiez les logs du serveur backend

### Tâches non synchronisées

1. Vérifiez que la synchronisation est activée dans les paramètres
2. Utilisez le bouton de synchronisation manuelle
3. Vérifiez les permissions du calendrier dans Baikal
4. Consultez les logs pour les erreurs

### Erreurs de migration

```bash
cd backend
python manage.py makemigrations
python manage.py migrate
```

## Support

Pour plus d'informations sur Baikal :
- Documentation officielle : https://sabre.io/baikal/
- Installation : https://sabre.io/baikal/install/

## Licence

Ce projet utilise les bibliothèques open-source :
- caldav (Apache License 2.0)
- icalendar (BSD License)

