const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Inicialización de la API de Gemini mediante variable de entorno
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Generador de respaldo (Fallback) en caso de que la IA no responda o falle
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
        map_name: "island_map (Local Offline)",
        theme: "Cyberpunk Island Base",
        width,
        height,
        grid
    };
}

// Ruta principal para generar y renderizar el mapa
app.post('/api/render_map', async (req, res) => {
    const userPrompt = req.body.prompt || "Isla cyberpunk equilibrada con rios de queso";
    console.log(`[Render Server] Procesando prompt: "${userPrompt}"`);

    if (!process.env.GEMINI_API_KEY) {
        console.warn("⚠️ No se encontró GEMINI_API_KEY en las variables de entorno. Usando mapa base.");
        const fallback = generateFallbackIsland();
        return res.status(200).json({ success: true, map: fallback });
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Eres un diseñador de mapas procedurales para el juego Rat Wars.
Genera una estructura de mapa basada en este pedido: "${userPrompt}".
Responde UNICAMENTE en formato JSON plano sin bloques de código con esta estructura:
{
  "map_name": "Nombre creativo del mapa",
  "theme": "Estilo visual",
  "width": 32,
  "height": 32,
  "grid": [[0,0,1,...], [0,1,1,...]]
}
Donde en grid:
0 = Agua/Vacío
1 = Tierra/Piso
2 = Estructura/Pared
3 = Río/Zona Neón
4 = Punto de Spawn`
        });

        const cleanJson = response.text.replace(/```json|```/g, '').trim();
        const mapData = JSON.parse(cleanJson);

        res.status(200).json({
            success: true,
            map: mapData
        });

    } catch (error) {
        console.error("Error al procesar render con IA:", error);
        const fallback = generateFallbackIsland();
        res.status(200).json({ success: true, map: fallback });
    }
});

// Endpoint de verificación de estado
app.get('/api/status', (req, res) => {
    res.status(200).json({ status: "online", service: "Rat Wars Render Server" });
});

app.listen(PORT, () => {
    console.log(`⚡ SERVIDOR DE RENDER ACTIVO EN PUERTO ${PORT}`);
});
