const baseUrl = window.location.origin;

// Глобальные переменные для хранения состояния игры в комнате
let currentRoomId = null;
let ws;  // WebSocket
let currentTurn = "";  // "host" или "guest"
let currentStage = 1;  // Номер текущего раунда


// Функция для подключения к WebSocket
function connectWebSocket(roomId) {
  const protocol = (window.location.protocol === "https:") ? "wss" : "ws";
  ws = new WebSocket(`${protocol}://${window.location.host}/ws/rooms/${roomId}`);

  ws.onopen = () => {
    console.log("WebSocket подключён к комнате", roomId);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("WS получил:", data);
    if (!data.event) return;

    // 1) round_start
    if (data.event === "round_start") {
        // Сервер сказал: новый раунд.
      const p = data.payload;
      currentTurn = p.turn;   // "host" или "guest"
      currentStage = p.stage; // номер раунда
      document.getElementById("game-result").innerHTML =
        `<p>Раунд ${currentStage} начался. Ходит: ${currentTurn === "host" ? "Хост" : "Гость"}</p>`;

      // Если вы хотите снова «Готов» перед каждым раундом, делайте так:
      document.getElementById("ready-btn").classList.remove("hidden");
      // ...но отключите кнопку броска:
      document.getElementById("roll-btn").disabled = true;
    }

    // 2) dice_result
    else if (data.event === "dice_result") {
      const p = data.payload;
      document.getElementById("game-result").innerHTML += 
        `<p>${p.player} бросил кубик: ${p.dice_value}</p>
         <p>Счёт: Хост ${p.host_total} – Гость ${p.guest_total}</p>`;

      // Если статус не finished, смотрим, у кого следующий ход:
      if (p.status !== "finished") {
        // p.playerTurn = "guest" или "host" или null
        if (p.playerTurn === "guest") {
          currentTurn = "guest";
        } else if (p.playerTurn === "host") {
          currentTurn = "host";
        } else {
          // null — значит, раунд закончился, ждём round_start
          currentTurn = null;
        }

        // Разблокируем кнопку броска тому, у кого ход:
        const currentUser = localStorage.getItem("username");
        if (currentTurn === "host" && currentUser === window.currentHost) {
          document.getElementById("roll-btn").disabled = false;
        } else if (currentTurn === "guest" && currentUser === window.currentGuest) {
          document.getElementById("roll-btn").disabled = false;
        } else {
          document.getElementById("roll-btn").disabled = true;
        }
      }
    }

    // 3) game_finished
    else if (data.event === "game_finished") {
      const p = data.payload;
      document.getElementById("game-result").innerHTML += `<p>${p.final_message}</p>`;
      document.getElementById("roll-btn").disabled = true;
      document.getElementById("ready-btn").disabled = true;
      // Можно показать кнопку "Переиграть":
      showRematchOfferUI();
    }

    // 4) rematch_offer
    else if (data.event === "rematch_offer") {
      const from = data.payload.from;
      const accept = confirm(`Игрок ${from} предлагает переиграть. Принять?`);
      answerRematch(yes);
    }

    // 5) rematch_accepted
    else if (data.event === "rematch_accepted") {
      alert(data.payload.message);
      resetGameUI();
    }

    // 6) rematch_declined
    else if (data.event === "rematch_declined") {
      alert(data.payload.message);
      document.getElementById("game-room-overlay").classList.add("hidden");
    }
  };

  ws.onclose = () => {
    console.log("WebSocket закрыт");
  };
}




// Вызов функции восстановления при загрузке страницы

document.addEventListener("DOMContentLoaded", () => {
    console.log("✅ DOM загружен, назначаем обработчики...");

    // Настраиваем кнопки модального окна регистрации
    const openModalBtn = document.getElementById("open-register-modal");
    if (openModalBtn) {
        openModalBtn.addEventListener("click", openModal);
    } else {
        console.error("❌ Кнопка #open-register-modal не найдена!");
    }
    const cancelModalBtn = document.getElementById("modal-cancel");
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener("click", closeModal);
    } else {
        console.error("❌ Кнопка #modal-cancel не найдена!");
    }
    const registerBtn = document.getElementById("modal-register");
    if (registerBtn) {
        registerBtn.addEventListener("click", handleRegister);
    } else {
        console.error("❌ Кнопка #modal-register не найдена!");
    }

    // Обработчик для поля ввода ставки
    const betInput = document.getElementById("bet");
    if (betInput) {
        betInput.addEventListener("keypress", function(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                this.blur();
            }
        });
    }

    // Настраиваем элементы модального окна комнат
    const roomsBtn = document.getElementById("rooms-btn");
    const roomsModal = document.getElementById("rooms-modal");

    if (roomsBtn) {
      roomsBtn.addEventListener("click", () => {
        roomsModal.classList.remove("hidden");
        loadRooms(); // загрузка списка комнат
      });
    }

    const closeRoomsBtn = document.getElementById("close-rooms-btn");
    if (closeRoomsBtn) {
      closeRoomsBtn.addEventListener("click", () => {
        roomsModal.classList.add("hidden");
      });
    }

    adjustLayout();
    window.addEventListener("resize", adjustLayout);
    checkAuth();

    const currentPath = window.location.pathname;
    const token = localStorage.getItem("token");

    if (token && !window.location.pathname.includes("game.html")) {
        window.location.href = "game.html";
    } else if (!token && window.location.pathname.includes("game.html")) {
        window.location.href = "register.html";
    }

    if (currentPath.includes("register.html")) {
        console.log("Находимся на странице регистрации. Проверка токена не требуется.");
        return;
    }
    if (currentPath.includes("game.html")) {
        console.log("Находимся на странице игры. Проверка токена...");
        restoreState();
        return;
    }
    console.log("Неизвестный путь. Перенаправление...");
    window.location.href = "register.html";
});


