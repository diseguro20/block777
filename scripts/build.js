import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🚀 Iniciando compilação do Blockerino Expo Web...');

try {
  // 1. Executa o export do Expo Web para a pasta 'dist' limpando o cache
  execSync('npx expo export -p web -c', { stdio: 'inherit' });

  const srcDir = path.resolve('dist');
  const destDir = path.resolve('public');

  console.log(`📋 Copiando arquivos de ${srcDir} para ${destDir}...`);

  // 2. Limpa a pasta public anterior
  if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
  }
  fs.mkdirSync(destDir, { recursive: true });

  // 3. Copia recursivamente os arquivos compilados
  const copyRecursive = (src, dest) => {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest);
      }
      fs.readdirSync(src).forEach((child) => {
        copyRecursive(path.join(src, child), path.join(dest, child));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  };

  copyRecursive(srcDir, destDir);
  console.log('✅ Compilação e sincronização concluídas com sucesso para o Vercel!');
} catch (error) {
  console.error('❌ Erro durante o processo de compilação:', error);
  process.exit(1);
}
