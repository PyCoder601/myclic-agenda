#!/bin/sh
set -e

echo "Waiting for database..."
python wait_for_db.py


# Appliquer les migrations de la base de données
echo "Applying database migrations..."
python manage.py migrate

# Lancer le serveur Gunicorn
echo "Starting Gunicorn server..."

gunicorn config.wsgi:application --workers 2 --bind 0.0.0.0:8021 --timeout 1200