function applyBet() {
    document.getElementById("bet").blur(); // Закрывает клавиатуру
}

// Открытие модального окна
function openModal() {
    console.log("🔹 Открытие модального окна...");
    const modal = document.getElementById("register-modal");
    if (modal) {
        modal.classList.remove("hidden");
    } else {
        console.error("❌ #register-modal не найден!");
    }
}

// Закрытие модального окна
function closeModal() {
    console.log("🔹 Закрытие модального окна...");
    const modal = document.getElementById("register-modal");
    if (modal) {
        modal.classList.add("hidden");
    } else {
        console.error("❌ #register-modal не найден!");
    }
}

function showError(message) {
    const errorMsg = document.getElementById("error-message");
    errorMsg.textContent = message;
    errorMsg.classList.remove("hidden");
    setTimeout(() => errorMsg.classList.add("hidden"), 3000);
}

// Регистрация пользователя
async function handleRegister() {
    console.log("🟢 Нажата кнопка регистрации");

    const username = document.getElementById("modal-username").value.trim();
    const password = document.getElementById("modal-password").value.trim();

    if (!username || !password) {
        showError("Введите имя пользователя и пароль!");
        return;
    }

    console.log(`📡 Отправляем запрос на регистрацию (${username})`);

    try {
        const response = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        console.log("📩 Ответ сервера:", data);

        if (response.ok) {
            localStorage.setItem("token", data.access_token);
            localStorage.setItem("username", username);
            console.log("✅ Регистрация успешна, редирект в game.html...");
            window.location.href = "game.html";
        } else {
            alert(data.detail || "Ошибка при регистрации.");
        }
    } catch (error) {
        console.error("❌ Ошибка при регистрации:", error);
        alert("Ошибка сети. Попробуйте снова.");
    }
}

// Проверка авторизации
function checkAuth() {
    const token = localStorage.getItem("token");
    const path = window.location.pathname;

    if (token) {
        if (!path.includes("game.html")) {
            console.log("✅ Пользователь авторизован, перенаправляем в игру...");
            window.location.href = "game.html";
        }
    } else {
        if (path.includes("game.html")) {
            console.log("🚫 Нет токена, перенаправляем на регистрацию...");
            window.location.href = "register.html";
        }
    }
}

// Восстановление состояния при загрузке страницы
// Восстановление состояния при загрузке страницы
function restoreState() {
    const token = localStorage.getItem("token");

    if (!token) {
        console.log("Токен отсутствует, перенаправление на регистрацию...");
        window.location.href = "register.html";
        return;
    }

    // Добавляем токен в заголовки для всех последующих запросов
    fetch(`${baseUrl}/validate-token`, {
        headers: {
            "Authorization": `Bearer ${token}`
        }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            localStorage.removeItem("token");
            window.location.href = "register.html";
        }
    })
    .then(data => {
        if (data) {
            localStorage.setItem("username", data.username);
            updateProfile(data.username, data);
            // Если мы уже на game.html, остаемся здесь
             // Приветственное уведомление
            showNotification(`Добро пожаловать, ${data.username}! 🎉`, "success");
            if (!window.location.pathname.includes("game.html")) {
                window.location.href = "game.html";
            }
        }
    })
    .catch(error => {
        console.error("Ошибка при проверке токена:", error);
        window.location.href = "register.html";
    });
}


// Функция для корректировки размеров
function adjustLayout() {
    const container = document.querySelector('.container');
    const statsPanel = document.querySelector('.stats-panel');
    const mainPanel = document.querySelector('main');
    const animationArea = document.getElementById('animation-area');

    if (container && statsPanel && mainPanel) {
        const containerHeight = window.innerHeight;

        // Устанавливаем высоту боковой панели
        statsPanel.style.height = `${containerHeight}px`;

        // Устанавливаем высоту основной панели
        const statsPanelHeight = statsPanel.offsetHeight;
        mainPanel.style.height = `${containerHeight}px`;

        // Проверяем размеры анимации
        if (animationArea) {
        const containerWidth = animationArea.offsetWidth;
        animationArea.style.height = `${Math.max(100, containerWidth * 6 / 16)}px`; // Пропорция 6:16
    }

        // Проверяем высоту нижних элементов
        adjustBottomPanel(mainPanel, containerHeight);
    }
}

