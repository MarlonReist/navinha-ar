// Detector ArUco 4x4 puro em JavaScript (sem dependências externas)
// Dicionário customizado de 4 IDs (0..3) com distância mínima de Hamming >= 5 bits entre todas as rotações.

export const ARUCO_CODES = {
  0: [
    [1, 0, 1, 1],
    [0, 0, 1, 1],
    [1, 0, 0, 1],
    [0, 0, 1, 0],
  ],
  1: [
    [1, 1, 1, 0],
    [1, 0, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 1, 0],
  ],
  2: [
    [0, 1, 0, 1],
    [1, 1, 1, 0],
    [0, 1, 1, 0],
    [1, 1, 0, 1],
  ],
  3: [
    [0, 1, 0, 0],
    [1, 0, 0, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 1],
  ],
};

function rotateMatrixCW(m) {
  const res = [];
  for (let c = 0; c < 4; c++) {
    const row = [];
    for (let r = 3; r >= 0; r--) row.push(m[r][c]);
    res.push(row);
  }
  return res;
}

function flatten(m) {
  return m[0].concat(m[1], m[2], m[3]);
}

const SIGNATURES = [];
for (const [idStr, mat] of Object.entries(ARUCO_CODES)) {
  const id = Number(idStr);
  let cur = mat;
  for (let rot = 0; rot < 4; rot++) {
    SIGNATURES.push({ id, rot, bits: flatten(cur) });
    cur = rotateMatrixCW(cur);
  }
}

export class ArUcoDetector {
  constructor(procWidth = 320) {
    this.procWidth = procWidth;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.smoothedBoard = null;
    this.lastSeenTime = 0;
  }

  detect(video, displayWidth, displayHeight, mirrorX = false) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return { found: false, markers: [], board: null };

