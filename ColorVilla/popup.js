// --- Color Conversion Utilities ---

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function rgbToHsl(r, g, b) {
  r /= 255, g /= 255, b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

// --- Contrast Logic ---

function getRelativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function getContrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = getRelativeLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getRelativeLuminance(rgb2.r, rgb2.g, rgb2.b);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return ratio.toFixed(2);
}

// --- Palette Generation ---

function generateProceduralPalettes(baseH, baseS, baseL) {
  const modes = [
    { name: 'Monochromatic', offsets: [[0,0,-20], [0,0,-10], [0,0,10], [0,0,20]] },
    { name: 'Complementary', offsets: [[180,0,0], [180,0,-10], [0,0,10], [0,0,20]] },
    { name: 'Analogous', offsets: [[30,0,0], [60,0,0], [-30,0,0], [-60,0,0]] },
    { name: 'Vibrant', offsets: [[120,20,0], [240,20,0], [0,20,20], [0,-20,-20]] }
  ];

  return modes.map(mode => {
    const colors = [rgbToHex(...Object.values(hslToRgb(baseH, baseS, baseL)))];
    mode.offsets.forEach(offset => {
      const h = (baseH + offset[0] + 360) % 360;
      const s = Math.max(0, Math.min(100, baseS + offset[1]));
      const l = Math.max(0, Math.min(100, baseL + offset[2]));
      const rgb = hslToRgb(h, s, l);
      colors.push(rgbToHex(rgb.r, rgb.g, rgb.b));
    });
    return { name: mode.name, colors };
  });
}

// --- UI Logic ---

const elements = {
  pickBtn: document.getElementById('pickBtn'),
  colorPreview: document.getElementById('colorPreview'),
  hexCode: document.getElementById('hexCode'),
  rgbCode: document.getElementById('rgbCode'),
  shadesContainer: document.getElementById('shadesContainer'),
  tintsContainer: document.getElementById('tintsContainer'),
  harmoniesContainer: document.getElementById('harmoniesContainer'),
  historyContainer: document.getElementById('historyContainer'),
  inspirationContainer: document.getElementById('inspirationContainer'),
  refreshInspiration: document.getElementById('refreshInspiration'),
  tabs: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  // Contrast elements
  contrastDemo: document.getElementById('contrastDemo'),
  contrastRatio: document.getElementById('contrastRatio'),
  badgeAA: document.getElementById('badgeAA'),
  badgeAAA: document.getElementById('badgeAAA'),
  bgInput: document.getElementById('bgInput'),
  textInput: document.getElementById('textInput'),
  bgSwatch: document.getElementById('bgSwatch'),
  textSwatch: document.getElementById('textSwatch'),
  // Export
  exportCSS: document.getElementById('exportCSS'),
  exportJSON: document.getElementById('exportJSON')
};

let currentHex = '#6366f1';

async function updateUI(hex) {
  currentHex = hex;
  const rgb = hexToRgb(hex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  elements.colorPreview.style.background = hex;
  elements.hexCode.textContent = hex;
  elements.rgbCode.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;

  // Palettes
  renderPaletteGrid(elements.shadesContainer, generateShades(hsl));
  renderPaletteGrid(elements.tintsContainer, generateTints(hsl));
  renderHarmonies(generateHarmonies(hsl));
  
  // Update Contrast Checker
  elements.textInput.value = hex;
  elements.textSwatch.style.background = hex;
  updateContrast();

  // Inspiration
  renderInspiration(hsl);

  saveToHistory(hex);
}

function generateShades(hsl) {
  return [10, 20, 30, 40, 50].map(amt => {
    const rgb = hslToRgb(hsl.h, hsl.s, Math.max(0, hsl.l - amt));
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  });
}

function generateTints(hsl) {
  return [10, 20, 30, 40, 50].map(amt => {
    const rgb = hslToRgb(hsl.h, hsl.s, Math.min(100, hsl.l + amt));
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  });
}

function generateHarmonies(hsl) {
  const angles = [180, 30, -30, 120, 240];
  return angles.map(a => {
    const rgb = hslToRgb((hsl.h + a + 360) % 360, hsl.s, hsl.l);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  });
}

function renderPaletteGrid(container, colors) {
  container.innerHTML = '';
  colors.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = color;
    swatch.innerHTML = `<span class="swatch-label">${color}</span>`;
    swatch.onclick = () => copyToClipboard(color);
    container.appendChild(swatch);
  });
}

