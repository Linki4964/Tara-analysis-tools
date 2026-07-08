import argparse
import asyncio
from pathlib import Path

import asyncpg


async def database_exists(connection, database: str) -> bool:
    row = await connection.fetchrow("SELECT 1 FROM pg_database WHERE datname = $1", database)
    return row is not None


async def create_database(connection, database: str) -> None:
    quoted = '"' + database.replace('"', '""') + '"'
    await connection.execute(f"CREATE DATABASE {quoted}")


async def initialize_schema(host: str, port: int, user: str, password: str, database: str) -> None:
    admin = await asyncpg.connect(host=host, port=port, user=user, password=password, database="postgres")
    try:
        if not await database_exists(admin, database):
            await create_database(admin, database)
    finally:
        await admin.close()

    schema = Path(__file__).with_name("init_database.sql").read_text(encoding="utf-8")
    app = await asyncpg.connect(host=host, port=port, user=user, password=password, database=database)
    try:
        await app.execute(schema)
    finally:
        await app.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Initialize the TARA PostgreSQL database.")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=5433)
    parser.add_argument("--user", default="postgres")
    parser.add_argument("--password", required=True)
    parser.add_argument("--database", default="tara_analysis")
    args = parser.parse_args()

    asyncio.run(initialize_schema(args.host, args.port, args.user, args.password, args.database))
    print(f"Database '{args.database}' is ready on {args.host}:{args.port}.")


if __name__ == "__main__":
    main()
