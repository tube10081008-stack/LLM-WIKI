import fs from 'node:fs/promises';
import path from 'node:path';
import pngToIco from 'png-to-ico';

async function buildIco() {
  try {
    const pngPath = path.resolve('public/icon-512.png');
    const icoPath = path.resolve('public/icon.ico');
    
    // Read the png buffer
    const buf = await fs.readFile(pngPath);
    
    // Convert to ico
    const icoBuf = await pngToIco(buf);
    
    // Write
    await fs.writeFile(icoPath, icoBuf);
    console.log('✅ Generated public/icon.ico');
  } catch (error) {
    console.error('Error:', error);
  }
}

buildIco();
