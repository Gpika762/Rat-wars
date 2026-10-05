const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración global de CORS
app.use(cors({ origin: '*' }));
app.use(express.json());

// Clave API de OpenRouter desde las variables de entorno
const openRouterApiKey = process.env.OPENROUTER_API_KEY || "";

// Generador de mapa de respaldo (Fallback)
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

// 1. Ruta raíz
app.get('/', (req, res) => {
    res.status(200).send("Rat Wars Render Server - Online");
});

// 2. Endpoint de verificación de estado para GameMaker
app.get('/api/status', (req, res) => {
    res.status(200).json({ status: "online", service: "Rat Wars Render Server" });
});

// 3. Ruta principal para generar el mapa mediante OpenRouter
app.post('/api/render_map', async (req, res) => {
    const userPrompt = req.body.prompt || "Isla cyberpunk equilibrada con rios de queso";
    console.log(`[Render Server] Procesando prompt: "${userPrompt}"`);

    if (!openRouterApiKey) {
        console.warn("⚠️ No se encontró OPENROUTER_API_KEY en variables de entorno. Usando mapa fallback.");
        return res.status(200).json({ 
            success: true, 
            map: generateFallbackIsland(),
            error_info: "Fallback activado: Falta OPENROUTER_API_KEY"
        });
    }

    try {
        const systemPrompt = `Eres un diseñador de mapas procedurales para el juego Rat Wars.
Genera un mapa de matriz de 32x32 para el juego.

Debes responder ÚNICAMENTE con un JSON válido, sin bloques de código ni Markdown.

Formato estricto JSON de salida:
{
  "map_name": "Nombre creativo",
  "theme": "Estilo visual",
  "width": 32,
  "height": 32,
  "grid": [[0,0,1,...], [0,1,1,...]]
}

Valores numéricos obligatorios de la matriz (grid):
0 = Agua/Vacío
1 = Tierra/Piso
2 = Estructura/Pared
3 = Río/Zona Neón
4 = Punto de Spawn`;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.5-flash-lite',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Indicación del mapa: "${userPrompt}"` }
                ],
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Authorization': `Bearer ${openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://rat-wars.onrender.com',
                    'X-Title': 'Rat Wars Game'
                },
                timeout: 15000
            }
        );

        let responseText = response.data.choices[0].message.content;

        // Limpiar posible cercado Markdown (```json ... ```) si el modelo lo incluye
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

        const mapData = JSON.parse(responseText);

        return res.status(200).json({
            success: true,
            map: mapData
        });

    } catch (error) {
        console.error("❌ Error en la llamada a OpenRouter API:", error.response?.data || error.message);
        return res.status(200).json({ 
            success: true, 
            map: generateFallbackIsland(),
            error_info: "Fallback activado por error de API u OpenRouter"
        });
    }
});

app.listen(PORT, () => {
    console.log(`⚡ SERVIDOR DE RENDER ACTIVO EN PUERTO ${PORT}`);
});
