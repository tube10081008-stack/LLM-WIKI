import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SVG_PATH = path.resolve('public/icon.svg');
const PUBLIC_DIR = path.resolve('public');

const SIZES = [
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' }
];

async function generateIcons() {
  try {
    for (const { size, name } of SIZES) {
      const outputPath = path.resolve(PUBLIC_DIR, name);
      
      console.log(`Generating ${name} (${size}x${size})...`);
      
      await sharp(SVG_PATH)
        .resize(size, size)
        .png()
        .toFile(outputPath);
        
      console.log(`✅ successfully generated ${name}`);
    }
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
