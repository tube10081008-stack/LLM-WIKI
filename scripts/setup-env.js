import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const envPath = path.resolve('.env.local');
let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

// 기본값 "" 이 아니라 실제 키가 들어있다면 통과
const match = envContent.match(/GEMINI_API_KEY="([^"]+)"/);
if (match && match[1].length > 10 && !match[1].includes('여기에')) {
  process.exit(0);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('=======================================================');
console.log(' ✨ [초기 설정] 로컬 독립 모드 활성화 필요 ✨ ');
console.log('=======================================================');
console.log('Vercel 클라우드 의존성을 끊고 완벽한 오프라인/로컬 구동을');
console.log('위해 Gemini API Key 최초 1회 인증이 필요합니다.');
console.log('-------------------------------------------------------\n');

rl.question('🔑 발급받으신 Gemini API Key를 마우스 우클릭으로 붙여넣고 Enter를 치세요: ', (key) => {
  const cleanKey = key.trim();
  if (!cleanKey) {
    console.log('\n❌ 키가 입력되지 않았습니다. 앱 구동을 취소합니다.');
    process.exit(1);
  }
  
  if (envContent.includes('GEMINI_API_KEY=')) {
    envContent = envContent.replace(/GEMINI_API_KEY="?.*"?/, `GEMINI_API_KEY="${cleanKey}"`);
  } else {
    envContent += `\nGEMINI_API_KEY="${cleanKey}"\n`;
  }
  
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('\n✅ 내 컴퓨터(.env.local)에 최고 보안으로 안전하게 저장되었습니다!');
  console.log('이제 클라우드 없이도 바탕화면에서 즉시 엔진이 돌아갑니다. 구동을 시작합니다...\n');
  process.exit(0);
});
