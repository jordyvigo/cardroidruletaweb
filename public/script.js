// frontend/public/script.js

document.addEventListener("DOMContentLoaded", async () => {
    const spinButton = document.getElementById("spinButton");
    const submitData = document.getElementById("submitData");
    const loginModal = document.getElementById("loginModal");
    const prizesList = document.getElementById("prizesList");
    const shareButton = document.getElementById("shareButton");
    const prizePopup = document.getElementById("prizePopup");
    const prizeTextElement = document.getElementById("prizeText");
    const snowContainer = document.getElementById("snowContainer");
    const termsLink = document.querySelector('.terms-link');
    const termsModal = document.getElementById("termsModal");
    const closeTermsModalBtn = document.getElementById("closeTermsModal");

    // Sonidos
    const spinSound = new Audio("assets/spin.wav");
    const winSound = new Audio("assets/win.mp3");

    // Estado del usuario
    const userState = {
        spinsAvailable: 0,
        prizes: [],
        plate: "",
        email: "",
        phone: "",
        selectedPrize: "", // Nuevo campo para almacenar el premio seleccionado por el servidor
    };

    let wheel = null;
    let isSpinning = false; // Estado para controlar si la ruleta está girando

    /**
     * Manejar resultado del giro (Definido en el ámbito global)
     */
    window.handleSpinResult = function(indicatedSegment, wheelInstance) {
        console.log("[handleSpinResult] Animación finalizada.");
        console.log("[handleSpinResult] Premio seleccionado:", indicatedSegment.text);

        // Verificar si wheelInstance está definido y tiene la propiedad animation.stopAngle
        if (wheelInstance && wheelInstance.animation && typeof wheelInstance.animation.stopAngle === 'number') {
            console.log("[handleSpinResult] stopAngle de la animación:", wheelInstance.animation.stopAngle);
        } else {
            console.warn("[handleSpinResult] wheelInstance o wheelInstance.animation no está definido.");
            // Intentar usar la variable global 'wheel' si wheelInstance no está disponible
            if (wheel && wheel.animation && typeof wheel.animation.stopAngle === 'number') {
                console.log("[handleSpinResult] Usando 'wheel' global para stopAngle:", wheel.animation.stopAngle);
            } else {
                console.warn("[handleSpinResult] La variable global 'wheel' tampoco está definida correctamente.");
            }
        }

        try {
            // En lugar de usar indicatedSegment.text, usar el premio seleccionado por el servidor
            const prizeText = userState.selectedPrize.trim();
            winSound.play();
            console.log("[handleSpinResult] Sonido de victoria reproducido.");

            showPrizePopup(prizeText);
            console.log("[handleSpinResult] Popup de premio mostrado.");

            updatePrizesList();
            console.log("[handleSpinResult] Lista de premios actualizada.");

            if (
                !prizeText.toLowerCase().includes("sigue intentando") &&
                !prizeText.toLowerCase().includes("giro adicional")
            ) {
                try {
                    launchConfetti();
                    console.log("[handleSpinResult] Confetti lanzado.");
                } catch (confettiError) {
                    console.error("[handleSpinResult] Error al lanzar confetti:", confettiError.message);
                }
            }
        } catch (error) {
            console.error("[handleSpinResult] Error:", error.message);
            alert(`Hubo un problema al procesar el premio: ${error.message}`);
        } finally {
            isSpinning = false;
            updateSpinButton(); // Re-evaluar el estado del botón
            console.log("[handleSpinResult] Estado 'isSpinning' establecido a false.");
        }

        // Reiniciar rotationAngle para evitar acumulación
        if (wheel && wheel.rotationAngle !== undefined) {
            wheel.rotationAngle = wheel.rotationAngle % 360;
            console.log("[handleSpinResult] wheel.rotationAngle reiniciado a:", wheel.rotationAngle);
        }
    };

    /**
     * Inicializar la ruleta
     */
    async function initializeWheel() {
        console.log("[initializeWheel] → Solicitando /api/spin-config...");
        try {
            const response = await fetch("/api/spin-config");
            if (!response.ok) {
                throw new Error("Error al cargar la configuración de la ruleta.");
            }

            const data = await response.json();
            if (!data.segments || !Array.isArray(data.segments) || data.segments.length === 0) {
                throw new Error("No se encontraron segmentos válidos para la ruleta.");
            }

            console.log("[initializeWheel] Segmentos recibidos:", data.segments);

            // Verificar el orden de los segmentos
            data.segments.forEach((segment, index) => {
                console.log(`Segmento ${index}: ${segment.text}`);
            });

            // Configurar la ruleta con pointerAngle: 0°
            wheel = new Winwheel({
                canvasId: "wheelCanvas",
                numSegments: data.segments.length,
                startAngle: 0, // Establecer a 0°
                textAlignment: "outer",
                textOrientation: "horizontal",
                textFontSize: 18,
                textFillStyle: "#FFFFFF",
                textStrokeStyle: "#000000",
                segments: data.segments,
                responsive: true,
                segmentsWidth: 1,
                pins: {
                    number: 36, // Número de pins
                    outerRadius: 5, // Tamaño de los pins
                    margin: 10, // Margen para posicionar los pins
                    fillStyle: '#FFFFFF', // Color blanco
                    strokeStyle: '#FFFFFF', // Contorno blanco
                    lineWidth: 1, // Grosor del contorno
                },
                animation: {
                    type: "spinToStop",
                    direction: "clockwise", // Dirección de giro horaria
                    duration: 6, // Duración fija para cada giro
                    spins: 8,    // Número de giros completos
                    easing: "Power4.easeOut", // Curva de easing más suave
                    callbackFinished: handleSpinResult // Función global
                },
                pointerAngle: 0, // Alinear con el puntero en el lado superior (0°)
            });

            wheel.draw();
            updateSpinButton();
            console.log("[initializeWheel] Ruleta inicializada y dibujada con startAngle:", 0);
        } catch (error) {
            console.error("[initializeWheel] Error:", error.message);
            alert("Hubo un problema al cargar la configuración de la ruleta. Intenta nuevamente más tarde.");
        }
    }

    /**
     * Compartir en Facebook con un mensaje personalizado
     */
    async function shareOnFacebook() {
        const shareText = "LLEVATE UNA RADIO 100% GRATIS CON LA RULETA CARDROID";
        const url = encodeURIComponent(window.location.href);
        const message = encodeURIComponent(shareText);
        const shareURL = `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${message}`;
        window.open(shareURL, '_blank', 'width=600,height=400');

        try {
            const response = await fetch("/api/share", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plate: userState.plate }),
            });

            const data = await response.json();

            if (response.ok) {
                userState.spinsAvailable = data.spinsAvailable;
                userState.prizes = data.prizes || [];
                updateSpinButton();
                updatePrizesList();
                alert(data.message);
                console.log("[shareOnFacebook] Giros actualizados:", userState.spinsAvailable);
            } else {
                alert(data.message || "No se pudo añadir giros adicionales.");
                console.warn("[shareOnFacebook] Problema al añadir giros adicionales:", data.message);
            }
        } catch (error) {
            console.error("[shareOnFacebook] Error:", error.message);
            alert("Hubo un problema al procesar tu solicitud. Intenta nuevamente más tarde.");
        }
    }

    /**
     * Girar la ruleta utilizando Winwheel.js
     */
    async function spinWheel() {
        if (!wheel) {
            alert("La ruleta no está lista. Intenta nuevamente.");
            return;
        }
        if (userState.spinsAvailable <= 0) {
            alert("No tienes giros disponibles.");
            return;
        }
        if (isSpinning) {
            alert("La ruleta ya está girando. Por favor, espera.");
            return;
        }

        isSpinning = true;
        spinButton.disabled = true;
        console.log("[spinWheel] Iniciando giro. Giros disponibles antes del giro:", userState.spinsAvailable);

        try {
            const response = await fetch("/api/spin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plate: userState.plate }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Error desconocido.");
            }

            const data = await response.json();
            if (!data.prize || !data.prize.text || typeof data.stopAngle !== "number") {
                throw new Error("Datos de giro inválidos.");
            }

            console.log("[spinWheel] Premio recibido del servidor:", data.prize.text);
            console.log("[spinWheel] stopAngle recibido:", data.stopAngle);

            // Actualizar el estado del usuario después del giro
            userState.spinsAvailable = data.spinsAvailable;
            userState.prizes = data.prizes || [];
            userState.selectedPrize = data.prize.text; // Asignar el premio seleccionado por el servidor

            console.log("[spinWheel] Spins disponibles después del giro:", userState.spinsAvailable);
            console.log("[spinWheel] Premios del usuario:", userState.prizes);

            updateSpinButton();
            updatePrizesList();

            const desiredStopAngle = data.stopAngle;

            // Validar stopAngle recibido
            if (desiredStopAngle < 0 || desiredStopAngle >= 360) {
                throw new Error("stopAngle recibido está fuera de rango.");
            }

            // Añadir logs adicionales para depuración
            console.log("[spinWheel] stopAngle recibido del servidor:", desiredStopAngle);

            // Actualizar la configuración de animación con el stopAngle
            wheel.animation.stopAngle = desiredStopAngle;

            console.log("[spinWheel] stopAngle configurado en Winwheel.js:", wheel.animation.stopAngle);

            // Iniciar el giro
            wheel.startAnimation();

            spinSound.play();
            console.log("[spinWheel] Giro iniciado con stopAngle:", desiredStopAngle);
        } catch (error) {
            console.error("[spinWheel] Error:", error.message);
            alert(`Hubo un problema: ${error.message}`);
            isSpinning = false;
            spinButton.disabled = userState.spinsAvailable <= 0;
        }
    }

    /**
     * Confetti
     */
    function launchConfetti() {
        console.log("[launchConfetti] Intentando lanzar confetti.");
        try {
            confetti({
                particleCount: 300,
                spread: 360,
                origin: { x: 0.5, y: 0.5 },
                gravity: 1,
                ticks: 200,
                scalar: 1.2,
                disableForReducedMotion: true,
                zIndex: 9998,
            });
            console.log("[launchConfetti] Confetti lanzado exitosamente.");
        } catch (error) {
            console.error("[launchConfetti] Error al lanzar confetti:", error.message);
        }
    }

    /**
     * Actualizar botón girar
     */
    function updateSpinButton() {
        if (spinButton) {
            spinButton.disabled = userState.spinsAvailable <= 0 || isSpinning;
            spinButton.textContent =
                userState.spinsAvailable > 0
                    ? `¡Girar la Ruleta! (${userState.spinsAvailable})`
                    : "Sin giros disponibles";
            console.log("[updateSpinButton] Spins disponibles:", userState.spinsAvailable);
            console.log("[updateSpinButton] Estado 'isSpinning':", isSpinning);
            console.log("[updateSpinButton] Estado del botón:", spinButton.disabled ? "Deshabilitado" : "Habilitado");
        }
    }

    /**
     * Manejar registro de usuario
     */
    async function submitUserData() {
        const plateInput = document.getElementById("plate");
        const emailInput = document.getElementById("email");
        const phoneInput = document.getElementById("phone");

        if (!plateInput || !emailInput || !phoneInput) {
            alert("Faltan campos necesarios.");
            return;
        }

        const plate = plateInput.value.trim().toUpperCase();
        const email = emailInput.value.trim();
        const phone = phoneInput.value.trim();

        // Validaciones
        const platePattern = /^[A-Z0-9]{6}$/;
        const phonePattern = /^[0-9]{9}$/;

        if (!platePattern.test(plate)) {
            alert("La placa debe tener 6 caracteres alfanuméricos.");
            return;
        }
        if (!phonePattern.test(phone)) {
            alert("El teléfono debe tener 9 dígitos.");
            return;
        }

        try {
            const response = await fetch("/api/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plate, email, phone }),
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Error en el registro.");

            userState.plate = plate;
            userState.email = email;
            userState.phone = phone;
            userState.spinsAvailable = data.user.spinsAvailable;
            userState.prizes = data.user.prizes;
            userState.selectedPrize = ""; // Resetear el premio seleccionado

            console.log("[submitUserData] Usuario registrado:", userState);

            updateSpinButton();
            updatePrizesList();
            hideLoginModal();
        } catch (error) {
            console.error("[submitUserData] Error:", error.message);
            alert(`Hubo un problema al registrar: ${error.message}`);
        }
    }

    /**
     * Mostrar popup de premio
     */
    function showPrizePopup(prizeText) {
        if (!prizePopup || !prizeTextElement) {
            console.error("Elemento del popup no encontrado.");
            return;
        }

        console.log("[showPrizePopup] Mostrando premio:", prizeText);

        prizeTextElement.textContent = prizeText;

        if (
            prizeText.toLowerCase().includes("sigue intentando") ||
            prizeText.toLowerCase().includes("giro adicional")
        ) {
            prizePopup.querySelector(".prize-actions").innerHTML = `
                <p>Comparte en Facebook para obtener giros adicionales.</p>
                <button id="shareForSpin" class="share-for-spin-btn">Compartir en Facebook (+3 giros)</button>
                <button id="closePrizePopup" class="close-popup-btn">Cerrar</button>
            `;

            const shareForSpinButton = document.getElementById("shareForSpin");
            const closePrizePopupBtn = document.getElementById("closePrizePopup");

            if (shareForSpinButton) {
                shareForSpinButton.addEventListener("click", () => {
                    shareOnFacebook();
                    hidePrizePopup();
                });
                console.log("[showPrizePopup] Botón 'Compartir en Facebook' agregado.");
            } else {
                console.error("[showPrizePopup] Botón 'Compartir en Facebook' no encontrado.");
            }

            if (closePrizePopupBtn) {
                closePrizePopupBtn.addEventListener("click", hidePrizePopup);
                console.log("[showPrizePopup] Botón 'Cerrar' agregado.");
            } else {
                console.error("[showPrizePopup] Botón 'Cerrar' no encontrado.");
            }
        } else {
            prizePopup.querySelector(".prize-actions").innerHTML = `
                <button id="claimPrizeButton" class="claim-prize-btn">Canjear</button>
                <button id="closePrizePopup" class="close-popup-btn">Cerrar</button>
            `;
            const claimPrizeBtn = document.getElementById("claimPrizeButton");
            const closePrizePopupBtn = document.getElementById("closePrizePopup");

            if (claimPrizeBtn) {
                claimPrizeBtn.addEventListener("click", () => {
                    sendWhatsAppMessage(prizeText);
                    hidePrizePopup();
                });
                console.log("[showPrizePopup] Botón 'Canjear' agregado.");
            } else {
                console.error("[showPrizePopup] Botón 'Canjear' no encontrado.");
            }

            if (closePrizePopupBtn) {
                closePrizePopupBtn.addEventListener("click", hidePrizePopup);
                console.log("[showPrizePopup] Botón 'Cerrar' agregado.");
            } else {
                console.error("[showPrizePopup] Botón 'Cerrar' no encontrado.");
            }
        }

        prizePopup.style.display = "flex"; // Asegurar display flex para centrar
        prizePopup.setAttribute("aria-hidden", "false");
        console.log("[showPrizePopup] Popup de premio mostrado.");
    }

    function sendWhatsAppMessage(prizeText) {
        const plate = userState.plate || "XXXXXX";
        const message = encodeURIComponent(
            `SOY EL DUEÑO DEL VEHICULO ${plate} Y DESEO CANJEAR EL PREMIO ${prizeText}`
        );
        const whatsappURL = `https://wa.me/51932426069?text=${message}`;
        window.open(whatsappURL, "_blank");
        console.log("[sendWhatsAppMessage] Mensaje enviado a WhatsApp:", message);
    }

    function hidePrizePopup() {
        if (!prizePopup) return;
        prizePopup.style.display = "none";
        prizePopup.setAttribute("aria-hidden", "true");
        console.log("[hidePrizePopup] Popup de premio ocultado.");
    }

    /**
     * Actualizar lista de premios con contadores regresivos
     */
    function updatePrizesList() {
        if (!prizesList) {
            console.error("Elemento 'prizesList' no encontrado.");
            return;
        }
        prizesList.innerHTML = ""; // Asegura que la lista esté limpia antes de actualizar

        if (userState.prizes.length === 0) {
            prizesList.innerHTML = "<p>No tienes premios.</p>";
            console.log("[updatePrizesList] No hay premios para mostrar.");
            return;
        }

        // Eliminar duplicados basados en el texto del premio
        const uniquePrizes = [];
        const prizeTexts = new Set();
        userState.prizes.forEach(prize => {
            const normalizedText = prize.text.trim().toLowerCase();
            if (!prizeTexts.has(normalizedText)) {
                uniquePrizes.push(prize);
                prizeTexts.add(normalizedText);
            } else {
                console.warn(`[updatePrizesList] Premio duplicado encontrado y omitido: ${prize.text}`);
            }
        });

        const ul = document.createElement("ul");
        uniquePrizes.forEach(prize => {
            console.log("[updatePrizesList] Agregando premio:", prize.text);
            const li = document.createElement("li");
            li.classList.add("prize-item");

            const prizeDetails = document.createElement("div");
            prizeDetails.classList.add("prize-details");
            prizeDetails.textContent = `${prize.text} - Expira el ${new Date(prize.expiry).toLocaleDateString()}`;

            // Añadir clase específica si el premio es "RADIO 100% GRATIS"
            if (prize.text === "RADIO 100% GRATIS") {
                prizeDetails.classList.add("radio-gratis");
            }

            const countdown = document.createElement("div");
            countdown.classList.add("prize-countdown");
            countdown.id = `countdown-${prize._id}`; // Asegúrate de que cada premio tenga un ID único

            // Iniciar el contador
            initializeCountdown(prize.expiry, countdown);

            const prizeActions = document.createElement("div");
            prizeActions.classList.add("prize-actions");

            if (!prize.claimed && new Date(prize.expiry) > new Date()) {
                if (
                    !prize.text.toLowerCase().includes("sigue intentando") &&
                    !prize.text.toLowerCase().includes("giro adicional")
                ) {
                    const redeemButton = document.createElement("button");
                    redeemButton.textContent = "Canjear";
                    redeemButton.classList.add("redeem-btn");
                    redeemButton.addEventListener("click", () => {
                        sendWhatsAppMessage(prize.text);
                        hidePrizePopup();
                    });
                    prizeActions.appendChild(redeemButton);
                    console.log("[updatePrizesList] Botón 'Canjear' agregado para el premio:", prize.text);
                }
            } else {
                const redeemedText = document.createElement("span");
                redeemedText.textContent = "Canjeado";
                redeemedText.style.color = "#FFD700";
                prizeActions.appendChild(redeemedText);
                console.log("[updatePrizesList] Premio canjeado:", prize.text);
            }

            li.appendChild(prizeDetails);
            li.appendChild(countdown); // Añadir el contador al premio
            li.appendChild(prizeActions);
            ul.appendChild(li);
        });
        prizesList.appendChild(ul);
        console.log("[updatePrizesList] Lista de premios actualizada.");
    }

    /**
     * Inicializar un contador regresivo para cada premio
     */
    function initializeCountdown(expiryDate, element) {
        function updateCountdown() {
            const now = new Date().getTime();
            const expiry = new Date(expiryDate).getTime();
            const distance = expiry - now;

            if (distance < 0) {
                element.innerHTML = "Expirado";
                clearInterval(interval);
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            element.innerHTML = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        }

        updateCountdown(); // Actualizar inmediatamente
        const interval = setInterval(updateCountdown, 1000); // Actualizar cada segundo
    }

    function hideLoginModal() {
        if (loginModal) {
            loginModal.style.display = "none";
            loginModal.setAttribute("aria-hidden", "true");
            console.log("[hideLoginModal] Modal de login ocultado.");
        }
    }

    function showLoginModal() {
        if (loginModal) {
            loginModal.style.display = "flex"; // Asegurar que sea "flex"
            loginModal.setAttribute("aria-hidden", "false");
            console.log("[showLoginModal] Modal de login mostrado.");
        }
    }

    function createSnowflakes(count) {
        for (let i = 0; i < count; i++) {
            const snowflake = document.createElement("div");
            snowflake.classList.add("snowflake");
            snowflake.textContent = "❅";
            snowflake.style.left = `${Math.random() * 100}%`;
            snowflake.style.animationDuration = `${Math.random() * 5 + 5}s`;
            snowflake.style.opacity = Math.random();
            snowflake.style.fontSize = `${Math.random() * 1.5 + 0.5}em`;
            snowContainer.appendChild(snowflake);
        }
        console.log(`[createSnowflakes] ${count} copos de nieve creados.`);
    }

    function initializeSnow() {
        createSnowflakes(50);
        console.log("[initializeSnow] Copos de nieve inicializados.");
    }

    function initializeApp() {
        initializeSnow();
        initializeWheel();
        console.log("[initializeApp] Aplicación inicializada.");
    }

    function showTermsModal() {
        if (termsModal) {
            termsModal.style.display = "flex"; // Asegurar que sea "flex"
            termsModal.setAttribute("aria-hidden", "false");
            console.log("[showTermsModal] Modal de términos mostrado.");
        }
    }

    function hideTermsModal() {
        if (termsModal) {
            termsModal.style.display = "none";
            termsModal.setAttribute("aria-hidden", "true");
            console.log("[hideTermsModal] Modal de términos ocultado.");
        }
    }

    // Event Listeners
    if (submitData) {
        submitData.addEventListener("click", submitUserData);
        console.log("[EventListener] 'submitData' click listener añadido.");
    }
    if (spinButton) {
        spinButton.addEventListener("click", spinWheel);
        console.log("[EventListener] 'spinButton' click listener añadido.");
    }
    if (shareButton) {
        shareButton.addEventListener("click", shareOnFacebook);
        console.log("[EventListener] 'shareButton' click listener añadido.");
    }
    if (termsLink) {
        termsLink.addEventListener("click", e => {
            e.preventDefault();
            showTermsModal();
        });
        console.log("[EventListener] 'termsLink' click listener añadido.");
    }
    if (closeTermsModalBtn) {
        closeTermsModalBtn.addEventListener("click", hideTermsModal);
        console.log("[EventListener] 'closeTermsModalBtn' click listener añadido.");
    }

    showLoginModal();
    initializeApp();
});