// Исправление положения нижних элементов
function adjustBottomPanel(mainPanel, containerHeight) {
    const debugConsole = document.getElementById("debug-console");
    const tabs = document.getElementById("tabs");

    if (debugConsole && tabs) {
        const debugHeight = debugConsole.offsetHeight;
        const tabsHeight = tabs.offsetHeight;

        const remainingHeight = containerHeight - (tabsHeight + debugHeight);

        if (remainingHeight > 0) {
            mainPanel.style.paddingBottom = `${remainingHeight}px`; // Добавляем отступы снизу
        } else {
            mainPanel.style.paddingBottom = "0px"; // Убираем отступы, если места достаточно
        }
    }
}

function showNotification(message, type = "info", duration = 3000) {
    const container = document.getElementById("notification-container");

    const notification = document.createElement("div");
    notification.classList.add("notification", type, "show");

    notification.innerHTML = `
        <span>${message}</span>
        <button class="close-btn" onclick="this.parentElement.classList.add('hide')">&times;</button>
    `;

    container.appendChild(notification);

    // Автоматическое скрытие
    setTimeout(() => {
        notification.classList.add("hide");
        setTimeout(() => notification.remove(), 400); // Удаляем после анимации
    }, duration);
}





// Логирование событий в консоль
function logDebug(message) {
    const debugLog = document.getElementById("debug-log");
    const timestamp = new Date().toLocaleTimeString();
    debugLog.textContent += `[${timestamp}] ${message}\n`;
    debugLog.scrollTop = debugLog.scrollHeight; // Прокрутка вниз
}

// Сохранение данных в LocalStorage
function saveToLocalStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// Получение данных из LocalStorage
function getFromLocalStorage(key) {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
}

// Удаление данных из LocalStorage
function removeFromLocalStorage(key) {
    localStorage.removeItem(key);
}

