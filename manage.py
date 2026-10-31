"""Local recovery commands. Requires access to the server's data volume."""
import argparse
import getpass
import os
from pathlib import Path
import secrets
import sqlite3

from werkzeug.security import generate_password_hash


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["reset-password"])
    parser.add_argument("--data-dir", default=os.environ.get("DATA_DIR", "data"))
    args = parser.parse_args()
    database = Path(args.data_dir) / "singularity.db"
    if not database.is_file():
        parser.error("No database found. Start the application and complete setup first.")
    password = getpass.getpass("New admin password (12–128 characters): ")
    if not 12 <= len(password) <= 128:
        parser.error("Use 12–128 characters.")
    if password != getpass.getpass("Confirm new password: "):
        parser.error("Passwords do not match.")
    with sqlite3.connect(database) as connection:
        count = connection.execute("UPDATE admin SET password=?, generation=? WHERE id=1",
                                   (generate_password_hash(password), secrets.token_hex(16))).rowcount
        if not count:
            parser.error("Setup is not complete. Create your administrator through the web interface.")
    print("Admin password reset. Existing admin sessions are now signed out.")


if __name__ == "__main__":
    main()
