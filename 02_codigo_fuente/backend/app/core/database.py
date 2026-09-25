"""
Conexión a la base de datos PostgreSQL (Neon) mediante SQLAlchemy.

Expone:
  - `Base`     → clase de la que heredan todos los modelos
  - `get_db()` → dependencia de FastAPI que entrega una sesión por petición
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

# ─── Motor de conexión ──────────────────────────────────
# pool_pre_ping evita usar conexiones muertas (importante con Neon,
# que cierra conexiones inactivas).
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    echo=settings.DEBUG,  # imprime el SQL generado cuando DEBUG=True
)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    """Clase base de todos los modelos ORM."""
    pass


def get_db() -> Generator[Session, None, None]:
    """
    Dependencia de FastAPI. Abre una sesión, la entrega al endpoint,
    y la cierra siempre al terminar (haya error o no).

    Uso en un endpoint:
        def mi_endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