// Регистрация пользователя
async function register() {
    const username = document.getElementById("username").value.trim();
    if (!username) {
        alert("Please enter a username!");
        return;
    }

    // Запрос пароля
    const password = prompt("Введите пароль:");
    if (!password) {
        alert("Пароль не может быть пустым.");
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/register`, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username: username, password: password })
        });

        const data = await response.json();

        if (response.ok) {
            // Сохраняем токен и имя пользователя
            localStorage.setItem("token", data.access_token);
            localStorage.setItem("username", username);
            window.location.href = "game.html";
        } else {
            alert(data.detail || "Registration failed.");
        }
    } catch (error) {
        alert("An error occurred during registration. Please try again.");
    }
}



function switchToMainInterface() {
    document.getElementById("registration").classList.add("hidden"); // Скрываем регистрацию
    document.getElementById("tabs").classList.remove("hidden"); // Показываем игру
    logDebug("Switched to main interface.");
}

// Сбор ежедневной награды
async function dailyReward() {
    const username = document.getElementById("profile-username").innerText;
    if (!username || username === "Guest") {
        showModal("Пожалуйста, зарегистрируйтесь!", "error");
        return;
    }

    // Показываем анимацию, что мы «запросили Daily»
    showAnimation("daily");

    try {
        const response = await fetch(`${baseUrl}/daily/${username}`, {
          headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });
        const data = await response.json();
        if (data.total_coins) {
            document.getElementById("stat-coins").innerText = data.total_coins;
        }
        showModal(data.message, "success");
    } catch (error) {
        showModal(`Ошибка при получении ежедневной награды: ${error}`, "error");
    } finally {
        // НЕ вызываем hideAllAnimations() здесь!
        // Вместо этого обновим таймеры — они сами решат,
        // показать или спрятать daily-анимацию
        fetchTimers();
    }
}


// Работа
async function workReward() {
    const username = document.getElementById("profile-username").innerText;
    if (!username || username === "Guest") {
        showModal("Пожалуйста, зарегистрируйтесь!", "error");
        return;
    }

    // Показываем анимацию «Работаем»
    showAnimation("work");

    try {
        const response = await fetch(`${baseUrl}/work/${username}`, {
          headers: {
            "Authorization": "Bearer " + localStorage.getItem("token")
        }
    });
        const data = await response.json();
        if (data.total_coins) {
            document.getElementById("stat-coins").innerText = data.total_coins;
        }
        showModal(data.message, "success");
    } catch (error) {
        showModal(`Ошибка при работе: ${error}`, "error");
    } finally {
        // НЕ скрываем анимацию вручную,
        // а даём fetchTimers() показать или спрятать «work-animation»
        fetchTimers();
    }
}


let diceAnimationInterval = null; // Храним ID интервала для анимации

// Бросить кубик
async function playDice() {
    const username = document.getElementById("profile-username").innerText;
    const betInput = document.getElementById("bet").value;
    const bet = betInput ? parseInt(betInput, 10) : 0;

    if (!username || username === "Guest") {
        showModal("Пожалуйста, зарегистрируйтесь!", "error");
        return;
    }
    if (bet <= 0) {
        showModal("Ставка должна быть больше 0.", "error");
        return;
    }

    const canvas = document.getElementById('diceCanvas');
    const ctx = canvas.getContext('2d');
const diceWidth = canvas.width / 2;  // Половина ширины canvas
    const diceHeight = canvas.height;    // Полная высота canvas

   function drawDice(x, y, width, height, value) {
    const img = new Image();
    img.src = `/static/images/dice/dice-${value}.png`;
    img.onload = () => {
        ctx.drawImage(img, x, y, width, height);
    };
}

    showElementById("dice-animation");

    // Анимация случайных значений
    let interval = setInterval(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const random1 = Math.floor(Math.random() * 6) + 1;
        const random2 = Math.floor(Math.random() * 6) + 1;
        const diceWidth = canvas.width / 2; // Половина ширины canvas
    const diceHeight = canvas.height;  // Полная высота canvas

    drawDice(0, 0, diceWidth, diceHeight, random1);  // Левый кубик
    drawDice(diceWidth, 0, diceWidth, diceHeight, random2); // Правый кубик
    }, 100);

    try {
        // Запрос к серверу
        const response = await fetch(`${baseUrl}/games/dice/${username}?bet=${bet}`, {
            headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
        });

        if (!response.ok) {
            const errorData = await response.json();
            showModal(errorData.detail || "Ошибка при броске кубика", () => {
                hideElementById("dice-animation"); // Кубики пропадают только после нажатия кнопки
            });
            clearInterval(interval);
            return;
        }

        const data = await response.json();
        const [dice1, dice2] = data.dice;

        // Показать реальные результаты
        setTimeout(() => {
            clearInterval(interval); // Останавливаем анимацию
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawDice(0, 0, canvas.width / 2, canvas.height, dice1);  // Левый кубик
    drawDice(canvas.width / 2, 0, canvas.width / 2, canvas.height, dice2); // Правый кубик

            // Логируем реальный результат
            console.log("Ответ сервера:", data);
             // Модальное окно теперь ждет нажатия кнопки, перед тем как спрятать кубики
            showModal(data.message, () => {
                hideElementById("dice-animation"); // Кубики пропадают только после нажатия "ОК" или "Отмена"
            });

            

            // Обновляем статистику
            document.getElementById("stat-coins").textContent = data.total_coins;
            document.getElementById("stat-free-rolls").textContent = data.free_rolls;

             }, 1500); // Даем время на завершение анимации
    } catch (error) {
        showModal(`Ошибка: ${error.message}`, () => {
            hideElementById("dice-animation"); // Кубики исчезнут после закрытия окна
        });
        clearInterval(interval);
    }
}



//Эндпоинт для покупки бросков.
// Покупка бросков
async function buyRolls() {
    showModal("Сколько бросков вы хотите купить? (1 бросок = 10 монет)", async (rollsToBuy) => {
        if (!rollsToBuy || rollsToBuy <= 0) {
            showModal("Некорректное количество бросков.", () => {});
            return;
        }

        const username = document.getElementById("profile-username").innerText;
        if (!username || username === "Guest") {
            showModal("Пожалуйста, зарегистрируйтесь!", () => {});
            return;
        }

        try {
            const response = await fetch(`${baseUrl}/buy-rolls/${username}`, {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + localStorage.getItem("token"),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ rolls: rollsToBuy })
            });
            const data = await response.json();

            if (response.ok) {
                document.getElementById("stat-coins").innerText = data.total_coins;
                document.getElementById("stat-free-rolls").innerText = data.free_rolls;
                showModal(data.message, () => {});
            } else {
                showModal(data.detail || "Ошибка при покупке бросков.", () => {});
            }
        } catch (error) {
            showModal("Ошибка при покупке бросков: " + error, () => {});
        }
    }, true);
}


// Функция для покупки дополнительных бросков
async function buyAdditionalRolls(username) {
    const rollsToBuy = parseInt(prompt("Сколько бросков вы хотите купить? (1 бросок = 10 монет)"), 10);
    if (isNaN(rollsToBuy) || rollsToBuy <= 0) {
        alert("Некорректное количество бросков.");
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/buy-rolls/${username}`, {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + localStorage.getItem("token"),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ rolls: rollsToBuy })
        });
        const data = await response.json();

        if (response.ok) {
            alert(data.message);
            document.getElementById("stat-coins").innerText = data.total_coins;
            document.getElementById("stat-free-rolls").innerText = data.free_rolls;
        } else {
            alert(data.detail || "Ошибка при покупке бросков.");
        }
    } catch (error) {
        logDebug(`Error buying rolls: ${error}`);
        alert("An error occurred while buying rolls.");
    }
}

// Переход к основному интерфейсу
function switchToMainInterface() {
    document.getElementById("registration").classList.add("hidden");
    document.getElementById("tabs").classList.remove("hidden");
    logDebug("Switched to main interface.");
}

