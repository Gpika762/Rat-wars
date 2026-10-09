const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// Clave API de OpenRouter desde las variables de entorno
const openRouterApiKey = process.env.OPENROUTER_API_KEY || "";

// Medidas reales: 156x94 casillas de 32x32px = 4992x3008 px (Abarca los 5000x3000px de la room)
const DEFAULT_MAP_WIDTH = 156; 
const DEFAULT_MAP_HEIGHT = 94; 
const TILE_SIZE = 32;

// Generador de mapa de respaldo (Fallback Offline) adaptado a 156x94 (4992x3008 px)
function generateFallbackIsland(w = DEFAULT_MAP_WIDTH, h = DEFAULT_MAP_HEIGHT) {
    let grid = Array(h).fill().map(() => Array(w).fill(0));
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            // Bordes de mapa (Paredes / Agua)
            if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
                grid[y][x] = 2; // Pared
                continue;
            }

            // Distancia para forma de isla alargada
            const dx = (x - cx) / (w / 2.2);
            const dy = (y - cy) / (h / 2.2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 0.85) {
                grid[y][x] = 1; // Tierra / Pasto
            }

            // Río horizontal central
            if (Math.abs(y - cy) <= 2 && dist < 0.8) {
                grid[y][x] = 3; // Río de Queso / Zona Neón
            }
        }
    }

    // Spawns en las esquinas
    const marginX = 8;
    const marginY = 8;
    grid[marginY][marginX] = 4;
    grid[h - marginY - 1][marginX] = 4;
    grid[marginY][w - marginX - 1] = 4;
    grid[h - marginY - 1][w - marginX - 1] = 4;

    return {
        map_name: "Isla Batalla Rat Wars (Offline)",
        theme: "Cyberpunk Fortnite Queso",
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
            { type: "chest", x: Math.floor(w * 0.7), y: Math.floor(h * 0.6), tag: "Cofre de Botín" },
            { type: "supply_drop", x: cx, y: cy, tag: "Drop Neón" }
        ],
        grid
    };
}

// 1. Ruta raíz con dimensiones reales
app.get('/', (req, res) => {
    res.status(200).send(`Rat Wars Render Server - Online (Medidas Reales: ${DEFAULT_MAP_WIDTH}x${DEFAULT_MAP_HEIGHT} casillas = ${DEFAULT_MAP_WIDTH * TILE_SIZE}x${DEFAULT_MAP_HEIGHT * TILE_SIZE} px)`);
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
    const userPrompt = req.body.prompt || "Isla de batalla estilo Fortnite con ríos de queso, edificios neón y cofres de botín";
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
        const systemPrompt = `Eres el diseñador principal de mapas procedurales para Rat Wars.
Genera un mapa de matriz de ${mapWidth} columnas por ${mapHeight} filas (${mapWidth * TILE_SIZE}x${mapHeight * TILE_SIZE} px).

Responde ÚNICAMENTE en JSON válido sin comillas markdown.

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

Valores de grid:
0 = Agua/Vacío
1 = Tierra/Pasto
2 = Estructura/Muro
3 = Río/Zona Neón
4 = Punto de Spawn`;

        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'google/gemini-2.5-flash', // Corrección del modelo
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
                timeout: 45000 // Aumentado a 45s por el volumen del JSON
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
        // Muestra el motivo exacto en los Logs de Render
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
    console.log(`⚡ SERVIDOR DE RENDER ACTIVO EN PUERTO ${PORT} (Soporte Real: ${DEFAULT_MAP_WIDTH}x${DEFAULT_MAP_HEIGHT} casillas = ${DEFAULT_MAP_WIDTH * TILE_SIZE}x${DEFAULT_MAP_HEIGHT * TILE_SIZE} px)`);
});