    const pw = this.procWidth;
    const ph = Math.round((vh / vw) * pw);
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }

    this.ctx.drawImage(video, 0, 0, pw, ph);
    const imgData = this.ctx.getImageData(0, 0, pw, ph).data;
    const n = pw * ph;

    // 1. Escala de cinza + Imagem Integral
    const gray = new Uint8Array(n);
    const integral = new Int32Array(n);
    for (let y = 0; y < ph; y++) {
      let rowSum = 0;
      const yOff = y * pw;
      for (let x = 0; x < pw; x++) {
        const idx = yOff + x;
        const p = idx * 4;
        const g = (imgData[p] * 77 + imgData[p + 1] * 150 + imgData[p + 2] * 29) >> 8;
        gray[idx] = g;
        rowSum += g;
        integral[idx] = rowSum + (y > 0 ? integral[idx - pw] : 0);
      }
    }

    // 2. Binarização adaptativa de Bradley
    const bin = new Uint8Array(n);
    const halfWin = Math.max(8, (pw / 16) | 0);
    const factor = 0.85;
    for (let y = 0; y < ph; y++) {
      const y1 = Math.max(0, y - halfWin);
      const y2 = Math.min(ph - 1, y + halfWin);
      const yOff = y * pw;
      for (let x = 0; x < pw; x++) {
        const x1 = Math.max(0, x - halfWin);
        const x2 = Math.min(pw - 1, x + halfWin);
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);
        let sum = integral[y2 * pw + x2];
        if (x1 > 0) sum -= integral[y2 * pw + (x1 - 1)];
        if (y1 > 0) sum -= integral[(y1 - 1) * pw + x2];
        if (x1 > 0 && y1 > 0) sum += integral[(y1 - 1) * pw + (x1 - 1)];
        bin[yOff + x] = gray[yOff + x] * count < sum * factor ? 0 : 1;
      }
    }

    // 3. Componentes conectados pretos (candidatos a marcadores)
    const visited = new Uint8Array(n);
    const stack = new Int32Array(n);
    const borderPts = [];
    const foundMarkers = new Map();
    const minArea = Math.max(45, (n * 0.0005) | 0);
    const maxArea = (n * 0.25) | 0;

    for (let start = 0; start < n; start++) {
      if (bin[start] !== 0 || visited[start]) continue;

      let sp = 0;
      stack[sp++] = start;
      visited[start] = 1;

      let area = 0;
      let minX = pw, maxX = 0, minY = ph, maxY = 0;
      let sumX = 0, sumY = 0;
      borderPts.length = 0;

      while (sp > 0) {
        const idx = stack[--sp];
        const x = idx % pw;
        const y = (idx / pw) | 0;
        area++;
        sumX += x;
        sumY += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        let isBorder = x === 0 || x === pw - 1 || y === 0 || y === ph - 1;

        // 4-vizinhos
        if (x > 0) {
          const nb = idx - 1;
          if (bin[nb] === 0) {
            if (!visited[nb]) { visited[nb] = 1; stack[sp++] = nb; }
          } else isBorder = true;
        }
        if (x < pw - 1) {
          const nb = idx + 1;
          if (bin[nb] === 0) {
            if (!visited[nb]) { visited[nb] = 1; stack[sp++] = nb; }
          } else isBorder = true;
        }
        if (y > 0) {
          const nb = idx - pw;
          if (bin[nb] === 0) {
            if (!visited[nb]) { visited[nb] = 1; stack[sp++] = nb; }
          } else isBorder = true;
        }
        if (y < ph - 1) {
          const nb = idx + pw;
          if (bin[nb] === 0) {
            if (!visited[nb]) { visited[nb] = 1; stack[sp++] = nb; }
          } else isBorder = true;
        }

        if (isBorder) borderPts.push(x, y);
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (area < minArea || area > maxArea || bw < 10 || bh < 10) continue;
      const ratio = bw / bh;
      if (ratio < 0.4 || ratio > 2.5) continue;

      const quad = this._extractQuad(borderPts, sumX / area, sumY / area);
      if (!quad) continue;

      const decoded = this._decodeQuad(gray, pw, ph, quad);
      if (decoded) {
        // Converte coordenadas para o espaço de exibição (cobrindo o vídeo com object-fit: cover)
        const mappedCorners = decoded.corners.map((pt) =>
          this._mapToDisplay(pt.x, pt.y, pw, ph, displayWidth, displayHeight, mirrorX)
        );
        if (!foundMarkers.has(decoded.id)) {
          foundMarkers.set(decoded.id, {
            id: decoded.id,
            corners: mappedCorners,
            dist: decoded.dist,
          });
        }
      }
    }

    const board = this._computeBoard(foundMarkers, displayWidth, displayHeight);
    return {
      found: board !== null,
      markers: Array.from(foundMarkers.values()),
      board,
    };
  }

  _extractQuad(borderPts, cx, cy) {
    const len = borderPts.length;
    if (len < 16) return null;

    // P0: ponto mais distante do centroide
    let p0x = 0, p0y = 0, maxD = -1;
    for (let i = 0; i < len; i += 2) {
      const dx = borderPts[i] - cx;
      const dy = borderPts[i + 1] - cy;
      const d = dx * dx + dy * dy;
      if (d > maxD) { maxD = d; p0x = borderPts[i]; p0y = borderPts[i + 1]; }
    }

    // P2: ponto mais distante de P0
    let p2x = 0, p2y = 0;
    maxD = -1;
    for (let i = 0; i < len; i += 2) {
      const dx = borderPts[i] - p0x;
      const dy = borderPts[i + 1] - p0y;
      const d = dx * dx + dy * dy;
      if (d > maxD) { maxD = d; p2x = borderPts[i]; p2y = borderPts[i + 1]; }
    }

    // P1 e P3: extremos perpendiculares à diagonal P0-P2
    const vx = p2x - p0x;
    const vy = p2y - p0y;
    let p1x = p0x, p1y = p0y, maxCross = 0;
    let p3x = p0x, p3y = p0y, minCross = 0;
    for (let i = 0; i < len; i += 2) {
      const wx = borderPts[i] - p0x;
      const wy = borderPts[i + 1] - p0y;
      const cross = vx * wy - vy * wx;
      if (cross > maxCross) { maxCross = cross; p1x = borderPts[i]; p1y = borderPts[i + 1]; }
      if (cross < minCross) { minCross = cross; p3x = borderPts[i]; p3y = borderPts[i + 1]; }
    }

    const pts = [
      { x: p0x, y: p0y },
      { x: p1x, y: p1y },
      { x: p2x, y: p2y },
      { x: p3x, y: p3y },
    ];

    // Ordena em sentido horário ao redor do centroide
    pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

    // Verifica comprimentos mínimos dos lados
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 8) return null;
    }
    return pts;
  }

  _sampleBilinear(pts, u, v) {
    const [tl, tr, br, bl] = pts;
    const topX = tl.x + (tr.x - tl.x) * u;
    const topY = tl.y + (tr.y - tl.y) * u;
    const botX = bl.x + (br.x - bl.x) * u;
    const botY = bl.y + (br.y - bl.y) * u;
    return {
      x: topX + (botX - topX) * v,
      y: topY + (botY - topY) * v,
    };
  }

  _decodeQuad(gray, pw, ph, pts) {
    const grid = new Float32Array(36);
    let borderSum = 0;
    let minIn = 255, maxIn = 0;

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const u = (c + 0.5) / 6;
        const v = (r + 0.5) / 6;
        const p = this._sampleBilinear(pts, u, v);
        const ix = Math.max(0, Math.min(pw - 1, Math.round(p.x)));
        const iy = Math.max(0, Math.min(ph - 1, Math.round(p.y)));
        const val = gray[iy * pw + ix];
        grid[r * 6 + c] = val;

        if (r === 0 || r === 5 || c === 0 || c === 5) {
          borderSum += val;
        } else {
          if (val < minIn) minIn = val;
          if (val > maxIn) maxIn = val;
        }
      }
    }

    // Contraste mínimo entre células pretas e brancas
    if (maxIn - minIn < 22) return null;

    const thresh = (minIn + maxIn) * 0.5;
    // Borda externa precisa ser majoritariamente escura
    let darkBorder = 0;
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (r === 0 || r === 5 || c === 0 || c === 5) {
          if (grid[r * 6 + c] < thresh) darkBorder++;
        }
      }
    }
    if (darkBorder < 16) return null;
    if (borderSum / 20 > thresh) return null;

    // Extrai 16 bits centrais (4x4)
    const bits = new Array(16);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        bits[r * 4 + c] = grid[(r + 1) * 6 + (c + 1)] >= thresh ? 1 : 0;
      }
    }

    // Compara com todas as assinaturas (até 1 bit de erro)
    let best = null;
    let bestDist = 2;
    for (const sig of SIGNATURES) {
      let d = 0;
      for (let i = 0; i < 16; i++) {
        if (bits[i] !== sig.bits[i]) d++;
        if (d >= bestDist) break;
      }
      if (d < bestDist) {
        bestDist = d;
        best = sig;
      }
    }
    if (!best) return null;

    // Ajusta os cantos conforme a rotação detectada
    // Se rot == 1 (90° CW), o topo real está na direita, etc.
    const rotatedCorners = [];
    for (let i = 0; i < 4; i++) {
      rotatedCorners.push(pts[(i + (4 - best.rot)) % 4]);
    }

    return {
      id: best.id,
      corners: rotatedCorners,
      dist: bestDist,
    };
  }

  _mapToDisplay(x, y, pw, ph, dw, dh, mirrorX) {
    // Reproduz object-fit: cover do <video>
    const scale = Math.max(dw / pw, dh / ph);
    const rw = pw * scale;
    const rh = ph * scale;
    const ox = (dw - rw) * 0.5;
    const oy = (dh - rh) * 0.5;
    let sx = ox + x * scale;
    const sy = oy + y * scale;
    if (mirrorX) sx = dw - sx;
    return { x: sx, y: sy };
  }

  _computeBoard(foundMarkers, dw, dh) {
    const now = performance.now();
    // Cantos internos de cada marcador delimitam o tabuleiro central:
    // ID 0 (TL) -> canto BR do marcador (index 2)
    // ID 1 (TR) -> canto BL do marcador (index 3)
    // ID 2 (BR) -> canto TL do marcador (index 0)
    // ID 3 (BL) -> canto TR do marcador (index 1)
    let tl = foundMarkers.has(0) ? foundMarkers.get(0).corners[2] : null;
    let tr = foundMarkers.has(1) ? foundMarkers.get(1).corners[3] : null;
    let br = foundMarkers.has(2) ? foundMarkers.get(2).corners[0] : null;
    let bl = foundMarkers.has(3) ? foundMarkers.get(3).corners[1] : null;

    const count = (tl ? 1 : 0) + (tr ? 1 : 0) + (br ? 1 : 0) + (bl ? 1 : 0);

    if (count >= 3) {
      if (!tl) tl = { x: tr.x + bl.x - br.x, y: tr.y + bl.y - br.y };
      if (!tr) tr = { x: tl.x + br.x - bl.x, y: tl.y + br.y - bl.y };
      if (!br) br = { x: tr.x + bl.x - tl.x, y: tr.y + bl.y - tl.y };
      if (!bl) bl = { x: tl.x + br.x - tr.x, y: tl.y + br.y - tr.y };

      // Garante tamanho mínimo plausível
      const w = Math.hypot(tr.x - tl.x, tr.y - tl.y);
      const h = Math.hypot(bl.x - tl.x, bl.y - tl.y);
      if (w < 40 || h < 40 || w > dw * 1.5 || h > dh * 1.5) {
        return this._holdBoard(now);
      }

      const raw = { tl, tr, br, bl };
      if (!this.smoothedBoard) {
        this.smoothedBoard = raw;
      } else {
        const a = 0.35;
        this.smoothedBoard = {
          tl: this._lerpPt(this.smoothedBoard.tl, raw.tl, a),
          tr: this._lerpPt(this.smoothedBoard.tr, raw.tr, a),
          br: this._lerpPt(this.smoothedBoard.br, raw.br, a),
          bl: this._lerpPt(this.smoothedBoard.bl, raw.bl, a),
        };
      }
      this.lastSeenTime = now;
      return this.smoothedBoard;
    }

    return this._holdBoard(now);
  }

  _holdBoard(now) {
    // Mantém o tabuleiro estável por até 550ms se houver tremor ou perda momentânea
    if (this.smoothedBoard && now - this.lastSeenTime < 550) {
      return this.smoothedBoard;
    }
    if (now - this.lastSeenTime >= 550) {
      this.smoothedBoard = null;
    }
    return null;
  }

  _lerpPt(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
}
