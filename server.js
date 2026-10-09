const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Clave API de OpenRouter desde las variables de entorno
const openRouterApiKey = process.env.OPENROUTER_API_KEY || "";

// Medidas reales: 156x94 casillas de 32x32px
const DEFAULT_MAP_WIDTH = 156; 
const DEFAULT_MAP_HEIGHT = 94; 
const TILE_SIZE = 32;

// Generador de mapa de respaldo (Fallback Offline) usando exclusivamente valores 0, 1, 2, 3
function generateFallbackIsland(w = DEFAULT_MAP_WIDTH, h = DEFAULT_MAP_HEIGHT) {
    let grid = Array(h).fill().map(() => Array(w).fill(1)); // Inicializa todo en Suelo (1)
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Bordes de mapa (Agua = 0 / Pared = 2)
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
                grid[y][x] = 0; // Agua bordes exteriores
                continue;
            }
            
            if (x === 1 || y === 1 || x === w - 2 || y === h - 2) {
                grid[y][x] = 2; // Muro perimetral
                continue;
            }

            // Muros y estructuras aleatorias
            if (Math.random() < 0.06) {
                grid[y][x] = 2; // Muro / Obstáculo
            } 
            // Cofres y loot
            else if (Math.random() < 0.02) {
                grid[y][x] = 3; // Cofre / Item Drop
            }
        }
    }

    return {
        map_name: "Isla Batalla Rat Wars (Offline)",
        theme: "Halloween Cyberpunk",
        width: w,
        height: h,
        tile_size: TILE_SIZE,
        real_width_px: w * TILE_SIZE,
        real_height_px: h * TILE_SIZE,
        bus_route: {
            start: { x: 5, y: 5 },
            end: { x: w - 5, y: h - 5 }
        },
        pois: [
            { name: "Torres Queseras", x: Math.floor(w * 0.3), y: Math.floor(h * 0.4) },
            { name: "Santuario Roedor", x: Math.floor(w * 0.7), y: Math.floor(h * 0.6) }
        ],
        special_objects: [
            { type: "chest", x: Math.floor(w * 0.3), y: Math.floor(h * 0.4), tag: "Cofre de Botín" },
            { type: "chest", x: Math.floor(w * 0.7), y: Math.floor(h * 0.6), tag: "Cofre de Botín" }
        ],
        grid
    };
}

// 1. Ruta raíz
app.get('/', (req, res) => {
    res.status(200).send(`Rat Wars Render Server - Online (${DEFAULT_MAP_WIDTH}x${DEFAULT_MAP_HEIGHT} casillas = ${DEFAULT_MAP_WIDTH * TILE_SIZE}x${DEFAULT_MAP_HEIGHT * TILE_SIZE} px)`);
});

// 2. Endpoint de estado
app.get('/api/status', (req, res) => {
    res.status(200).json({ 
        status: "online", 
        service: "Rat Wars Render Server",
        dimensions: {
            grid: `${DEFAULT_MAP_WIDTH}x${DEFAULT_MAP_HEIGHT}`,
            pixels: `${DEFAULT_MAP_WIDTH * TILE_SIZE}x${DEFAULT_MAP_HEIGHT * TILE_SIZE}`
        }
    });
});

// 3. Ruta principal de generación de mapa
app.post('/api/render_map', async (req, res) => {
    const userPrompt = req.body.prompt || "Isla de batalla de Halloween con caminos, estructuras de muros y cofres de botín";
    const mapWidth = req.body.width || DEFAULT_MAP_WIDTH;
    const mapHeight = req.body.height || DEFAULT_MAP_HEIGHT;

    console.log(`[Render Server] Procesando prompt: "${userPrompt}" (${mapWidth}x${mapHeight})`);

    if (!openRouterApiKey) {
        return res.status(200).json({ 
            success: true, 
            map: generateFallbackIsland(mapWidth, mapHeight),
            error_info: "Fallback activado: Falta OPENROUTER_API_KEY"
        });
    }

    try {
        const systemPrompt = `Eres el diseñador de mapas procedurales para Rat Wars en GameMaker.
Genera una matriz para un mapa de ${mapWidth} columnas por ${mapHeight} filas (${mapWidth * TILE_SIZE}x${mapHeight * TILE_SIZE} px).

Debes responder ÚNICAMENTE con un JSON válido sin bloques markdown.

Formato JSON de salida:
{
  "map_name": "Nombre de la isla",
  "theme": "Estilo visual",
  "width": ${mapWidth},
  "height": ${mapHeight},
  "tile_size": 32,
  "real_width_px": ${mapWidth * TILE_SIZE},
  "real_height_px": ${mapHeight * TILE_SIZE},
  "bus_route": { "start": {"x": 10, "y": 0}, "end": {"x": 140, "y": 90} },
  "pois": [ {"name": "Poblado Quesero", "x": 30, "y": 25} ],
  "special_objects": [ {"type": "chest", "x": 32, "y": 26, "tag": "Cofre"} ],
  "grid": [[0,0,1], [0,1,1]]
}

REGLA STRICTA DE LA MATRIZ (grid):
Usa ÚNICAMENTE estos 4 valores numéricos en el arreglo 2D:
0 = Agua / Zona hundida (Genera obj_water)
1 = Suelo / Pasto basal (Genera obj_floor y opcionalmente obj_pasto)
2 = Muros / Obstáculos (Genera obj_floor + obj_wall)
3 = Loot / Cofres y armas (Genera obj_floor + obj_chest / obj_weapon_drop)

NO utilices ningún otro número.`;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.5-flash-lite',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Indicación del mapa: "${userPrompt}"` }
                ],
                max_tokens: 6000,
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Authorization': `Bearer ${openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://rat-wars.onrender.com',
                    'X-Title': 'Rat Wars Game'
                },
                timeout: 45000
            }
        );

        let responseText = response.data.choices[0].message.content;
        responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

        const mapData = JSON.parse(responseText);

        return res.status(200).json({
            success: true,
            map: mapData
        });

    } catch (error) {
        const apiErrorDetails = error.response?.data || error.message;
        console.error("❌ Error de comunicación con OpenRouter:", JSON.stringify(apiErrorDetails, null, 2));

        return res.status(200).json({ 
            success: true, 
            map: generateFallbackIsland(mapWidth, mapHeight),
            error_info: "Fallback activado: " + (error.response?.data?.error?.message || error.message)
        });
    }
});

app.listen(PORT, () => {
    console.log(`⚡ SERVIDOR DE RENDER ACTIVO EN PUERTO ${PORT} (${DEFAULT_MAP_WIDTH}x${DEFAULT_MAP_HEIGHT} casillas = ${DEFAULT_MAP_WIDTH * TILE_SIZE}x${DEFAULT_MAP_HEIGHT * TILE_SIZE} px)`);
});
