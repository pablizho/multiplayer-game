import os
import random
import asyncio
from fastapi.responses import RedirectResponse
from fastapi.responses import JSONResponse
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from jose import JWTError, jwt
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from datetime import datetime, timedelta
from fastapi import Header
from pydantic import BaseModel
from fastapi import UploadFile, File
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from sqlalchemy import ForeignKey
from fastapi import WebSocket, WebSocketDisconnect
from typing import List, Dict



class ConnectionManager:
    def __init__(self):
        # Будем хранить подключения по идентификатору комнаты:
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, room_id: int, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, room_id: int, websocket: WebSocket):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast(self, room_id: int, message: dict):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                await connection.send_json(message)

manager = ConnectionManager()


SECRET_KEY = "jOUL2fquxO3j9AG1UPHZ3j9AG1UPHZ8NPXSIaoLUoJWKWvjrqAmJUY0phRanVpyLT8RI3VB7TsmFsdWGAXIasFrNKLThA3UpZk6W"  # Замените на свой длинный ключ
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24  # Срок жизни токена

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)





pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Папка для хранения аватарок
AVATARS_DIR = "avatars"
if not os.path.exists(AVATARS_DIR):
    os.makedirs(AVATARS_DIR)

# Настройка базы данных
Base = declarative_base()
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://mygame_5kxz_user:4GjzOvjoupqEq00BeMRHORX0NdzxZ5Rm@dpg-cud2f0t2ng1s73bbfm20-a.oregon-postgres.render.com/mygame_5kxz")
print(f"Подключение к базе данных: {DATABASE_URL}")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Модель игрока
class PlayerModel(Base):
    __tablename__ = "players"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=False)  # ← добавили
    coins = Column(Integer, default=100)
    rank = Column(String, default="Новичок")
    last_daily = Column(DateTime, nullable=True)
    last_work = Column(DateTime, nullable=True)
    free_rolls = Column(Integer, default=10)  # Бесплатные броски
    last_free_roll = Column(DateTime, nullable=True)  # Время последнего бесплатного броска
    avatar = Column(String, default="default_avatar.jpg")


# Модель комнаты
class RoomModel(Base):
    __tablename__ = "rooms_v3"
    id = Column(Integer, primary_key=True, index=True)
    host_username = Column(String, nullable=False)
    guest_username = Column(String, nullable=True)
    host_bet = Column(Integer, default=0)
    guest_bet = Column(Integer, default=0)
    # Старые поля ставок и побед можно оставить для этапа ставок,
    # но для игрового процесса добавляем новые:
    status = Column(String, default="waiting")  # Возможные значения: waiting (ставки), ready, rolling, finished
    created_at = Column(DateTime, default=datetime.utcnow)

    stage = Column(Integer, default=1)            # Номер текущего раунда (1..3)
    host_ready = Column(Integer, default=0)         # Флаг готовности хоста (0/1)
    guest_ready = Column(Integer, default=0)        # Флаг готовности гостя (0/1)
    turn = Column(String, default="")               # Чей ход: "host" или "guest"
    host_total = Column(Integer, default=0)         # Суммарное количество очков хоста
    guest_total = Column(Integer, default=0)        # Суммарное количество очков гостя
    host_stage_result = Column(Integer, default=0)  # Результат броска в текущем раунде (хост)
    guest_stage_result = Column(Integer, default=0) # Результат броска в текущем раунде (гость)
    rematch_offer = Column(String, default="")      # Если один игрок предложил переигровку, сохраняем его имя


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



oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")  
# ↑ Обычно указывают URL, где получают токен. У нас "/login"