// Обновление профиля
function updateProfile(username, data) {
    document.getElementById("profile-username").innerText = username;
    document.getElementById("stat-coins").innerText = data.coins || 0;
    document.getElementById("stat-rank").innerText = data.rank || "---";
    document.getElementById("stat-free-rolls").innerText = data.free_rolls || 0;

    // Обновляем аватар
    const avatarElement = document.getElementById("avatar");
    avatarElement.src = `/static/avatars/${data.avatar}?v=` + new Date().getTime();

    logMessage(
      `Профиль обновлён: Имя = ${username}, Монеты = ${data.coins}, ` +
      `Ранг = ${data.rank}, Free Rolls = ${data.free_rolls}`,
      "info"
    );



    // <-- Добавляем вызов для таймеров, т.к. username уже точно не "Guest"
    fetchTimers();
}




//  функцию для удаления профиля:
async function deleteProfile() {
    const username = document.getElementById("profile-username").innerText;
    if (!username || username === "Guest") {
        showModal("Пожалуйста, зарегистрируйтесь!", () => {});
        return;
    }

    showModal("Вы уверены, что хотите удалить свой профиль? Это действие нельзя отменить.", async (confirmed) => {
        if (!confirmed) return;

        try {
            const response = await fetch(`${baseUrl}/delete-profile/${username}`, {
                method: "DELETE"
            });
            const data = await response.json();

            if (response.ok) {
                showModal("Аккаунт успешно удален.", () => {
                    removeFromLocalStorage("username");
                    window.location.href = "register.html";
                });
            } else {
                showModal(data.detail || "Ошибка при удалении профиля.", () => {});
            }
        } catch (error) {
            showModal("Произошла ошибка при удалении профиля.", () => {});
        }
    });
}




// Переключение вкладок
function showTab(tabId) {
    saveLogs(); // Сохраняем текущие логи

    const tabs = document.querySelectorAll(".tab-content");
    tabs.forEach(tab => tab.classList.remove("active"));
    document.getElementById(tabId).classList.add("active");

    const buttons = document.querySelectorAll(".tab-button");
    buttons.forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");

    restoreLogs(); // Восстанавливаем логи
    logMessage(`Переключено на вкладку: ${tabId}`, "info");

    // <-- Запоминаем текущую вкладку во "внешней" переменной
    window.currentTab = tabId;

    // Можно заново вызвать fetchTimers(), чтобы сразу обновить логику анимаций
    fetchTimers();
}


let logHistory = [];

function saveLogs() {
    const debugLog = document.getElementById("debug-log");
    logHistory = [...debugLog.children].map(child => child.outerHTML);
}

function restoreLogs() {
    const debugLog = document.getElementById("debug-log");
    debugLog.innerHTML = ""; // Очищаем перед восстановлением
    logHistory.forEach(log => debugLog.innerHTML += log);
}


// функции для управления меню:
function toggleSettingsMenu() {
    const settingsMenu = document.getElementById("settings-menu");
    if (!settingsMenu) return;

    settingsMenu.classList.toggle("hidden");
    settingsMenu.style.display = settingsMenu.classList.contains("hidden") ? "none" : "block";
}

function toggleAvatarSelector() {
    const avatarMenu = document.getElementById("avatar-selector");
    if (avatarMenu) {
        if (avatarMenu.classList.contains("hidden")) {
            avatarMenu.style.display = ""; // Сбрасываем стиль
            avatarMenu.classList.remove("hidden");
        } else {
            avatarMenu.style.display = "none"; // Принудительно скрываем
            avatarMenu.classList.add("hidden");
        }
        console.log("Current display style:", getComputedStyle(avatarMenu).display);
    }
}



