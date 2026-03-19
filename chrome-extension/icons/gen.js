// Generates minimal valid PNG icons for Chrome extension loading
// Run: node chrome-extension/icons/gen.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeB = Buffer.from(type);
  const lenB = Buffer.alloc(4);
  lenB.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeB, data]);
  const crcB = Buffer.alloc(4);
  crcB.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenB, typeB, data, crcB]);
}

function makePNG(size) {
  // Generate RGBA pixel data: green rounded-rect with "CS" text area
  const raw = [];
  const cx = size / 2, cy = size / 2;
  const r = size * 0.18; // corner radius

  for (let y = 0; y < size; y++) {
    raw.push(0); // PNG filter byte: None
    for (let x = 0; x < size; x++) {
      // Check if inside rounded rect
      const margin = 0;
      let inside = true;
      const lx = x - margin, ly = y - margin;
      const ex = size - margin - 1, ey = size - margin - 1;

      if (lx < r && ly < r) {
        inside = Math.hypot(lx - r, ly - r) <= r;
      } else if (lx > ex - r && ly < r) {
        inside = Math.hypot(lx - (ex - r), ly - r) <= r;
      } else if (lx < r && ly > ey - r) {
        inside = Math.hypot(lx - r, ly - (ey - r)) <= r;
      } else if (lx > ex - r && ly > ey - r) {
        inside = Math.hypot(lx - (ex - r), ly - (ey - r)) <= r;
      }

      if (inside) {
        // Gradient from #10b981 to #059669
        const t = (x + y) / (2 * size);
        const R = Math.round(16 + t * (5 - 16));
        const G = Math.round(185 + t * (150 - 185));
        const B = Math.round(129 + t * (105 - 129));
        raw.push(R, G, B, 255);
      } else {
        raw.push(0, 0, 0, 0);
      }
    }
  }

  // If size >= 32, draw a simple "CS" using pixel blocks
  if (size >= 32) {
    const s = Math.floor(size / 16); // pixel block size
    const ox = Math.floor(size * 0.2);
    const oy = Math.floor(size * 0.3);

    // Simple "C" shape (5 wide, 7 tall in blocks)
    const cShape = [
      [0,1,1,1,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
      [0,1,1,1,0],
    ];
    // Simple "S" shape
    const sShape = [
      [0,1,1,1,0],
      [1,0,0,0,0],
      [1,0,0,0,0],
      [0,1,1,1,0],
      [0,0,0,0,1],
      [0,0,0,0,1],
      [0,1,1,1,0],
    ];

    function drawChar(shape, startX, startY) {
      for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
          if (shape[row][col]) {
            for (let dy = 0; dy < s; dy++) {
              for (let dx = 0; dx < s; dx++) {
                const px = startX + col * s + dx;
                const py = startY + row * s + dy;
                if (px >= 0 && px < size && py >= 0 && py < size) {
                  const idx = py * (1 + size * 4) + 1 + px * 4;
                  raw[idx] = 255; // R
                  raw[idx + 1] = 255; // G
                  raw[idx + 2] = 255; // B
                  raw[idx + 3] = 255; // A
                }
              }
            }
          }
        }
      }
    }

    drawChar(cShape, ox, oy);
    drawChar(sShape, ox + 6 * s, oy);
  }

  const rawBuf = Buffer.from(raw);
  const compressed = zlib.deflateSync(rawBuf);

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', iend),
  ]);
}

[16, 48, 128].forEach(size => {
  const png = makePNG(size);
  const outPath = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Created icon${size}.png (${png.length} bytes)`);
});
