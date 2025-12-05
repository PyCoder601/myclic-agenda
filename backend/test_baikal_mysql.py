#!/usr/bin/env python
"""
Script de test pour vérifier la connexion à la base MySQL de Baikal
et afficher les tables + colonnes.
"""

import os
import sys
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

try:
    import mysql.connector
    from mysql.connector import Error
except ImportError:
    print("❌ Module mysql-connector-python non installé !")
    print("   Installer avec: pip install mysql-connector-python")
    sys.exit(1)


def list_tables_and_columns(connection, database_name):
    """Lister les tables et leurs colonnes dans la base"""

    cursor = connection.cursor()

    print("\n📚 Liste des tables et colonnes dans la base :")
    print("=" * 60)

    try:
        # Récupérer les tables
        cursor.execute(f"SHOW TABLES")
        tables = cursor.fetchall()

        if not tables:
            print("❌ Aucune table trouvée dans la base.")
            return

        for (table_name,) in tables:
            print(f"\n🗂️ Table : {table_name}")
            print("-" * 40)

            # Récupérer les colonnes de la table
            cursor.execute(f"SHOW COLUMNS FROM `{table_name}`")
            columns = cursor.fetchall()

            for col in columns:
                field = col[0]
                type_ = col[1]
                nullable = col[2]
                key = col[3]
                default = col[4]
                extra = col[5]

                print(f"  - {field:<20} {type_:<20} NULL: {nullable:<3} KEY: {key:<3} EXTRA: {extra}")

    except Error as e:
        print(f"❌ Erreur lors de la récupération des tables: {e}")
    finally:
        cursor.close()


def test_connection():
    """Tester la connexion à MySQL et lister les tables"""

    host = os.getenv('BAIKAL_DB_HOST')
    port = int(os.getenv('BAIKAL_DB_PORT', '3306'))
    user = os.getenv('BAIKAL_DB_USER')
    password = os.getenv('BAIKAL_DB_PASSWORD')
    database = os.getenv('BAIKAL_DB_NAME', 'baikal')

    print("🔧 Configuration:")
    print(f"   Host: {host}:{port}")
    print(f"   User: {user}")
    print(f"   Database: {database}")
    print()

    if not all([host, user, password]):
        print("❌ Configuration incomplète dans .env !")
        return False

    try:
        print("📡 Tentative de connexion à MySQL...")
        connection = mysql.connector.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database
        )

        if connection.is_connected():
            db_info = connection.get_server_info()
            print(f"✅ Connecté à MySQL Server version {db_info}")

            # Appeler la fonction pour lister les tables
            list_tables_and_columns(connection, database)

            print("\n✨ Fin du listage.\n")
            return True

    except Error as e:
        print(f"\n❌ Erreur de connexion: {e}")
        return False


if __name__ == '__main__':
    print("🔍 Test de connexion + listage des tables MySQL")
    print("=" * 60)
    print()

    success = test_connection()

    sys.exit(0 if success else 1)