// Выбрать аватарку
async function selectAvatar(avatarName) {
    const username = document.getElementById("profile-username").innerText;
    if (!username || username === "Guest") {
        showModal("Пожалуйста, зарегистрируйтесь!", () => {});
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/set-avatar/${username}`, {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + localStorage.getItem("token"),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ avatar: avatarName })
        });

        const data = await response.json();

        if (response.ok) {
            const avatarElement = document.getElementById("avatar");

            // Обход кеша с `?v=` + timestamp
            avatarElement.src = `/static/avatars/${avatarName}?v=${new Date().getTime()}`;

            showModal("Аватарка успешно изменена!", () => {});
        } else {
            showModal(data.detail || "Ошибка при изменении аватарки.", () => {});
        }
    } catch (error) {
        showModal("Произошла ошибка при изменении аватарки.", () => {});
    }
}





// Функция для логирования сообщений в стилизованную консоль
function logMessage(message, type = 'info') {
    const debugLog = document.getElementById("debug-log");
    const timestamp = new Date().toLocaleTimeString();
    const formattedMessage = `[${timestamp}] ${message}`;

    // Проверяем, если сообщение уже есть, не добавляем его снова
    const lastMessage = debugLog.lastElementChild;
    if (lastMessage && lastMessage.textContent.includes(message)) {
        return;
    }

    const messageElement = document.createElement("div");
    messageElement.classList.add("log-message", type);
    messageElement.innerHTML = `<span class="timestamp">${formattedMessage}</span>`;
    debugLog.appendChild(messageElement);
    debugLog.scrollTop = debugLog.scrollHeight; // Прокрутка вниз
}

// Вызов при загрузке страницы
document.addEventListener("DOMContentLoaded", fetchTimers);

async function fetchTimers() {
    const username = document.getElementById("profile-username").innerText;
    if (!username || username === "Guest") return;

    try {
        const response = await fetch(`${baseUrl}/timers/${username}`);
        if (!response.ok) {
            throw new Error("Не удалось получить таймеры");
        }
        const data = await response.json();

        // Определим, на какой вкладке мы сейчас
        const currentTab = window.currentTab || "daily";

        // DAILY-анимация: только если мы на вкладке "daily" и daily>0
        if (currentTab === "daily" && data.daily > 0) {
            showElementById("daily-animation");
        } else {
            hideElementById("daily-animation");
        }

        // WORK-анимация: только если мы на вкладке "work" и work>0
        if (currentTab === "work" && data.work > 0) {
            showElementById("work-animation");
        } else {
            hideElementById("work-animation");
        }

        // Dice-анимацию мы не трогаем здесь, она не завязана на таймер.

        // Запускаем визуальный отсчёт на странице (если надо)
        startTimer(data.daily, document.getElementById("daily-timer"));
        startTimer(data.work, document.getElementById("work-timer"));
        startTimer(data.free_rolls, document.getElementById("free-rolls-timer"));
    } catch (error) {
        console.error("Ошибка получения таймеров:", error);
    }
}




function startTimer(duration, display) {
    if (duration <= 0) {
        display.textContent = "Готово!";
        return;
    }

    let timer = duration;
    clearInterval(display.timerInterval);

    display.timerInterval = setInterval(() => {
        display.textContent = formatTimeRemaining(timer);

        if (--timer < 0) {
            clearInterval(display.timerInterval);
            display.textContent = "Готово!";
        }
    }, 1000);
}


function toggleMenu() {
    const panel = document.getElementById("stats-panel");
    
    if (panel.style.display === "none") {
        panel.style.display = "block";
        setTimeout(() => panel.classList.add("active"), 10);
    } else {
        panel.classList.remove("active");
        setTimeout(() => panel.style.display = "none", 300);
    }
}

function showModal(message, callback, inputRequired = false) {
    const modal = document.getElementById("custom-modal");
    const messageElement = document.getElementById("modal-message");
    const inputField = document.getElementById("modal-input");
    const confirmButton = document.getElementById("modal-confirm");
    const cancelButton = document.getElementById("modal-cancel");

    messageElement.textContent = message;
    modal.classList.remove("hidden");

    if (inputRequired) {
        inputField.classList.remove("hidden");
        inputField.value = "";
        inputField.focus();
    } else {
        inputField.classList.add("hidden");
    }

    confirmButton.onclick = () => {
        const inputValue = inputRequired ? parseInt(inputField.value, 10) : true;
        modal.classList.add("hidden");
        callback(inputValue);
    };

    cancelButton.onclick = () => {
        modal.classList.add("hidden");
        callback(false);
    };
}



function formatTimeRemaining(seconds) {
    // Если время вышло или нет, показываем «Готово!»
    if (seconds <= 0) {
        return "Готово!";
    }

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
        // Показываем часы и минуты
        // Пример: "2ч 15м"
        return `${hrs}ч ${mins}м`;
    } else if (mins > 0) {
        // Показываем минуты и секунды
        // Пример: "45м 30с"
        return `${mins}м ${secs}с`;
    } else {
        // Меньше минуты - показываем только секунды
        // Пример: "30с"
        return `${secs}с`;
    }
}

function showElementById(id) {
    document.getElementById(id).classList.remove("hidden");
}

function hideElementById(id) {
    document.getElementById(id).classList.add("hidden");
}


function showAnimation(type) {
    // Спрячем все анимации
    document.getElementById("daily-animation").classList.add("hidden");
    document.getElementById("work-animation").classList.add("hidden");
    document.getElementById("dice-animation").classList.add("hidden");

    // Покажем нужную
    if (type === "daily") {
        document.getElementById("daily-animation").classList.remove("hidden");
    } else if (type === "work") {
        document.getElementById("work-animation").classList.remove("hidden");
    } else if (type === "dice") {
        document.getElementById("dice-animation").classList.remove("hidden");
    }
}

function hideAllAnimations() {
    document.getElementById("daily-animation").classList.add("hidden");
    document.getElementById("work-animation").classList.add("hidden");
    document.getElementById("dice-animation").classList.add("hidden");
}


//Функция загрузки списка комнат:-----------------------------------------------------------------------------------------------------------------
async function loadRooms() {
  const baseUrl = window.location.origin;
  try {
    const response = await fetch(`${baseUrl}/rooms`);
    if (!response.ok) {
      throw new Error("Не удалось загрузить комнаты");
    }
    const data = await response.json();
    const container = document.getElementById("rooms-list-scroll");
    container.innerHTML = ""; // очистка контейнера

    const currentUser = localStorage.getItem("username");

    data.rooms.forEach(room => {
      // Создаем элемент для комнаты
      const roomDiv = document.createElement("div");
      roomDiv.classList.add("room-item");
      roomDiv.style.borderBottom = "1px solid #ccc";
      roomDiv.style.padding = "10px";
      roomDiv.style.cursor = "pointer";
      roomDiv.style.position = "relative"; // чтобы кнопка удаления могла позиционироваться внутри

      // Формируем информацию о комнате
      roomDiv.innerHTML = `
        <strong>Комната #${room.room_id}</strong><br>
        Хост: ${room.host}<br>
        Гость: ${room.guest || '---'}<br>
        Участников: ${room.participants}
      `;

      // Если текущий пользователь уже участвует в комнате,
      // делаем всю запись кликабельной для повторного входа
      if (currentUser === room.host || currentUser === room.guest) {
        roomDiv.onclick = () => {
          currentRoomId = room.room_id;
          connectWebSocket(currentRoomId);
          showGameRoom(room.room_id, room.host, room.guest);
        };

        // Если пользователь является хозяином, добавляем кнопку "Удалить"
        if (currentUser === room.host) {
          const deleteBtn = document.createElement("button");
          deleteBtn.textContent = "Удалить";
          deleteBtn.style.position = "absolute";
          deleteBtn.style.top = "5px";
          deleteBtn.style.right = "5px";
          deleteBtn.style.backgroundColor = "#e94560";
          deleteBtn.style.color = "#fff";
          deleteBtn.style.border = "none";
          deleteBtn.style.padding = "3px 6px";
          deleteBtn.style.cursor = "pointer";
          deleteBtn.addEventListener("click", (e) => {
            e.stopPropagation(); // чтобы не срабатывал клик на всей записи
            if (confirm("Вы уверены, что хотите удалить эту комнату?")) {
              deleteRoom(room.room_id);
            }
          });
          roomDiv.appendChild(deleteBtn);
        }
      } else {
        // Если пользователь не в комнате – при клике вызываем joinRoom
        roomDiv.onclick = () => joinRoom(room.room_id);
      }
      container.appendChild(roomDiv);
    });

    // Если пользователь уже создал комнату, можно скрыть кнопку создания комнаты,
    // либо оставить её видимой – в данном случае код не меняется.
    const createRoomBtn = document.querySelector(".create-room-area button");
    // Например, если пользователь уже является хозяином хотя бы одной комнаты,
    // можно скрыть кнопку:
    const userHasRoom = data.rooms.some(room => currentUser === room.host);
    createRoomBtn.style.display = userHasRoom ? "none" : "inline-block";
  } catch (error) {
    console.error("Ошибка загрузки комнат:", error);
    alert("Ошибка загрузки комнат: " + error.message);
  }
}






//Функция создания комнаты:
document.getElementById("create-room-btn").addEventListener("click", async () => {
  const baseUrl = window.location.origin;
  const token = localStorage.getItem("token");
  try {
    const response = await fetch(`${baseUrl}/rooms/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      }
    });
    const data = await response.json();
    alert(data.message);
    loadRooms(); // обновляем список комнат
    currentRoomId = data.room_id;
    connectWebSocket(currentRoomId);
    // Вызываем showGameRoom: хост – текущий пользователь, гость пока не определён
    showGameRoom(data.room_id, localStorage.getItem("username"), "");
  } catch (error) {
    console.error("Ошибка создания комнаты:", error);
    alert("Ошибка создания комнаты: " + error.message);
  }
});






