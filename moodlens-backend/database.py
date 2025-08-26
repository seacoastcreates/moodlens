# database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Examples:
# postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME
# postgresql+psycopg2://USER:PASSWORD@HOST:5432/DBNAME?sslmode=require
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/moodlens")

# If you're using a serverless Postgres (Neon, etc.), you may want pool_pre_ping=True and smaller pools.
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    # Example: tweak pool sizes if needed
    # pool_size=5, max_overflow=5
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
