from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta
import random
from pydantic import BaseModel
from fastapi import UploadFile, File
from fastapi.staticfiles import StaticFiles
import os



# Папка для хранения аватарок
AVATARS_DIR = "avatars"
if not os.path.exists(AVATARS_DIR):
    os.makedirs(AVATARS_DIR)

# Настройка базы данных
Base = declarative_base()
DATABASE_URL = "sqlite:///./game.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Модель игрока
class PlayerModel(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    coins = Column(Integer, default=100)
    rank = Column(String, default="Новичок")
    last_daily = Column(DateTime, nullable=True)
    last_work = Column(DateTime, nullable=True)
    free_rolls = Column(Integer, default=10)  # Бесплатные броски
    last_free_roll = Column(DateTime, nullable=True)  # Время последнего бесплатного броска
    avatar = Column(String, default="default_avatar.jpg")

# Создание таблиц
Base.metadata.create_all(bind=engine)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

# Middleware для CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency для работы с базой данных
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Модель для регистрации
class RegisterRequest(BaseModel):
    username: str

# Модель для запроса на покупку бросков
class BuyRollsRequest(BaseModel):
    rolls: int

# Эндпоинт для регистрации
@app.post("/register")
async def register(request: RegisterRequest, db: Session = Depends(get_db)):
    username = request.username
    player = db.query(PlayerModel).filter(PlayerModel.username == username).first()
    if player:
        return {"message": f"Игрок {username} уже существует.", "coins": player.coins}
    new_player = PlayerModel(username=username, coins=100)
    db.add(new_player)
    db.commit()
    db.refresh(new_player)
    return {"message": f"Игрок {username} успешно зарегистрирован.", "coins": new_player.coins}

# Эндпоинт для получения профиля
@app.get("/profile/{username}")
async def get_profile(username: str, db: Session = Depends(get_db)):
    player = db.query(PlayerModel).filter(PlayerModel.username == username).first()
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден.")

    now = datetime.now()
    if player.last_free_roll:
        # Восстанавливаем только недостающие броски
        time_since_last_reset = now - player.last_free_roll
        if time_since_last_reset >= timedelta(hours=1):
            restored_rolls = 10 - player.free_rolls
            if restored_rolls > 0:
                player.free_rolls += restored_rolls
            player.last_free_roll = now
            db.commit()

    return {
        "username": player.username,
        "coins": player.coins,
        "rank": player.rank,
        "free_rolls": player.free_rolls, # Возвращаем актуальное количество бросков
        "avatar": player.avatar
    }



# Эндпоинт для удаления профиля
@app.delete("/delete-profile/{username}")
async def delete_profile(username: str, db: Session = Depends(get_db)):
    player = db.query(PlayerModel).filter(PlayerModel.username == username).first()
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден.")

    db.delete(player)
    db.commit()

    return {"message": f"Профиль {username} успешно удалён."}

# Эндпоинт для ежедневной награды
@app.get("/daily/{username}")
async def daily_reward(username: str, db: Session = Depends(get_db)):
    player = db.query(PlayerModel).filter(PlayerModel.username == username).first()
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден.")
    now = datetime.now()
    if player.last_daily and (now - player.last_daily).days < 1:
        return {"message": "Ежедневная награда уже получена.", "total_coins": player.coins}
    reward = random.randint(50, 150)
    player.coins += reward
    player.last_daily = now
    db.commit()
    return {"message": f"Вы получили {reward} монет!", "total_coins": player.coins}

# Эндпоинт для награды за работу
@app.get("/work/{username}")
async def work_reward(username: str, db: Session = Depends(get_db)):
    player = db.query(PlayerModel).filter(PlayerModel.username == username).first()
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден.")
    now = datetime.now()
    if player.last_work and (now - player.last_work).seconds < 3600:
        return {"message": "Награда за работу уже получена. Попробуйте позже.", "total_coins": player.coins}
    reward = random.randint(100, 300)
    player.coins += reward
    player.last_work = now
    db.commit()
    return {"message": f"Вы заработали {reward} монет!", "total_coins": player.coins}



# Эндпоинт для игры в кости с бесплатными бросками
@app.get("/games/dice/{username}")
async def play_dice(username: str, bet: int, db: Session = Depends(get_db)):
    player = db.query(PlayerModel).filter(PlayerModel.username == username).first()
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден.")

    now = datetime.now()

    # Проверка, прошёл ли час с последнего броска для восстановления бросков
    if player.last_free_roll:
        time_since_last_reset = now - player.last_free_roll
        if time_since_last_reset >= timedelta(hours=1):
            player.free_rolls = 10  # Восстанавливаем броски
            player.last_free_roll = now
    else:
        # Первый бросок: сбросить время и установить 10 бросков
        player.free_rolls = 10
        player.last_free_roll = now

    # Проверка доступных бросков
    if player.free_rolls <= 0:
        raise HTTPException(
            status_code=400,
            detail="Броски закончились. Они восстановятся через час или вы можете купить дополнительные броски."
        )

    # Проверка, что ставка больше 0
    if bet <= 0:
        raise HTTPException(status_code=400, detail="Ставка должна быть больше 0.")

    # Проверка, что у игрока достаточно монет для ставки
    if player.coins < bet:
        raise HTTPException(status_code=400, detail="Недостаточно монет для ставки.")

    # Уменьшаем количество бросков
    player.free_rolls -= 1

    # Снимаем ставку с монет игрока
    player.coins -= bet

    # Бросок кубиков и вычисление результата
    dice = [random.randint(1, 6) for _ in range(2)]
    total = sum(dice)

    # Определение множителя
    if dice[0] == dice[1]:
        multiplier = 3
    elif total == 12:
        multiplier = 5
    elif total > 7:
        multiplier = 2
    elif total == 7:
        multiplier = 1
    elif total == 2:
        multiplier = -2
    elif total == 3:
        multiplier = -1.5
    else:
        multiplier = -1

    # Обновление монет
    if multiplier > 0:
        winnings = bet * multiplier
        player.coins += winnings
    else:
        loss = bet * abs(multiplier)
        player.coins -= loss
        winnings = -loss

    # Сохранение изменений в базе данных
    db.commit()
    db.refresh(player)

    # Формирование сообщения
    message = f"Вы бросили кости {dice}."
    message += f" Ставка {bet} монет: "
    if multiplier > 0:
        message += f"Выигрыш: {winnings} монет (x{multiplier})!"
    elif multiplier == 1:
        message += "Ничья!"
    else:
        message += f"Проигрыш: {abs(winnings)} монет (x{abs(multiplier)})."

    return {
        "dice": dice,
        "winnings": winnings,
        "total_coins": player.coins,
        "free_rolls": player.free_rolls,  # Возвращаем обновленное количество бросков
        "message": message
    }



# Эндпоинт для покупки бросков
@app.post("/buy-rolls/{username}")
async def buy_rolls(username: str, request: BuyRollsRequest, db: Session = Depends(get_db)):
    player = db.query(PlayerModel).filter(PlayerModel.username == username).first()
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден.")

    rolls_to_buy = request.rolls
    cost = rolls_to_buy * 10  # Стоимость бросков

    if player.coins < cost:
        raise HTTPException(status_code=400, detail="Недостаточно монет для покупки бросков.")

    # Увеличиваем количество бросков
    player.coins -= cost
    player.free_rolls += rolls_to_buy

    db.commit()
    db.refresh(player)

    return {
        "message": f"Вы купили {rolls_to_buy} бросков за {cost} монет.",
        "total_coins": player.coins,
        "free_rolls": player.free_rolls
    }


# Эндпоинт для установки аватарки из предложенных
@app.post("/set-avatar/{username}")
async def set_avatar(username: str, request: dict, db: Session = Depends(get_db)):
    player = db.query(PlayerModel).filter(PlayerModel.username == username).first()
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден.")

    player.avatar = request["avatar"]
    db.commit()
    db.refresh(player)

    return {"message": "Аватарка успешно изменена.", "avatar": player.avatar}

# Эндпоинт таймеров
@app.get("/timers/{username}")
async def get_timers(username: str, db: Session = Depends(get_db)):
    player = db.query(PlayerModel).filter(PlayerModel.username == username).first()
    if not player:
        raise HTTPException(status_code=404, detail="Игрок не найден.")

    now = datetime.now()

    daily_timer = (
        (player.last_daily + timedelta(days=1) - now).seconds
        if player.last_daily and (now - player.last_daily).days < 1
        else 0
    )
    work_timer = (
        (player.last_work + timedelta(hours=1) - now).seconds
        if player.last_work and (now - player.last_work).seconds < 3600
        else 0
    )
    free_roll_timer = (
        (player.last_free_roll + timedelta(hours=1) - now).seconds
        if player.last_free_roll and (now - player.last_free_roll).seconds < 3600
        else 0
    )

    return {
        "daily": daily_timer,
        "work": work_timer,
        "free_rolls": free_roll_timer,
    }
