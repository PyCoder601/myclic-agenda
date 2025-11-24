import os
import time
import psycopg2

def wait_for_db():
    db_conn_str = os.environ.get('DATABASE_URL')
    if not db_conn_str:
        print("DATABASE_URL environment variable not set. Assuming SQLite or no external DB.")
        return

    max_tries = 20
    tries = 0
    while tries < max_tries:
        try:
            conn = psycopg2.connect(db_conn_str, connect_timeout=5)
            conn.close()
            print("Database is ready!")
            return
        except psycopg2.OperationalError as e:
            print(f"Database not ready yet: {e}")
            tries += 1
            time.sleep(3)
    print("Error: Could not connect to the database after multiple attempts.")
    exit(1)

if __name__ == '__main__':
    wait_for_db()
