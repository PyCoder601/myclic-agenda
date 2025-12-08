import os
import time
import psycopg2
from psycopg2 import OperationalError


def wait_for_db():
    # Prefer POSTGRES_* vars (used in settings.py), fallback to DB_* for compatibility
    db_host = os.environ.get('POSTGRES_HOST') or os.environ.get('DB_HOST') or 'localhost'
    db_name = os.environ.get('POSTGRES_DB') or os.environ.get('DB_NAME') or os.environ.get('POSTGRES_DATABASE')
    db_user = os.environ.get('POSTGRES_USER') or os.environ.get('DB_USER')
    db_password = os.environ.get('POSTGRES_PASSWORD') or os.environ.get('DB_PASSWORD')
    db_port = os.environ.get('POSTGRES_PORT') or os.environ.get('DB_PORT') or 5432

    # Ensure port is int
    try:
        db_port = int(db_port)
    except Exception:
        db_port = 5432

    # Basic validation
    if not db_name or not db_user:
        print("Warning: database name or user not set via POSTGRES_*/DB_* env vars. Continuing and letting Django surface errors.")

    retries = 12
    delay = 2
    while retries > 0:
        try:
            conn = psycopg2.connect(
                host=db_host,
                dbname=db_name,
                user=db_user,
                password=db_password,
                port=db_port,
                connect_timeout=5,
            )
            print("Database is ready!")
            conn.close()
            return
        except OperationalError as e:
            print(f"Database not ready yet, waiting... ({e})")
            retries -= 1
            time.sleep(delay)
            # exponential backoff with cap
            delay = min(delay * 1.5, 10)

    print("Could not connect to the database after several attempts. Exiting.")
    exit(1)


if __name__ == "__main__":
    wait_for_db()