//Функции подключения к комнате и удаления:
async function joinRoom(roomId) {
  const baseUrl = window.location.origin;
  const token = localStorage.getItem("token");
  try {
    const response = await fetch(`${baseUrl}/rooms/${roomId}/join`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      }
    });
    const data = await response.json();
    alert(data.message);
    loadRooms(); // обновляем список комнат
    currentRoomId = data.room_id;
    connectWebSocket(currentRoomId);
    // Передаем хост и гостя из ответа
    showGameRoom(data.room_id, data.host, data.guest);
  } catch (error) {
    console.error("Ошибка подключения к комнате:", error);
    alert("Ошибка подключения к комнате: " + error.message);
  }
}



async function deleteRoom(roomId) {
  const baseUrl = window.location.origin;
  const token = localStorage.getItem("token");
  try {
    const response = await fetch(`${baseUrl}/rooms/${roomId}`, {
      method: "DELETE",
      headers: {
        "Authorization": "Bearer " + token
      }
    });
    const data = await response.json();
    alert(data.message);
    loadRooms(); // обновляем список комнат
  } catch (error) {
    console.error("Ошибка удаления комнаты:", error);
    alert("Ошибка удаления комнаты: " + error.message);
  }
}



// Функция для отображения игрового интерфейса (вызывается, когда вы присоединяетесь к комнате или создаёте её)
function showGameRoom(roomId, host, guest) {
  currentRoomId = roomId;
  window.currentHost = host;
  window.currentGuest = guest;
  const roomInfo = document.getElementById("room-info");
  roomInfo.textContent = `Комната #${roomId}. Хост: ${host}, Гость: ${guest || '---'}`;
  document.getElementById("game-room-overlay").classList.remove("hidden");
}