def get_current_user(
    token: str = Depends(oauth2_scheme),  # будет читать заголовок Authorization
    db: Session = Depends(get_db)
) -> PlayerModel:
    """Проверяем токен, ищем пользователя в базе."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate token")

    user = db.query(PlayerModel).filter_by(username=username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user



@app.get("/validate-token")
def validate_token(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(PlayerModel).filter_by(username=username).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    except JWTError as e:
        print(f"JWT Error: {str(e)}")
        raise HTTPException(status_code=401, detail="Invalid token")
    
    print(f"User {user.username} successfully validated.")
    return {
        "username": user.username,
        "coins": user.coins,
        "rank": user.rank,
        "free_rolls": user.free_rolls,
        "avatar": user.avatar
    }



# Модель для регистрации
class RegisterRequest(BaseModel):
    username: str
    password: str  # ← добавили

# Модель для запроса на покупку бросков
class BuyRollsRequest(BaseModel):
    rolls: int

# Эндпоинт для регистрации
@app.post("/register")
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    # Проверяем, нет ли уже такого пользователя
    existing = db.query(PlayerModel).filter_by(username=request.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь уже существует. Пожалуйста, войдите в систему.")

    # Хэшируем пароль
    hashed_pw = pwd_context.hash(request.password)

    # Создаём игрока
    new_player = PlayerModel(
        username=request.username,
        hashed_password=hashed_pw,
        coins=100
    )
    db.add(new_player)
    db.commit()
    db.refresh(new_player)

    # Создаём токен сразу
    access_token_expires = timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    access_token = create_access_token(
        data={"sub": new_player.username},
        expires_delta=access_token_expires
    )
    return {
        "message": "Регистрация успешна",
        "access_token": access_token,
        "token_type": "bearer"
    }


# Модель для логина
class LoginRequest(BaseModel):
    username: str
    password: str

# Эндпойнт для логина
@app.post("/login")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(PlayerModel).filter_by(username=request.username).first()
    if not user:
        raise HTTPException(status_code=400, detail="Неверное имя пользователя или пароль")
    # проверяем пароль
    if not pwd_context.verify(request.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Неверное имя пользователя или пароль")

    # создаём токен, в "sub" пишем username
    access_token_expires = timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


# Эндпоинт для получения профиля
@app.get("/profile/{username}")
def get_profile(
    username: str,
    db: Session = Depends(get_db),
    current_user: PlayerModel = Depends(get_current_user)
):

# проверяем, что запрашивающий токен соответствует path
    if current_user.username != username:
        raise HTTPException(status_code=403, detail="Forbidden")

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


@app.get("/")
def read_root(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "):
        return RedirectResponse(url="/static/register.html")
    
    token = authorization.split(" ")[1]
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            return RedirectResponse(url="/static/register.html")
        user = db.query(PlayerModel).filter_by(username=username).first()
        if not user:
            return RedirectResponse(url="/static/register.html")
    except JWTError:
        return RedirectResponse(url="/static/register.html")
    
    # Перенаправляем на страницу игры
    return RedirectResponse(url="/static/game.html")

#Создание комнаты-----------------------------------------------------------------------------------------------------------
#Пояснение:
#При вызове этого эндпоинта текущий авторизованный игрок становится хостом. 
#Комната создаётся со статусом waiting (ожидание подключения второго игрока).
@app.post("/rooms/create")
def create_room(
    current_user: PlayerModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    new_room = RoomModel(
        host_username=current_user.username,
        guest_username=None,
        host_bet=0,
        guest_bet=0,
        status="waiting",    # Ожидание подключения второго игрока
        stage=1,
        host_ready=0,
        guest_ready=0,
        turn="",             # Пока никто не должен бросать кубик
        host_total=0,
        guest_total=0,
        host_stage_result=0,
        guest_stage_result=0,
        rematch_offer=""
    )
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    return {
        "message": "Комната создана.",
        "room_id": new_room.id
    }



#Получение списка комнат
#Возвращаем список комнат, в которых ждут подключения. При желании можно расширить 
#фильтр (например, исключать старые комнаты).

@app.get("/rooms")
def list_rooms(db: Session = Depends(get_db)):
    rooms = db.query(RoomModel).filter(RoomModel.status == "waiting").all()
    room_list = []
    for room in rooms:
        # Если guest_username заполнено, участников 2, иначе 1
        participants = 2 if room.guest_username else 1
        room_list.append({
            "room_id": room.id,
            "host": room.host_username,
            "participants": participants,
            "created_at": room.created_at.isoformat()
        })
    return {"rooms": room_list}


#Подключение к комнате
#В этот эндпоинт подключается второй игрок
#Если комната уже заполнена или не существует, возвращается ошибка.
@app.post("/rooms/{room_id}/join")
def join_room(room_id: int, current_user: PlayerModel = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.query(RoomModel).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.guest_username:
        raise HTTPException(status_code=400, detail="Комната уже занята")
    if room.host_username == current_user.username:
        raise HTTPException(status_code=400, detail="Нельзя подключиться к своей же комнате")
    
    room.guest_username = current_user.username
    room.status = "waiting"
    db.commit()
    return {
        "message": f"Вы подключены к комнате {room_id}",
        "room_id": room.id,
        "host": room.host_username,
        "guest": room.guest_username
    }


#Удаление комнаты
#Удаление может производиться только хостом.
#Если в комнате уже были ставки, производится возврат средств игрокам.
@app.delete("/rooms/{room_id}")
def delete_room(room_id: int, current_user: PlayerModel = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.query(RoomModel).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.host_username != current_user.username:
        raise HTTPException(status_code=403, detail="Только создатель комнаты может её удалить")
    # Если были сделаны ставки, возвращаем их (реализуйте логику возврата ставок)
    # Например:
    if room.host_bet > 0:
        host = db.query(PlayerModel).filter_by(username=room.host_username).first()
        host.coins += room.host_bet
    if room.guest_bet > 0:
        guest = db.query(PlayerModel).filter_by(username=room.guest_username).first()
        guest.coins += room.guest_bet
    db.delete(room)
    db.commit()
    return {"message": "Комната удалена, ставки возвращены (если были сделаны)"}


class BetRequest(BaseModel):
    bet: int

#Ставка и запуск раунда
#Каждый игрок делает ставку. При успешном списании монет из баланса ставка сохраняется в комнате.
#Если обе ставки выставлены, статус переключается в in_progress – далее можно запускать бросок кубиков.
@app.post("/rooms/{room_id}/bet")
def place_bet(
    room_id: int, 
    request: BetRequest, 
    current_user: PlayerModel = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    room = db.query(RoomModel).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.status == "finished":
        raise HTTPException(status_code=400, detail="Игра уже завершена")
    if request.bet <= 0:
        raise HTTPException(status_code=400, detail="Ставка должна быть больше 0")
    
    # Если текущий пользователь — хост
    if current_user.username == room.host_username:
        if room.host_bet != 0:
            raise HTTPException(status_code=400, detail="Ставка уже сделана")
        if current_user.coins < request.bet:
            raise HTTPException(status_code=400, detail="Недостаточно монет")
        room.host_bet = request.bet
        current_user.coins -= request.bet

        # Если в комнате гостем является бот, автоматически выставляем для него ставку
        if room.guest_username == "BOT" and room.guest_bet == 0:
            # Здесь можно выбрать логику: ставим ту же сумму, либо случайное число
            room.guest_bet = request.bet
    # Если текущий пользователь — гость
    elif current_user.username == room.guest_username:
        if room.guest_bet != 0:
            raise HTTPException(status_code=400, detail="Ставка уже сделана")
        # Если гость – бот, просто записываем ставку (без списания средств)
        if current_user.username == "BOT":
            room.guest_bet = request.bet
        else:
            if current_user.coins < request.bet:
                raise HTTPException(status_code=400, detail="Недостаточно монет")
            room.guest_bet = request.bet
            current_user.coins -= request.bet
    else:
        raise HTTPException(status_code=403, detail="Вы не состоите в этой комнате")
    
    # Если обе ставки выставлены, меняем статус на in_progress
    if room.host_bet != 0 and room.guest_bet != 0:
        room.status = "in_progress"
    
    db.commit()
    
    return {
        "message": "Ставка принята", 
        "room": {
            "id": room.id,
            "host_bet": room.host_bet,
            "guest_bet": room.guest_bet,
            "status": room.status
        }
    }



#Бросок кубиков и определение победителя раунда
#При вызове этого эндпоинта происходит бросок кубиков для обоих игроков. Победитель раунда получает сумму ставок.
#После раунда ставки обнуляются. Если один из игроков достиг 3 побед, игра завершается.
# ====================================
# Эндпоинт броска кубика (игровой этап)
# ====================================

@app.post("/rooms/{room_id}/roll")
async def roll_dice(
    room_id: int, 
    current_user: PlayerModel = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    room = db.query(RoomModel).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.status != "rolling":
        raise HTTPException(status_code=400, detail="Сейчас нельзя бросать кубик")
    
    # Проверяем, что ход определён и что это действительно ход текущего игрока
    if room.turn not in ["host", "guest"]:
        raise HTTPException(status_code=400, detail="Ход не определён")
    if (room.turn == "host" and current_user.username != room.host_username) or \
       (room.turn == "guest" and current_user.username != room.guest_username):
        raise HTTPException(status_code=400, detail="Сейчас не ваш ход")
    
    # Выполняем бросок кубика
    dice_value = random.randint(1, 6)
    
    if room.turn == "host":
        if room.host_stage_result != 0:
            raise HTTPException(status_code=400, detail="Вы уже бросали кубик в этом раунде")
        # Сохраняем результат хоста
        room.host_stage_result = dice_value
        room.host_total += dice_value
        # Передаём ход гостю
        room.turn = "guest"
        db.commit()
        payload = {
            "dice_value": dice_value,
            "player": room.host_username,
            "host_total": room.host_total,
            "guest_total": room.guest_total,
            "stage": room.stage,
            "status": room.status,
            "message": f"Хост бросил кубик: {dice_value}"
        }
        await manager.broadcast(room_id, {"event": "dice_result", "payload": payload})
        # После броска хоста сервер отправляет событие round_start с обновлённой информацией о ходе (для гостя)
        await manager.broadcast(room_id, {"event": "round_start", "payload": {"turn": room.turn, "stage": room.stage}})
        return {"message": "Хост бросил кубик", "dice": dice_value}
    
    elif room.turn == "guest":
        if room.host_stage_result == 0:
            raise HTTPException(status_code=400, detail="Хост ещё не бросил кубик")
        if room.guest_stage_result != 0:
            raise HTTPException(status_code=400, detail="Вы уже бросали кубик в этом раунде")
        # Сохраняем результат гостя
        room.guest_stage_result = dice_value
        room.guest_total += dice_value
        
        payload = {
            "dice_value": dice_value,
            "player": room.guest_username,
            "host_total": room.host_total,
            "guest_total": room.guest_total,
            "stage": room.stage,
            "status": room.status,
            "message": f"Гость бросил кубик: {dice_value}"
        }
        
        if room.stage >= 3:
            room.status = "finished"
        else:
            # Завершаем текущий раунд и начинаем новый
            room.stage += 1
            # Сбрасываем результаты раунда
            room.host_stage_result = 0
            room.guest_stage_result = 0
            # Задаём новый ход – например, пусть в новом раунде начинает хост
            room.turn = "host"
        db.commit()
        await manager.broadcast(room_id, {"event": "dice_result", "payload": payload})
        
        if room.status == "finished":
            if room.host_total > room.guest_total:
                winner = room.host_username
            elif room.guest_total > room.host_total:
                winner = room.guest_username
            else:
                winner = "tie"
            final_message = "Ничья! Предложите переиграть." if winner == "tie" else f"Победитель: {winner}"
            payload_final = {
                "final_message": final_message,
                "winner": winner,
                "host_total": room.host_total,
                "guest_total": room.guest_total
            }
            await manager.broadcast(room_id, {"event": "game_finished", "payload": payload_final})
        else:
            # Начинаем новый раунд – уведомляем всех о новом ходе
            await manager.broadcast(room_id, {"event": "round_start", "payload": {"turn": room.turn, "stage": room.stage}})
        return {"message": "Гость бросил кубик", "dice": dice_value}






#endpoint для переигровки
@app.post("/rooms/{room_id}/rematch")
def rematch(
    room_id: int,
    current_user: PlayerModel = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    room = db.query(RoomModel).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.status != "finished":
        raise HTTPException(status_code=400, detail="Игра еще не завершена")
    
    # Сбросить ставки и счет побед:
    room.host_bet = 0
    room.guest_bet = 0
    room.host_wins = 0
    room.guest_wins = 0
    room.status = "waiting"
    db.commit()
    return {"message": "Новая игра началась. Сделайте ставки."}


# WebSocket‑эндпоинт для обновления игровых данных:
@app.websocket("/ws/rooms/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: int):
    await manager.connect(room_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # Здесь можно обрабатывать входящие сообщения и, например, рассылать их всем участникам комнаты:
            await manager.broadcast(room_id, {
                "room_id": room_id,
                "event": data.get("event"),
                "payload": data.get("payload")
            })
    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)

# ====================================
# Эндпоинт для подтверждения готовности
# ====================================

@app.post("/rooms/{room_id}/ready")
async def player_ready(room_id: int, current_user: PlayerModel = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.query(RoomModel).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if current_user.username not in [room.host_username, room.guest_username]:
        raise HTTPException(status_code=403, detail="Вы не состоите в этой комнате")
    
    if current_user.username == room.host_username:
        room.host_ready = 1
    elif current_user.username == room.guest_username:
        room.guest_ready = 1
    db.commit()
    
    # Если оба игрока готовы, переводим комнату в состояние "rolling" и выбираем, кто ходит первым
    if room.host_ready and room.guest_ready:
        turn = random.choice(["host", "guest"])
        room.turn = turn
        room.host_ready = 0
        room.guest_ready = 0
        room.status = "rolling"
        db.commit()
        await manager.broadcast(room_id, {
            "event": "round_start",
            "payload": {"turn": turn, "stage": room.stage}
        })
    return {"message": "Готовность подтверждена."}


    # =========================================
# Эндпоинт предложения переигровки (rematch_offer)
# =========================================

@app.post("/rooms/{room_id}/rematch_offer")
def rematch_offer(room_id: int, current_user: PlayerModel = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.query(RoomModel).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.status != "finished":
        raise HTTPException(status_code=400, detail="Игра не завершена")
    room.rematch_offer = current_user.username
    db.commit()
    asyncio.create_task(manager.broadcast(room_id, {
        "event": "rematch_offer",
        "payload": {"from": current_user.username}
    }))
    return {"message": "Предложение о переигровке отправлено."}

# =========================================
# Эндпоинт ответа на предложение переигровки (rematch_response)
# =========================================

class RematchResponse(BaseModel):
    accept: bool

@app.post("/rooms/{room_id}/rematch_response")
async def rematch_response(room_id: int, response: RematchResponse, current_user: PlayerModel = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.query(RoomModel).filter_by(id=room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Комната не найдена")
    if room.status != "finished":
        raise HTTPException(status_code=400, detail="Игра не завершена")
    if room.rematch_offer == "" or room.rematch_offer == current_user.username:
        raise HTTPException(status_code=400, detail="Нет корректного предложения переиграть")
    
    if response.accept:
        room.stage = 1
        room.host_total = 0
        room.guest_total = 0
        room.host_stage_result = 0
        room.guest_stage_result = 0
        room.status = "ready"
        room.rematch_offer = ""
        db.commit()
        await manager.broadcast(room_id, {
            "event": "rematch_accepted",
            "payload": {"message": "Переигровка принята. Нажмите 'Готов' для начала нового раунда."}
        })
        return {"message": "Переигровка принята."}
    else:
        await manager.broadcast(room_id, {
            "event": "rematch_declined",
            "payload": {"message": "Переигровка отклонена."}
        })
        room.rematch_offer = ""
        db.commit()
        return {"message": "Переигровка отклонена."}
