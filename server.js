// server.js

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const serverless = require("serverless-http");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Verificar variable de entorno MONGODB_URI
if (!process.env.MONGODB_URI) {
    console.error("Error: La variable de entorno MONGODB_URI no está configurada.");
    process.exit(1);
}

// Caché de la conexión a MongoDB
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectToMongoDB() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
            // Puedes añadir más opciones de conexión si es necesario
        };

        cached.promise = mongoose.connect(process.env.MONGODB_URI, opts).then((mongoose) => {
            return mongoose;
        }).catch((err) => {
            cached.promise = null;
            throw err;
        });
    }

    cached.conn = await cached.promise;
    return cached.conn;
}

// Esquema de usuario
const userSchema = new mongoose.Schema({
    plate: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    spinsAvailable: { type: Number, default: 3 }, // Asignar 3 giros por defecto
    lastSpinDate: { type: Date, default: null },
    lastShareDate: { type: Date, default: null },
    prizes: [
        {
            text: { type: String, required: true },
            expiry: { type: Date, required: true },
            claimed: { type: Boolean, default: false },
        },
    ],
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

// Lista de premios corregida para que sumen exactamente 100%
const prizes = [
    { text: "10 soles de descuento", probability: 28 },      // index 0
    { text: "50 soles de descuento", probability: 7 },       // index 1
    { text: "100 soles de descuento", probability: 1 },      // index 2
    { text: "Cargador de cigarrera", probability: 1 },       // index 3
    { text: "Consola gratis", probability: 2 },             // index 4
    { text: "Mica de vidrio gratis", probability: 8 },       // index 5
    { text: "Parlantes gratis", probability: 2 },            // index 6
    { text: "Un giro adicional", probability: 11 },          // index 7
    { text: "RADIO 100% GRATIS", probability: 0 },           // index 8
    { text: "20% de descuento", probability: 0 },            // index 9
    { text: "Sigue intentando", probability: 34 },            // index 10
    { text: "10% de descuento", probability: 10 },           // index 11
    // { text: "50% de descuento", probability: 0.12 },      // Eliminado para sumar exactamente 100%
];

// Obtener fillStyle basado en el texto del premio
function getFillStyle(text) {
    const colorMap = {
        "10 soles de descuento": "#FF6347",
        "50 soles de descuento": "#32CD32",
        "100 soles de descuento": "#87CEEB",
        "Cargador de cigarrera": "#FFD700",
        "Consola gratis": "#8A2BE2",
        "Mica de vidrio gratis": "#555555",
        "Parlantes gratis": "#FFA07A",
        "Un giro adicional": "#20B2AA",
        "RADIO 100% GRATIS": "#FF1493", // Color vibrante para resaltar
        "20% de descuento": "#32CD32",
        "Sigue intentando": "#8B0000",
        "10% de descuento": "#4B0082",
        // "50% de descuento": "#FFA500", // Eliminado
    };

    return colorMap[text] || "#000000"; // Color por defecto si no se encuentra
}

/** GET /api/spin-config */
app.get("/api/spin-config", async (req, res) => {
    console.log("Recibiendo solicitud para /api/spin-config");
    try {
        await connectToMongoDB();
        console.log("Conectado a MongoDB");
        const segments = prizes.map(prize => ({
            text: prize.text,
            fillStyle: getFillStyle(prize.text),
        }));

        console.log("Configuración de la ruleta:", segments);

        // Validar segmentos
        const invalidSegments = segments.filter(segment => !segment.text || typeof segment.text !== 'string');
        if (invalidSegments.length > 0) {
            console.error("Segmentos inválidos encontrados:", invalidSegments);
            throw new Error("Se encontraron segmentos con texto inválido.");
        }

        return res.status(200).json({ segments });
    } catch (error) {
        console.error("Error al cargar la configuración de la ruleta:", error.message);
        return res.status(500).json({ message: "Error al cargar la configuración de la ruleta.", error: error.message });
    }
});

/** POST /api/register */
app.post("/api/register", async (req, res) => {
    const { plate, email, phone } = req.body;

    if (!plate || !email || !phone) {
        return res.status(400).json({ message: "Placa, email y teléfono son requeridos." });
    }

    try {
        console.log(`Recibiendo solicitud de registro para la placa: ${plate}`);
        await connectToMongoDB();
        let user = await User.findOne({ plate });

        if (user) {
            user.email = email;
            user.phone = phone;
            // Filtrar premios expirados
            user.prizes = user.prizes.filter(p => p.expiry > new Date());
            // Añadir 3 giros al actualizar
            user.spinsAvailable += 3;
            await user.save();
            console.log(`Usuario existente actualizado: ${plate}`);
            return res.status(200).json({
                message: "Usuario actualizado exitosamente.",
                user,
            });
        }

        const newUser = new User({ plate, email, phone, spinsAvailable: 3 }); // Asignar 3 giros
        await newUser.save();
        console.log(`Nuevo usuario registrado: ${plate}`);

        return res.status(201).json({
            message: "Usuario registrado exitosamente.",
            user: newUser,
        });
    } catch (err) {
        console.error("Error al registrar usuario:", err.message);
        // Manejar errores de duplicados de placa
        if (err.code === 11000) { // Código de error de duplicado en MongoDB
            return res.status(409).json({ message: "La placa ya está registrada." });
        }
        return res.status(500).json({
            message: "Error al registrar el usuario.",
            error: err.message,
        });
    }
});

/** Obtener premio basado en probabilidad */
function getPrize(prizes) {
    const random = Math.random() * 100;
    let sum = 0;
    for (const prize of prizes) {
        sum += prize.probability;
        if (random <= sum) {
            return prize;
        }
    }
    // Por seguridad, retornar "Sigue intentando" si no se encuentra ningún premio
    return { text: "Sigue intentando", probability: 100 };
}

/** POST /api/spin */
app.post("/api/spin", async (req, res) => {
    const { plate } = req.body;

    if (!plate) {
        return res.status(400).json({ message: "Placa es requerida." });
    }

    try {
        console.log(`Recibiendo solicitud de giro para la placa: ${plate}`);
        await connectToMongoDB();
        const user = await User.findOne({ plate });
        if (!user) {
            console.warn(`Usuario no encontrado para la placa: ${plate}`);
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        if (user.spinsAvailable <= 0) {
            console.warn(`Usuario con placa ${plate} sin giros disponibles.`);
            return res.status(400).json({ message: "No tienes giros disponibles." });
        }

        user.spinsAvailable -= 1;
        console.log(`Usuario ${plate} tiene ${user.spinsAvailable} giros restantes.`);

        let prize = getPrize(prizes);

        if (!prize || !prize.text) {
            console.error("Premio generado inválido:", prize);
            prize = { text: "Sigue intentando", probability: 100 };
        }

        console.log(`Premio obtenido: ${prize.text}`);

        // Manejar giros adicionales y premios
        if (prize.text.toLowerCase() === "un giro adicional") {
            user.spinsAvailable += 1;
            console.log(`Usuario ${plate} ha recibido un giro adicional.`);
        } else if (
            prize.text.toLowerCase() !== "sigue intentando" &&
            prize.text.toLowerCase() !== "giro adicional"
        ) {
            // Verificar si el premio ya existe para evitar duplicados
            const existingPrize = user.prizes.find(p => p.text.toLowerCase() === prize.text.toLowerCase());
            if (!existingPrize) {
                user.prizes.push({
                    text: prize.text.trim(),
                    expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días de validez
                    claimed: false,
                });
                console.log(`Premio agregado para el usuario ${plate}: ${prize.text}`);
            } else {
                console.log(`Premio ya existente para el usuario ${plate}: ${prize.text}`);
            }
        }

        await user.save();
        console.log(`Usuario ${plate} actualizado exitosamente.`);

        // Calcular stopAngle basado en el índice del premio
        const prizeIndex = prizes.findIndex(p => p.text === prize.text);
        if (prizeIndex === -1) {
            console.error("Premio no encontrado en la lista de premios:", prize.text);
            return res.status(500).json({ message: "Premio inválido." });
        }

        const segmentAngle = 360 / prizes.length;
        const pointerAngle = 270; // Alinear con el puntero en el lado izquierdo

        const prizeCenterAngle = (prizeIndex * segmentAngle) + (segmentAngle / 2);
        // Fórmula corregida para dirección horaria
        const stopAngle = (prizeCenterAngle - pointerAngle + 360) % 360;

        console.log(`Prize Index: ${prizeIndex}, Prize Center Angle: ${prizeCenterAngle}°`);
        console.log(`Stop Angle Calculado para el premio "${prize.text}": ${stopAngle} grados`);

        // Respuesta exitosa con stopAngle
        return res.status(200).json({
            message: "Giro procesado correctamente.",
            prize: { text: prize.text.trim() },
            stopAngle: stopAngle,
            spinsAvailable: user.spinsAvailable,
            prizes: user.prizes,
        });
    } catch (err) {
        console.error("Error al girar la ruleta:", err.message);
        return res.status(500).json({
            message: "Error al procesar el giro.",
            error: err.message,
        });
    }
});

/** POST /api/share */
app.post("/api/share", async (req, res) => {
    const { plate } = req.body;

    if (!plate) {
        return res.status(400).json({ message: "Placa es requerida." });
    }

    try {
        console.log(`Recibiendo solicitud de share para la placa: ${plate}`);
        await connectToMongoDB();
        const user = await User.findOne({ plate });
        if (!user) {
            console.warn(`Usuario no encontrado para la placa: ${plate}`);
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        const today = new Date();
        const lastShareDate = user.lastShareDate ? new Date(user.lastShareDate) : null;

        if (lastShareDate && lastShareDate.toDateString() === today.toDateString()) {
            return res.status(400).json({ message: "Ya has compartido hoy. Vuelve mañana para obtener más giros." });
        }

        user.spinsAvailable += 3; // Añadir 3 giros
        user.lastShareDate = today;
        await user.save();

        console.log(`Usuario ${plate} ha compartido en Facebook y ha recibido 3 giros adicionales.`);

        return res.status(200).json({
            message: "¡Gracias por compartir! Se han añadido 3 giros adicionales.",
            spinsAvailable: user.spinsAvailable,
        });
    } catch (err) {
        console.error("Error al procesar el share:", err.message);
        return res.status(500).json({
            message: "Error al procesar el share.",
            error: err.message,
        });
    }
});

// Ruta de salud
app.get("/api/health", async (req, res) => {
    console.log("Recibiendo solicitud para /api/health");
    try {
        await connectToMongoDB();
        console.log("Conectado a MongoDB para la ruta de salud");
        res.status(200).send("OK");
    } catch (error) {
        console.error("Error en la conexión a MongoDB en ruta de salud:", error.message);
        res.status(500).send("Error en la conexión a MongoDB");
    }
});

// Fallback para rutas no encontradas
app.use((req, res) => {
    console.warn(`Ruta no encontrada: ${req.method} ${req.url}`);
    res.status(404).json({ message: "Ruta no encontrada." });
});

// Exportar la aplicación Express para Vercel
module.exports = serverless(app);
