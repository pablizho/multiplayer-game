from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./game.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class PlayerModel(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=False)  # ← добавили
    coins = Column(Integer, default=100)
    rank = Column(String, default="Новичок")
    last_daily = Column(DateTime, nullable=True)
    last_work = Column(DateTime, nullable=True)
    free_rolls = Column(Integer, default=10)
    last_free_roll = Column(DateTime, nullable=True)
    avatar = Column(String, default="default_avatar.jpg")


Base.metadata.create_all(bind=engine)

