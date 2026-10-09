const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Clave API de OpenRouter desde las variables de entorno
const openRouterApiKey = process.env.OPENROUTER_API_KEY || "";

// Medidas exactas para room de 5000x3000 px en GameMaker (Tiles 32x32)
const DEFAULT_MAP_WIDTH = 156;  // 156 * 32 = 4992 px
const DEFAULT_MAP_HEIGHT = 94;  // 94 * 32 = 3008 px
const TILE_SIZE = 32;

// Generador de respaldo local de 156x94 (Solo valores 0, 1, 2, 3)
function generateFallbackIsland(w = DEFAULT_MAP_WIDTH, h = DEFAULT_MAP_HEIGHT) {
    let grid = Array(h).fill().map(() => Array(w).fill(1)); // Todo en piso por defecto (1)

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Agua en bordes exteriores (0)
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
                grid[y][x] = 0;
                continue;
            }
            // Muro perimetral (2)
            if (x === 1 || y === 1 || x === w - 2 || y === h - 2) {
                grid[y][x] = 2;
                continue;
            }
            // Muros aleatorios
            if (Math.random() < 0.06) {
                grid[y][x] = 2;
            } 
            // Cofres y loot
            else if (Math.random() < 0.02) {
                grid[y][x] = 3;
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

// Función de escalado procedural (39x24 -> 156x94)
function expandGrid(smallGrid, targetW = 156, targetH = 94) {
    if (!smallGrid || !Array.isArray(smallGrid) || smallGrid.length === 0) {
        return generateFallbackIsland(targetW, targetH).grid;
    }

    const smallH = smallGrid.length;
    const smallW = smallGrid[0].length;
    let fullGrid = Array(targetH).fill().map(() => Array(targetW).fill(1));

    const scaleX = targetW / smallW;
    const scaleY = targetH / smallH;

    for (let y = 0; y < targetH; y++) {
        for (let x = 0; x < targetW; x++) {
            const origY = Math.min(Math.floor(y / scaleY), smallH - 1);
            const origX = Math.min(Math.floor(x / scaleX), smallW - 1);
            fullGrid[y][x] = smallGrid[origY][origX];
        }
    }
    return fullGrid;
}

// 1. Ruta raíz
app.get('/', (req, res) => {
    res.status(200).send(`Rat Wars Render Server - Online (Room 5000x3000px | Matriz: ${DEFAULT_MAP_WIDTH}x${DEFAULT_MAP_HEIGHT})`);
});

// 2. Endpoint de estado
app.get('/api/status', (req, res) => {
    res.status(200).json({ 
        status: "online", 
        service: "Rat Wars Render Server",
        dimensions: {
            room: "5000x3000 px",
            grid: `${DEFAULT_MAP_WIDTH}x${DEFAULT_MAP_HEIGHT}`,
            pixels: `${DEFAULT_MAP_WIDTH * TILE_SIZE}x${DEFAULT_MAP_HEIGHT * TILE_SIZE}`
        }
    });
});

// 3. Ruta principal de generación de mapa
app.post('/api/render_map', async (req, res) => {
    const userPrompt = req.body.prompt || "Isla de batalla de Halloween con laberintos de tumbas, zonas de muros y cofres de botín";
    const mapWidth = DEFAULT_MAP_WIDTH;
    const mapHeight = DEFAULT_MAP_HEIGHT;

    console.log(`[Render Server] Generando mapa para Room 5000x3000 (${mapWidth}x${mapHeight}) - Prompt: "${userPrompt}"`);

    if (!openRouterApiKey) {
        return res.status(200).json({ 
            success: true, 
            map: generateFallbackIsland(mapWidth, mapHeight),
            error_info: "Fallback activado: Falta OPENROUTER_API_KEY"
        });
    }

    try {
        // Solicitamos una matriz ligera de 39x24 a Gemini para evitar superar max_tokens
        const systemPrompt = `Eres el diseñador principal de mapas procedurales para Rat Wars.
Genera una matriz compacta para un mapa de batalla de 39 columnas por 24 filas.

Debes responder ÚNICAMENTE con un JSON válido sin comillas ni formato markdown.

Formato JSON de salida:
{
  "map_name": "Nombre creativo de la isla",
  "theme": "Estilo visual",
  "grid": [[0,0,1], [0,1,1]]
}

REGLA ESTRICTA DE LA MATRIZ (grid):
Usa ÚNICAMENTE estos 4 valores numéricos en el arreglo 2D:
0 = Agua / Vacio (Genera obj_water)
1 = Tierra / Piso (Genera obj_floor y opcionalmente obj_pasto)
2 = Muros / Obstaculos (Genera obj_floor + obj_wall)
3 = Loot / Cofres y armas (Genera obj_floor + obj_chest / obj_weapon_drop)

NO utilices ningún otro número ni superes las 39 columnas y 24 filas.`;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.5-flash-lite', // <--- CONFIGURADO A GEMINI 2.5 FLASH LITE
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Indicación del mapa: "${userPrompt}"` }
                ],
                max_tokens: 4000,
                response_format: { type: 'json_object' }
            },
            {
                headers: {
                    'Authorization': `Bearer ${openRouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://rat-wars.onrender.com',
                    'X-Title': 'Rat Wars Game'
                },
                timeout: 30000
            }
        );

        let responseText = response.data.choices[0].message.content;
        responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

        const rawData = JSON.parse(responseText);

        // Escalamos la matriz de 39x24 a la cuadrícula real de 156x94 de la room
        const finalGrid = expandGrid(rawData.grid, mapWidth, mapHeight);

        const fullMapData = {
            map_name: rawData.map_name || "Isla Batalla Gemini",
            theme: rawData.theme || "Halloween",
            width: mapWidth,
            height: mapHeight,
            tile_size: TILE_SIZE,
            real_width_px: mapWidth * TILE_SIZE,
            real_height_px: mapHeight * TILE_SIZE,
            bus_route: {
                start: { x: 5, y: 5 },
                end: { x: mapWidth - 5, y: mapHeight - 5 }
            },
            pois: [
                { name: "Zona Principal", x: Math.floor(mapWidth * 0.5), y: Math.floor(mapHeight * 0.5) }
            ],
            special_objects: [
                { type: "chest", x: Math.floor(mapWidth * 0.3), y: Math.floor(mapHeight * 0.3), tag: "Cofre" }
            ],
            grid: finalGrid
        };

        return res.status(200).json({
            success: true,
            map: fullMapData
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
    console.log(`⚡ SERVIDOR DE RENDER ACTIVO EN PUERTO ${PORT} (Room 5000x3000px | Matriz: ${DEFAULT_MAP_WIDTH}x${DEFAULT_MAP_HEIGHT})`);
});
