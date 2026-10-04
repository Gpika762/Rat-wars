const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Inicialización del SDK oficial de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Configuración del modelo forzando salida JSON estructurada
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: {
        responseMimeType: "application/json"
    }
});

// Generador de respaldo (Fallback)
function generateFallbackIsland() {
    const width = 32;
    const height = 32;
    let grid = Array(height).fill().map(() => Array(width).fill(0));
    const cx = 16, cy = 16;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dist = Math.hypot(x - cx, y - cy);
            if (dist < 13) grid[y][x] = 1; // Tierra
            if (Math.abs(x - cx) < 2 && dist < 13) grid[y][x] = 3; // Río central
        }
    }
    grid[4][4] = 4; grid[27][4] = 4; grid[4][27] = 4; grid[27][27] = 4; // Spawns
    
    return {
        map_name: "Isla Base (Offline)",
        theme: "Cyberpunk Island Base",
        width,
        height,
        grid
    };
}

// Ruta raíz para verificación de Render
app.get('/', (req, res) => {
    res.status(200).send("Rat Wars Render Server - Online");
});

// Endpoint de verificación de estado
app.get('/api/status', (req, res) => {
    res.status(200).json({ status: "online", service: "Rat Wars Render Server" });
});

// Ruta principal para generar el mapa
app.post('/api/render_map', async (req, res) => {
    const userPrompt = req.body.prompt || "Isla cyberpunk equilibrada con rios de queso";
    console.log(`[Render Server] Procesando prompt: "${userPrompt}"`);

    if (!process.env.GEMINI_API_KEY) {
        console.warn("⚠️ No se encontró GEMINI_API_KEY. Usando mapa fallback.");
        const fallback = generateFallbackIsland();
        return res.status(200).json({ success: true, map: fallback });
    }

    try {
        const prompt = `Eres un diseñador de mapas procedurales para el juego Rat Wars.
Genera un mapa de matriz de 32x32 para el juego siguiendo esta indicación: "${userPrompt}".

Formato estricto JSON:
{
  "map_name": "Nombre creativo",
  "theme": "Estilo visual",
  "width": 32,
  "height": 32,
  "grid": [[0,0,1,...], [0,1,1,...]]
}

Valores numéricos de la matriz (grid):
0 = Agua/Vacío
1 = Tierra/Piso
2 = Estructura/Pared
3 = Río/Zona Neón
4 = Punto de Spawn`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Limpieza de marcadores markdown si existieran
        const cleanJson = responseText.replace(/```json|```/g, '').trim();
        const mapData = JSON.parse(cleanJson);

        return res.status(200).json({
            success: true,
            map: mapData
        });

    } catch (error) {
        console.error("Error procesando render con IA:", error.message);
        const fallback = generateFallbackIsland();
        return res.status(200).json({ success: true, map: fallback });
    }
});

app.listen(PORT, () => {
    console.log(`⚡ SERVIDOR DE RENDER ACTIVO EN PUERTO ${PORT}`);
});
