import os
import time
import psycopg2
from psycopg2 import OperationalError

def wait_for_db():
    db_host = os.environ.get('DB_HOST')
    db_name = os.environ.get('DB_NAME')
    db_user = os.environ.get('DB_USER')
    db_password = os.environ.get('DB_PASSWORD')
    db_port = os.environ.get('DB_PORT')

    db_conn = None
    retries = 10
    while retries > 0:
        try:
            db_conn = psycopg2.connect(
                host=db_host,
                dbname=db_name,
                user=db_user,
                password=db_password,
                port=db_port
            )
            print("Database is ready!")
            db_conn.close()
            return
        except OperationalError as e:
            print(f"Database not ready yet, waiting... ({e})")
            retries -= 1
            time.sleep(3)

    if db_conn is None:
        print("Could not connect to the database. Exiting.")
        exit(1)

if __name__ == "__main__":
    wait_for_db()