import fs from 'fs';
import path from 'path';

const source = path.resolve('public');
const output = path.resolve('dist');
if (!fs.existsSync(source)) throw new Error('A pasta public não foi encontrada.');
fs.rmSync(output, { recursive: true, force: true });
fs.cpSync(source, output, { recursive: true });
console.log('Site preparado com sucesso em dist/.');