// Обработчик закрытия игрового интерфейса
document.getElementById("close-game-room-btn").addEventListener("click", () => {
  const gameRoomOverlay = document.getElementById("game-room-overlay");
  gameRoomOverlay.classList.add("hidden");
});

// Функция для отправки ставки через WebSocket
async function placeBet() {
  const betAmount = parseInt(document.getElementById("bet-amount").value, 10);
  if (!betAmount || betAmount <= 0) {
    alert("Введите корректную сумму ставки!");
    return;
  }
  try {
    const response = await fetch(`${baseUrl}/rooms/${currentRoomId}/bet`, {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         "Authorization": "Bearer " + localStorage.getItem("token")
      },
      body: JSON.stringify({ bet: betAmount })
    });
    const data = await response.json();
    if (response.ok) {
      alert("Ставка принята");
      // При необходимости обновите состояние комнаты (например, обновите отображение ставок)
      // Можно также запустить WS‑обновление или обновить профиль
    } else {
      alert(data.detail || "Ошибка при ставке.");
    }
  } catch (error) {
    console.error("Ошибка при ставке:", error);
    alert("Ошибка при ставке");
  }
}



// Функция показа окна переигровки
function showRematchModal(finalMessage) {
  const rematchConfirmed = confirm(finalMessage + "\nХотите сыграть еще раз?");
  if (rematchConfirmed) {
    proposeRematch();
  } else {
    // Если игрок отказывается, закрываем игровой интерфейс (оверлей)
    document.getElementById("game-room-overlay").classList.add("hidden");
  }
}


// Функция отправки подтверждения готовности
async function markReady() {
  // Скрываем кнопку "Готов", чтобы не отправлять повторно
  document.getElementById("ready-btn").disabled = true;
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${baseUrl}/rooms/${currentRoomId}/ready`, {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         "Authorization": "Bearer " + token
      }
    });
    const data = await response.json();
    console.log("Готовность подтверждена:", data.message);
    // Если оба игрока подтвердили, сервер выберет первого бросающего.
  } catch (error) {
    console.error("Ошибка подтверждения готовности:", error);
  }
}

// Новая функция для броска кубика через игровой endpoint
async function rollDice() {
    console.log("rollDice() вызвана");
    try {
        const token = localStorage.getItem("token");
        const response = await fetch(`${baseUrl}/rooms/${currentRoomId}/roll`, {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               "Authorization": "Bearer " + token
            }
        });
        const data = await response.json();
        console.log("Результат броска:", data.dice);
    } catch (error) {
        console.error("Ошибка броска кубика:", error);
    }
}



// Функция показа UI для предложения переигровки (например, показываем кнопку "Переиграть")
function showRematchOfferUI() {
  // Здесь можно, например, заменить содержимое game-room-overlay:
  const gameResultDiv = document.getElementById("game-result");
  gameResultDiv.innerHTML += `<button id="rematch-btn" onclick="proposeRematch()">Предложить переигровку</button>`;
}

// Функция для отправки предложения переигровки
async function proposeRematch() {
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${baseUrl}/rooms/${currentRoomId}/rematch_offer`, {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         "Authorization": "Bearer " + token
      }
    });
    const data = await response.json();
    console.log("Предложение переигровки отправлено:", data.message);
    // Удаляем кнопку, чтобы повторно не предлагать
    document.getElementById("rematch-btn").remove();
  } catch (error) {
    console.error("Ошибка отправки предложения переигровки:", error);
  }
}

// Функция для ответа на предложение переигровки
async function answerRematch(accept) {
  try {
    const token = localStorage.getItem("token");
    const response = await fetch(`${baseUrl}/rooms/${currentRoomId}/rematch_response`, {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
         "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ accept: accept })
    });
    const data = await response.json();
    console.log("Ответ на предложение переигровки:", data.message);
    // Если принято, UI обновится через событие "rematch_accepted"
  } catch (error) {
    console.error("Ошибка ответа на предложение переигровки:", error);
  }
}

// Функция сброса игрового UI для новой игры (после переигровки)
function resetGameUI() {
  // Сбросим показатели и обновим надписи
  currentStage = 1;
  currentTurn = "";
  document.getElementById("game-result").innerHTML = "<p>Новая игра началась. Сделайте ставку и нажмите 'Готов'.</p>";
  // Разблокируем кнопки
  document.getElementById("ready-btn").disabled = false;
  document.getElementById("roll-btn").disabled = true;
}


// Кнопка "Готов" уже указана в разметке с onclick="markReady()"

// Если ранее использовался код rematch(), его можно убрать или заменить на вызовы proposeRematch()/answerRematch().



// Привязываем обработчики к кнопкам игрового интерфейса
document.getElementById("place-bet-btn").addEventListener("click", placeBet);
document.getElementById("roll-btn").addEventListener("click", rollDice);
