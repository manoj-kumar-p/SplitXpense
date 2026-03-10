const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const RES_DIR = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

const SIZES = {
  'mipmap-mdpi':    48,
  'mipmap-hdpi':    72,
  'mipmap-xhdpi':   96,
  'mipmap-xxhdpi':  144,
  'mipmap-xxxhdpi': 192,
};

/**
 * SplitEasy icon — Split circle with a straight $ sign.
 * The split gap doubles as the vertical stroke of the $.
 * The S curves sit visibly on the white circle halves.
 */
const makeSvg = (size) => {
  const s = size;
  const rr = s * 0.21;
  const r = s * 0.22;
  const cx = s * 0.5;
  const cy = s * 0.5;
  const gap = s * 0.016;
  const off = s * 0.012;
  const fontSize = s * 0.34;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${rr}" fill="#0A0A0A"/>
  <!-- Left half -->
  <path d="M ${(cx - gap).toFixed(1)} ${(cy - r - off).toFixed(1)}
           A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 0 ${(cx - gap).toFixed(1)} ${(cy + r - off).toFixed(1)}
           Z" fill="#E8E8E8"/>
  <!-- Right half -->
  <path d="M ${(cx + gap).toFixed(1)} ${(cy - r + off).toFixed(1)}
           A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(cx + gap).toFixed(1)} ${(cy + r + off).toFixed(1)}
           Z" fill="#E8E8E8"/>
  <!-- $ sign (straight — vertical stroke aligns with split gap) -->
  <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif" font-weight="normal" font-size="${fontSize.toFixed(1)}" fill="#0A0A0A">$</text>
</svg>`;
};

const makeRoundSvg = (size) => {
  const s = size;
  const r = s * 0.22;
  const cx = s * 0.5;
  const cy = s * 0.5;
  const gap = s * 0.016;
  const off = s * 0.012;
  const fontSize = s * 0.34;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs><clipPath id="c"><circle cx="${s/2}" cy="${s/2}" r="${s/2}"/></clipPath></defs>
  <g clip-path="url(#c)">
    <rect width="${s}" height="${s}" fill="#0A0A0A"/>
    <path d="M ${(cx - gap).toFixed(1)} ${(cy - r - off).toFixed(1)}
             A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 0 ${(cx - gap).toFixed(1)} ${(cy + r - off).toFixed(1)}
             Z" fill="#E8E8E8"/>
    <path d="M ${(cx + gap).toFixed(1)} ${(cy - r + off).toFixed(1)}
             A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(cx + gap).toFixed(1)} ${(cy + r + off).toFixed(1)}
             Z" fill="#E8E8E8"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="Georgia, 'Times New Roman', serif" font-weight="normal" font-size="${fontSize.toFixed(1)}" fill="#0A0A0A">$</text>
  </g>
</svg>`;
};

async function generate() {
  for (const [folder, size] of Object.entries(SIZES)) {
    const dir = path.join(RES_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(Buffer.from(makeSvg(size))).png().toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(Buffer.from(makeRoundSvg(size))).png().toFile(path.join(dir, 'ic_launcher_round.png'));
    console.log(`${folder}: ${size}x${size} -> done`);
  }

  const storeDir = path.join(__dirname, '..', 'src', 'assets');
  fs.mkdirSync(storeDir, { recursive: true });
  await sharp(Buffer.from(makeSvg(512))).png().toFile(path.join(storeDir, 'icon-512.png'));
  console.log('Play Store icon: 512x512 -> done');
}

generate().then(() => console.log('\nAll icons generated!')).catch(console.error);