function renderHarmonies(colors) {
  elements.harmoniesContainer.innerHTML = '';
  colors.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = color;
    swatch.innerHTML = `<span class="swatch-label">${color}</span>`;
    swatch.onclick = () => copyToClipboard(color);
    elements.harmoniesContainer.appendChild(swatch);
  });
}

function renderInspiration(hsl) {
  const palettes = generateProceduralPalettes(hsl.h, hsl.s, hsl.l);
  elements.inspirationContainer.innerHTML = '';
  palettes.forEach(p => {
    const row = document.createElement('div');
    row.className = 'palette-row';
    p.colors.forEach(c => {
      const col = document.createElement('div');
      col.className = 'palette-color';
      col.style.background = c;
      col.title = c;
      col.onclick = (e) => {
        e.stopPropagation();
        copyToClipboard(c);
      };
      row.appendChild(col);
    });
    elements.inspirationContainer.appendChild(row);
  });
}

function updateContrast() {
  const bg = elements.bgInput.value;
  const text = elements.textInput.value;

  if (!hexToRgb(bg) || !hexToRgb(text)) return;

  elements.bgSwatch.style.background = bg;
  elements.textSwatch.style.background = text;
  elements.contrastDemo.style.background = bg;
  elements.contrastDemo.style.color = text;

  const ratio = getContrastRatio(bg, text);
  elements.contrastRatio.textContent = ratio;

  // WCAG thresholds
  const r = parseFloat(ratio);
  elements.badgeAA.className = `badge ${r >= 4.5 ? 'pass' : 'fail'}`;
  elements.badgeAAA.className = `badge ${r >= 7.0 ? 'pass' : 'fail'}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied!');
  } catch (err) {
    console.error(err);
  }
}

function showToast(msg) {
  // Simple toast would be nice, but for now we'll just log
  console.log(msg);
}

async function saveToHistory(hex) {
  if (typeof chrome === 'undefined' || !chrome.storage) return;
  const { history = [] } = await chrome.storage.local.get('history');
  if (history[0]?.hex === hex) return;
  const updated = [{ hex, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...history.filter(h => h.hex !== hex)].slice(0, 15);
  await chrome.storage.local.set({ history: updated });
  renderHistory(updated);
}

function renderHistory(history) {
  elements.historyContainer.innerHTML = '';
  history.forEach(item => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="color-swatch-sm" style="background: ${item.hex}"></div>
      <div class="history-info">
        <span class="history-hex">${item.hex}</span>
      </div>
    `;
    div.onclick = () => updateUI(item.hex);
    elements.historyContainer.appendChild(div);
  });
}

// --- Event Listeners ---

elements.pickBtn.addEventListener('click', async () => {
  if (!window.EyeDropper) return;
  const eyeDropper = new EyeDropper();
  try {
    const result = await eyeDropper.open();
    updateUI(result.sRGBHex);
  } catch (err) {}
});

elements.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    elements.tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    elements.tabContents.forEach(c => {
      c.classList.toggle('active', c.id === `${target}Tab`);
    });
  });
});

[elements.bgInput, elements.textInput].forEach(input => {
  input.addEventListener('input', updateContrast);
});

elements.exportCSS.addEventListener('click', () => {
  const css = `--color-primary: ${currentHex};\n--color-primary-rgb: ${Object.values(hexToRgb(currentHex)).join(', ')};`;
  copyToClipboard(css);
});

elements.exportJSON.addEventListener('click', () => {
  const rgb = hexToRgb(currentHex);
  const json = JSON.stringify({ hex: currentHex, rgb, hsl: rgbToHsl(rgb.r, rgb.g, rgb.b) }, null, 2);
  copyToClipboard(json);
});

elements.refreshInspiration?.addEventListener('click', () => {
  const hsl = rgbToHsl(...Object.values(hexToRgb(currentHex)));
  renderInspiration(hsl);
});

// Initialize
if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.local.get('history', (data) => {
    if (data.history?.length > 0) {
      updateUI(data.history[0].hex);
      renderHistory(data.history);
    } else {
      updateUI('#6366f1');
    }
  });
} else {
  updateUI('#6366f1');
}
