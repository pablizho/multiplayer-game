const baseUrl = window.location.origin;



// Вызов функции восстановления при загрузке страницы

document.addEventListener("DOMContentLoaded", () => {

    adjustLayout(); // Запускаем при загрузке
    window.addEventListener("resize", adjustLayout); // Обновляем при изменении размера окна

    const currentPath = window.location.pathname;

    const token = localStorage.getItem("token");
    
    if (token && !window.location.pathname.includes("game.html")) {
        // Если есть токен, но мы не на game.html - перенаправляем
        window.location.href = "game.html";
    } else if (!token && window.location.pathname.includes("game.html")) {
        // Если нет токена, но мы на game.html - перенаправляем на регистрацию
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
            const maxWidth = animationArea.offsetWidth;
            animationArea.style.height = `${maxWidth * 9 / 16}px`; // Пропорция 16:9
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
        logMessage("Пожалуйста, зарегистрируйтесь!", "error");
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
        logMessage(data.message, "success");
    } catch (error) {
        logMessage(`Ошибка при получении ежедневной награды: ${error}`, "error");
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
        logMessage("Пожалуйста, зарегистрируйтесь!", "error");
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
        logMessage(data.message, "success");
    } catch (error) {
        logMessage(`Ошибка при работе: ${error}`, "error");
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
        logMessage("Пожалуйста, зарегистрируйтесь!", "error");
        return;
    }
    if (bet <= 0) {
        logMessage("Ставка должна быть больше 0.", "error");
        return;
    }

    const canvas = document.getElementById('diceCanvas');
    const ctx = canvas.getContext('2d');

    const diceWidth = canvas.width / 2 - 30;
    const diceHeight = canvas.height - 20;

    function drawDice(x, y, value) {
        const img = new Image();
        img.src = `/static/images/dice/dice-${value}.png`;
        img.onload = () => {
            ctx.drawImage(img, x, y, diceWidth, diceHeight);
        };
    }

    showElementById("dice-animation");

    // Анимация случайных значений
    let interval = setInterval(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const random1 = Math.floor(Math.random() * 6) + 1;
        const random2 = Math.floor(Math.random() * 6) + 1;
        drawDice(20, 10, random1);
        drawDice(diceWidth + 40, 10, random2);
    }, 100);

    try {
        // Запрос к серверу
        const response = await fetch(`${baseUrl}/games/dice/${username}?bet=${bet}`, {
            headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
        });

        if (!response.ok) {
            const errorData = await response.json();
            logMessage(errorData.detail || "Ошибка при броске кубика", "error");
            clearInterval(interval);
            hideElementById("dice-animation");
            return;
        }

        const data = await response.json();
        const [dice1, dice2] = data.dice;

        // Показать реальные результаты
        setTimeout(() => {
            clearInterval(interval); // Останавливаем анимацию
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawDice(20, 10, dice1); // Первый кубик
            drawDice(diceWidth + 40, 10, dice2); // Второй кубик

            // Логируем реальный результат
            logMessage(
                `Вы бросили кости [${dice1}, ${dice2}]. Ставка: ${bet} монет: ${data.message}`,
                data.winnings >= 0 ? "success" : "error"
            );

            // Обновляем статистику
            document.getElementById("stat-coins").textContent = data.total_coins;
            document.getElementById("stat-free-rolls").textContent = data.free_rolls;

            // Скрываем анимацию через 2 секунды
            setTimeout(() => {
                hideElementById("dice-animation");
            }, 2000);
        }, 1500); // Даем время для завершения анимации
    } catch (error) {
        logMessage(`Ошибка: ${error.message}`, "error");
        clearInterval(interval);
        hideElementById("dice-animation");
    }
}



//Эндпоинт для покупки бросков.
// Покупка бросков
async function buyRolls() {
    const username = document.getElementById("profile-username").innerText;
    if (!username || username === "Guest") {
        logMessage("Пожалуйста, зарегистрируйтесь!", "error");
        return;
    }

    const rollsToBuy = parseInt(prompt("Сколько бросков вы хотите купить? (1 бросок = 10 монет)"), 10);
    if (isNaN(rollsToBuy) || rollsToBuy <= 0) {
        logMessage("Некорректное количество бросков.", "error");
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
            logMessage(data.message, "success");
        } else {
            logMessage(data.detail || "Ошибка при покупке бросков.", "error");
        }
    } catch (error) {
        logMessage(`Ошибка при покупке бросков: ${error}`, "error");
    }
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
        alert("Пожалуйста, зарегистрируйтесь!");
        return;
    }

    const confirmDelete = confirm("Вы уверены, что хотите удалить свой профиль? Это действие нельзя отменить.");
    if (!confirmDelete) {
        return;
    }

    try {
        const response = await fetch(`${baseUrl}/delete-profile/${username}`, {
            method: "DELETE"
        });
        const data = await response.json();

        if (response.ok) {
            logMessage(data.message, "success");
            removeFromLocalStorage("username"); // Удаляем имя пользователя
            if (!window.alreadyRedirected) {
                window.alreadyRedirected = true;
                window.location.href = "register.html"; // Перенаправляем на страницу регистрации
            }
        } else {
            logMessage(data.detail || "Ошибка при удалении профиля.", "error");
        }
    } catch (error) {
        logMessage("Произошла ошибка при удалении профиля.", "error");
    }
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
    settingsMenu.classList.toggle("active"); // Переключаем видимость меню
}


// Открыть модальное окно для выбора аватарки
function openAvatarSelector() {
    document.getElementById("avatar-selector-modal").classList.remove("hidden");
}

// Закрыть модальное окно
function closeAvatarSelector() {
    document.getElementById("avatar-selector-modal").classList.add("hidden");
}

// Открыть селектор аватарок
function toggleAvatarSelector() {
    const avatarSelector = document.getElementById("avatar-selector");
    avatarSelector.classList.toggle("hidden");
}

// Выбрать аватарку
async function selectAvatar(avatarName) {
    const username = document.getElementById("profile-username").innerText;
    if (!username || username === "Guest") {
        alert("Пожалуйста, зарегистрируйтесь!");
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
            // Обновляем аватар на странице
            document.getElementById("avatar").src = `/static/avatars/${avatarName}?v=` + new Date().getTime();
            alert("Аватарка успешно изменена!");
        } else {
            alert(data.detail || "Ошибка при изменении аватарки.");
        }
    } catch (error) {
        alert("Произошла ошибка при изменении аватарки.");
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

