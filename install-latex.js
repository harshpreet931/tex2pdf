#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const tar = require('tar');
const os = require('os');

const PLATFORM = os.platform();
const INSTALL_DIR = path.join(__dirname, '.tinytex');

function log(message) {
  console.log(`[tex2pdf-setup] ${message}`);
}

function checkExistingLaTeX() {
  try {
    execSync('pdflatex --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

function checkTinyTeXInstalled() {
  const tinytexBin = getTinyTeXBinPath();
  if (!tinytexBin) return false;
  const xelatexPath = path.join(tinytexBin, PLATFORM === 'win32' ? 'xelatex.exe' : 'xelatex');
  return fs.existsSync(xelatexPath);
}

function getTinyTeXBinPath() {
  if (PLATFORM === 'win32') {
    return path.join(INSTALL_DIR, 'bin', 'windows');
  } else if (PLATFORM === 'darwin') {
    return path.join(INSTALL_DIR, 'bin', 'universal-darwin');
  } else {
    return path.join(INSTALL_DIR, 'bin', 'x86_64-linux');
  }
}

function fixTinyTeXSymlinks() {
  const binPath = getTinyTeXBinPath();
  if (!fs.existsSync(binPath)) {
    return false;
  }

  let fixedCount = 0;

  const files = fs.readdirSync(binPath);
  for (const file of files) {
    const filePath = path.join(binPath, file);
    try {
      const stats = fs.lstatSync(filePath);
      if (stats.isSymbolicLink()) {
        try {
          fs.accessSync(filePath, fs.constants.F_OK);
        } catch (e) {
          fs.unlinkSync(filePath);
          fixedCount++;
        }
      }
    } catch (e) {
      try {
        fs.unlinkSync(filePath);
        fixedCount++;
      } catch (e2) {}
    }
  }

  if (fixedCount > 0) {
    log(`Fixed ${fixedCount} broken symlinks`);
  }

  const symlinks = [
    { from: 'pdftex', to: 'pdflatex' },
    { from: 'tex', to: 'latex' },
    { from: 'luatex', to: 'lualatex' },
    { from: 'xetex', to: 'xelatex' },
  ];

  for (const { from, to } of symlinks) {
    const fromPath = path.join(binPath, PLATFORM === 'win32' ? `${from}.exe` : from);
    const toPath = path.join(binPath, PLATFORM === 'win32' ? `${to}.exe` : to);

    if (fs.existsSync(fromPath) && !fs.existsSync(toPath)) {
      try {
        fs.symlinkSync(fromPath, toPath);
      } catch (e) {
        try {
          fs.copyFileSync(fromPath, toPath);
        } catch (e2) {}
      }
    }
  }

  return true;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    log(`Downloading TinyTeX (~200MB)...`);
    const file = fs.createWriteStream(dest);

    https.get(url, { redirect: 'follow' }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      let lastPercent = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
          const percent = Math.floor((downloadedSize / totalSize) * 100);
          if (percent > lastPercent && percent % 10 === 0) {
            log(`Download progress: ${percent}%`);
            lastPercent = percent;
          }
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlinkSync(dest);
        reject(err);
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function installTinyTeXUnix() {
  // Use full TinyTeX (not TinyTeX-1) which includes format files
  const url = PLATFORM === 'darwin'
    ? 'https://github.com/rstudio/tinytex-releases/releases/download/daily/TinyTeX.tgz'
    : 'https://github.com/rstudio/tinytex-releases/releases/download/daily/TinyTeX.tar.gz';
  const tarPath = path.join(__dirname, `tinytex-${Date.now()}.tar.gz`);

  try {
    await downloadFile(url, tarPath);

    log('Extracting TinyTeX...');
    if (!fs.existsSync(INSTALL_DIR)) {
      fs.mkdirSync(INSTALL_DIR, { recursive: true });
    }

    await tar.extract({
      file: tarPath,
      cwd: INSTALL_DIR,
      strip: 1
    });

    fs.unlinkSync(tarPath);
    fixTinyTeXSymlinks();

    return true;
  } catch (error) {
    log(`Error installing TinyTeX: ${error.message}`);
    if (fs.existsSync(tarPath)) {
      fs.unlinkSync(tarPath);
    }
    return false;
  }
}

async function installTinyTeXWindows() {
  const url = 'https://github.com/rstudio/tinytex-releases/releases/download/daily/TinyTeX.zip';
  const zipPath = path.join(__dirname, `tinytex-${Date.now()}.zip`);

  try {
    await downloadFile(url, zipPath);

    log('Extracting TinyTeX...');
    if (!fs.existsSync(INSTALL_DIR)) {
      fs.mkdirSync(INSTALL_DIR, { recursive: true });
    }

    const { execSync } = require('child_process');
    execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${INSTALL_DIR}' -Force"`, { stdio: 'ignore' });
    
    fs.unlinkSync(zipPath);
    fixTinyTeXSymlinks();

    return true;
  } catch (error) {
    log(`Error installing TinyTeX: ${error.message}`);
    log('Falling back to manual installation instructions:');
    log('  1. choco install tinytex');
    log('  2. scoop install tinytex');
    log('  3. Download from https://github.com/rstudio/tinytex-releases');
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    return false;
  }
}

async function installTinyTeX() {
  log('LaTeX not found. Installing TinyTeX (this may take a few minutes)...');

  if (PLATFORM === 'win32') {
    return await installTinyTeXWindows();
  } else {
    return await installTinyTeXUnix();
  }
}

async function main() {
  const isPostinstall = process.env.npm_lifecycle_event === 'postinstall';

  log('Checking for LaTeX installation...');

  if (checkExistingLaTeX()) {
    log('Found existing LaTeX installation. Skipping TinyTeX installation.');
    process.exit(0);
  }

  if (checkTinyTeXInstalled()) {
    fixTinyTeXSymlinks();
    log('TinyTeX is already installed and ready.');
    process.exit(0);
  }

  const success = await installTinyTeX();

  if (success) {
    log('TinyTeX installed successfully!');
    log(`Location: ${INSTALL_DIR}`);
    process.exit(0);
  } else {
    log('Failed to install TinyTeX automatically.');
    log('LaTeX will be installed on first use of tex2pdf command.');
    log('Or install manually from https://tug.org/texlive/ or https://miktex.org/');

    if (isPostinstall) {
      log('Note: This is non-fatal. npm install will continue.');
      process.exit(0);
    } else {
      process.exit(1);
    }
  }
}

module.exports = { fixTinyTeXSymlinks, getTinyTeXBinPath };

if (require.main === module) {
  main();
}
