export const ITEMS = {
  hand: { name: 'Manos', icon: '✋', weight: 0, tool: 'hand', dmg: 7, desc: 'Tus manos desnudas. Sirven para lo básico.' },
  wood: { name: 'Madera', icon: '🪵', weight: 0.5, desc: 'Combustible y material de construcción.' },
  thatch: { name: 'Paja', icon: '🌾', weight: 0.1, desc: 'Ligera y seca. Arde con facilidad.' },
  stone: { name: 'Piedra', icon: '🪨', weight: 1, desc: 'La base de toda herramienta primitiva.' },
  flint: { name: 'Pedernal', icon: '◆', weight: 0.2, desc: 'Afilado. Ideal para puntas y hojas.' },
  fiber: { name: 'Fibra', icon: '🌿', weight: 0.05, desc: 'Cordaje natural para ataduras y ropa.' },
  berry: { name: 'Bayas', icon: '🫐', weight: 0.1, food: 8, water: 5, desc: 'Comida y bebida. A los dodos les encantan.' },
  rawMeat: { name: 'Carne cruda', icon: '🥩', weight: 0.5, food: 8, desc: 'Mejor cocinarla en una hoguera.' },
  cookedMeat: { name: 'Carne cocinada', icon: '🍗', weight: 0.4, food: 32, water: -2, desc: 'Jugosa y segura. Restaura mucha comida.' },
  hide: { name: 'Piel', icon: '🟫', weight: 0.2, desc: 'Cuero curtido a mano. Sirve para sillas y ropa.' },
  pick: { name: 'Pico de piedra', icon: '⛏️', weight: 5, tool: 'pick', dmg: 16, desc: 'Ideal para paja, pedernal y piedra.' },
  hatchet: { name: 'Hacha de piedra', icon: '🪓', weight: 5, tool: 'hatchet', dmg: 18, desc: 'Corta madera y rocas con eficacia.' },
  spear: { name: 'Lanza', icon: '🔱', weight: 4, tool: 'spear', dmg: 34, desc: 'Arma rudimentaria pero letal. Golpea desde lejos.' },
  saddle: { name: 'Silla de montar', icon: '🐎', weight: 8, desc: 'Permite montar un parasaurio domesticado.' },
  brew: { name: 'Brebaje médico', icon: '🧪', weight: 0.1, heal: 55, desc: 'Restaura salud al instante.' },
};

export const TOOL_ORDER = ['hand', 'pick', 'hatchet', 'spear'];

export const HOTBAR = ['hand', 'pick', 'hatchet', 'spear', 'berry', 'cookedMeat'];

export const RECIPES = [
  {
    id: 'pick', name: 'Pico de piedra', icon: '⛏️', level: 1, xp: 8,
    needs: { wood: 1, stone: 1, thatch: 8 },
    desc: 'Recolecta paja y pedernal con eficacia.',
    out: 'pick',
  },
  {
    id: 'hatchet', name: 'Hacha de piedra', icon: '🪓', level: 1, xp: 8,
    needs: { wood: 1, stone: 1, thatch: 8 },
    desc: 'La mejor opción para talar árboles.',
    out: 'hatchet',
  },
  {
    id: 'spear', name: 'Lanza', icon: '🔱', level: 2, xp: 14,
    needs: { wood: 2, flint: 1, fiber: 6 },
    desc: 'Arma básica. Aumenta mucho el daño.',
    out: 'spear',
  },
  {
    id: 'campfire', name: 'Hoguera', icon: '🔥', level: 2, xp: 20,
    needs: { stone: 10, wood: 2, flint: 1 },
    desc: 'Cocina carne y mantiene alejados a los raptores.',
    structure: true,
  },
  {
    id: 'saddle', name: 'Silla de montar', icon: '🐎', level: 3, xp: 25,
    needs: { hide: 10, fiber: 15 },
    desc: 'Monta tu parasaurio domesticado.',
    out: 'saddle',
  },
  {
    id: 'brew', name: 'Brebaje médico', icon: '🧪', level: 3, xp: 12,
    needs: { berry: 8, fiber: 4 },
    desc: 'Cura 55 de salud de inmediato.',
    out: 'brew',
  },
];
