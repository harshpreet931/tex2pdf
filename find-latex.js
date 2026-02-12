const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const PLATFORM = os.platform();
const TINYTEX_DIR = path.join(__dirname, '.tinytex');

function findSystemLaTeX() {
  try {
    const pdflatexPath = execSync('which pdflatex || where pdflatex', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim();
    
    if (pdflatexPath) {
      return path.dirname(pdflatexPath);
    }
  } catch (e) {
    return null;
  }
}

function findTinyTeX() {
  let binPath;
  
  if (PLATFORM === 'win32') {
    binPath = path.join(TINYTEX_DIR, 'bin', 'windows');
  } else if (PLATFORM === 'darwin') {
    binPath = path.join(TINYTEX_DIR, 'bin', 'universal-darwin');
  } else {
    binPath = path.join(TINYTEX_DIR, 'bin', 'x86_64-linux');
  }
  
  const pdflatexPath = path.join(binPath, PLATFORM === 'win32' ? 'pdflatex.exe' : 'pdflatex');
  
  if (fs.existsSync(pdflatexPath)) {
    return binPath;
  }
  
  return null;
}

function getLaTeXPath() {
  const systemPath = findSystemLaTeX();
  if (systemPath) {
    return { path: systemPath, type: 'system' };
  }
  
  const tinytexPath = findTinyTeX();
  if (tinytexPath) {
    return { path: tinytexPath, type: 'tinytex' };
  }
  
  return null;
}

function hasLaTeX() {
  return getLaTeXPath() !== null;
}

function getEnginePath(engine = 'pdflatex') {
  const latexInfo = getLaTeXPath();
  
  if (!latexInfo) {
    return null;
  }
  
  const engineName = PLATFORM === 'win32' ? `${engine}.exe` : engine;
  return path.join(latexInfo.path, engineName);
}

module.exports = {
  getLaTeXPath,
  hasLaTeX,
  getEnginePath,
  findTinyTeX,
  TINYTEX_DIR
};
