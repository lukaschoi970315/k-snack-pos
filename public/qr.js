// Pure-JS ISO/IEC 18004 QR Code SVG Generator (Zero external dependencies, works 100% offline)
// Supports Byte mode (UTF-8), ECC Level M, Versions 1..10 (up to 213 UTF-8 bytes)

(function (root) {
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(ecLen) {
    let poly = [1];
    for (let i = 0; i < ecLen; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const factor = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsCompute(data, ecLen) {
    const gen = rsGeneratorPoly(ecLen);
    const res = new Uint8Array(data.length + ecLen);
    res.set(data);
    for (let i = 0; i < data.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  // Version specs for ECC Level M:
  // [totalCodewords, ecPerBlock, numBlocksGroup1, dataPerBlockGroup1, numBlocksGroup2, dataPerBlockGroup2]
  const VERSION_M = {
    1:  [26,  10, 1, 16, 0, 0],
    2:  [44,  16, 1, 28, 0, 0],
    3:  [70,  26, 1, 44, 0, 0],
    4:  [100, 18, 2, 32, 0, 0],
    5:  [134, 24, 2, 43, 0, 0],
    6:  [172, 16, 4, 27, 0, 0],
    7:  [196, 18, 4, 31, 0, 0],
    8:  [242, 22, 2, 38, 2, 39],
    9:  [292, 22, 3, 36, 2, 37],
    10: [346, 26, 4, 43, 1, 44],
  };

  const ALIGNMENT_POS = {
    1: [],
    2: [6, 18],
    3: [6, 22],
    4: [6, 26],
    5: [6, 30],
    6: [6, 34],
    7: [6, 22, 38],
    8: [6, 24, 42],
    9: [6, 26, 46],
    10: [6, 28, 50],
  };

  // Precomputed 15-bit BCH format info for ECC Level M (00) and masks 0..7, masked with 101010000010010 (0x5412)
  const FORMAT_M = [
    0x5412, 0x5125, 0x5e7c, 0x5b4b,
    0x45f9, 0x40ce, 0x4f97, 0x4aa0
  ];

  // Version info 18-bit BCH for versions >= 7
  const VERSION_INFO = {
    7: 0x07c94,
    8: 0x085bc,
    9: 0x09a99,
    10: 0x0a4d3,
  };

  function encodeData(bytes) {
    let ver = 1;
    for (; ver <= 10; ver++) {
      const [, , g1c, g1d, g2c, g2d] = VERSION_M[ver];
      const cap = g1c * g1d + g2c * g2d;
      const charCountBits = ver >= 10 ? 16 : 8;
      const neededBits = 4 + charCountBits + bytes.length * 8;
      if (Math.ceil(neededBits / 8) <= cap) break;
    }
    if (ver > 10) ver = 10;

    const [, ecPerBlock, g1c, g1d, g2c, g2d] = VERSION_M[ver];
    const dataCapacity = g1c * g1d + g2c * g2d;
    const maxBytes = dataCapacity - (ver >= 10 ? 3 : 2);
    const payload = bytes.slice(0, maxBytes);

    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
    };

    pushBits(0b0100, 4); // Byte mode
    pushBits(payload.length, ver >= 10 ? 16 : 8);
    for (const b of payload) pushBits(b, 8);

    const totalDataBits = dataCapacity * 8;
    const term = Math.min(4, totalDataBits - bits.length);
    pushBits(0, term);
    while (bits.length % 8 !== 0) bits.push(0);

    const padBytes = [0xec, 0x11];
    let pIdx = 0;
    while (bits.length < totalDataBits) {
      pushBits(padBytes[pIdx % 2], 8);
      pIdx++;
    }

    const dataBytes = new Uint8Array(dataCapacity);
    for (let i = 0; i < dataCapacity; i++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
      dataBytes[i] = v;
    }

    const blocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (let i = 0; i < g1c; i++) {
      const blk = dataBytes.slice(offset, offset + g1d);
      blocks.push(blk);
      ecBlocks.push(rsCompute(blk, ecPerBlock));
      offset += g1d;
    }
    for (let i = 0; i < g2c; i++) {
      const blk = dataBytes.slice(offset, offset + g2d);
      blocks.push(blk);
      ecBlocks.push(rsCompute(blk, ecPerBlock));
      offset += g2d;
    }

    const interleaved = [];
    const maxDataLen = Math.max(g1d, g2d);
    for (let i = 0; i < maxDataLen; i++) {
      for (const blk of blocks) {
        if (i < blk.length) interleaved.push(blk[i]);
      }
    }
    for (let i = 0; i < ecPerBlock; i++) {
      for (const ec of ecBlocks) interleaved.push(ec[i]);
    }

    return { ver, codewords: interleaved };
  }

  function buildMatrix(ver, codewords) {
    const size = ver * 4 + 17;
    const mat = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const func = Array.from({ length: size }, () => new Uint8Array(size));

    const setFunc = (r, c, val) => {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        mat[r][c] = val ? 1 : 0;
        func[r][c] = 1;
      }
    };

    const drawFinder = (r0, c0) => {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const rr = r0 + r;
          const cc = c0 + c;
          if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
          const isBorder = r === -1 || r === 7 || c === -1 || c === 7;
          const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setFunc(rr, cc, !isBorder && (isOuter || isInner));
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Alignment patterns
    const pos = ALIGNMENT_POS[ver];
    for (const r of pos) {
      for (const c of pos) {
        if (func[r][c]) continue;
        // Skip overlaps with 3 finders
        if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const dark = Math.max(Math.abs(dr), Math.abs(dc)) === 2 || (dr === 0 && dc === 0);
            setFunc(r + dr, c + dc, dark);
          }
        }
      }
    }

    // Timing patterns
    for (let i = 8; i < size - 8; i++) {
      if (!func[6][i]) setFunc(6, i, i % 2 === 0);
      if (!func[i][6]) setFunc(i, 6, i % 2 === 0);
    }

    // Dark module
    setFunc(size - 8, 8, 1);

    // Reserve format areas
    for (let i = 0; i <= 8; i++) {
      if (!func[8][i]) func[8][i] = 1;
      if (!func[i][8]) func[i][8] = 1;
    }
    for (let i = size - 8; i < size; i++) {
      if (!func[8][i]) func[8][i] = 1;
      if (!func[i][8]) func[i][8] = 1;
    }

    // Version info areas (>= 7)
    if (ver >= 7) {
      const vBits = VERSION_INFO[ver];
      for (let i = 0; i < 18; i++) {
        const bit = (vBits >> i) & 1;
        const r = Math.floor(i / 3);
        const c = size - 11 + (i % 3);
        setFunc(r, c, bit);
        setFunc(c, r, bit);
      }
    }

    // Place data bits zigzag
    const dataBits = [];
    for (const cw of codewords) {
      for (let b = 7; b >= 0; b--) dataBits.push((cw >> b) & 1);
    }

    let bitIdx = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--; // skip vertical timing
      for (let i = 0; i < size; i++) {
        const r = upward ? size - 1 - i : i;
        for (let dc = 0; dc < 2; dc++) {
          const c = col - dc;
          if (!func[r][c]) {
            mat[r][c] = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
          }
        }
      }
      upward = !upward;
    }

    const maskPredicates = [
      (r, c) => (r + c) % 2 === 0,
      (r, c) => r % 2 === 0,
      (r, c) => c % 3 === 0,
      (r, c) => (r + c) % 3 === 0,
      (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
      (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
      (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
      (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
    ];

    const applyMaskAndFormat = (maskId) => {
      const m = mat.map((row) => Int8Array.from(row));
      const pred = maskPredicates[maskId];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!func[r][c] && pred(r, c)) m[r][c] ^= 1;
        }
      }
      const fmt = FORMAT_M[maskId];
      // ISO 18004 standard bit 14..0:
      // Copy 1: (8,0)..(8,5)=14..9, (8,7)=8, (8,8)=7, (7,8)=6, (5,8)..(0,8)=5..0
      const c1 = [
        [8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],
        [7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]
      ];
      // Copy 2: (size-1,8)..(size-7,8)=14..8, (8,size-8)..(8,size-1)=7..0
      const c2 = [
        [size-1,8],[size-2,8],[size-3,8],[size-4,8],[size-5,8],[size-6,8],[size-7,8],
        [8,size-8],[8,size-7],[8,size-6],[8,size-5],[8,size-4],[8,size-3],[8,size-2],[8,size-1]
      ];
      for (let i = 0; i < 15; i++) {
        const bit = (fmt >> (14 - i)) & 1;
        m[c1[i][0]][c1[i][1]] = bit;
        m[c2[i][0]][c2[i][1]] = bit;
      }
      return m;
    };

    const scorePenalty = (m) => {
      let penalty = 0;
      for (let r = 0; r < size; r++) {
        let run = 1;
        for (let c = 1; c < size; c++) {
          if (m[r][c] === m[r][c - 1]) {
            run++;
            if (run === 5) penalty += 3;
            else if (run > 5) penalty++;
          } else run = 1;
        }
      }
      for (let c = 0; c < size; c++) {
        let run = 1;
        for (let r = 1; r < size; r++) {
          if (m[r][c] === m[r - 1][c]) {
            run++;
            if (run === 5) penalty += 3;
            else if (run > 5) penalty++;
          } else run = 1;
        }
      }
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const v = m[r][c];
          if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) penalty += 3;
        }
      }
      return penalty;
    };

    let bestMatrix = null;
    let bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const candidate = applyMaskAndFormat(mask);
      const s = scorePenalty(candidate);
      if (s < bestScore) {
        bestScore = s;
        bestMatrix = candidate;
      }
    }
    return bestMatrix;
  }

  function generateQrMatrix(text) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(String(text || ""));
    const { ver, codewords } = encodeData(bytes);
    return buildMatrix(ver, codewords);
  }

  function generateQrSvg(text, sizePx = 180, fg = "#1F1D1B", bg = "#FFFFFF") {
    const mat = generateQrMatrix(text);
    const n = mat.length;
    const quiet = 3;
    const total = n + quiet * 2;
    let rects = "";
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mat[r][c] === 1) {
          rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" fill="${fg}"/>`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" role="img" aria-label="QR Code"><rect width="${total}" height="${total}" fill="${bg}" rx="1.5"/>${rects}</svg>`;
  }

  root.KSnackQR = { generateQrMatrix, generateQrSvg };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.KSnackQR;
  }
})(typeof window !== "undefined" ? window : globalThis);
