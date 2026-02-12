#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const latex = require('node-latex');
const { hasLaTeX, getEnginePath, findTinyTeX } = require('./find-latex');
const { fixTinyTeXSymlinks } = require('./install-latex');

const args = process.argv.slice(2);

function showHelp() {
  console.log(`
Usage: tex2pdf <input.tex> [output.pdf] [options]

Convert TeX files to PDF instantly with zero setup.
LaTeX is auto-installed on first use if not present.

Arguments:
  input.tex     Path to your TeX file
  output.pdf    Output PDF path (optional, defaults to input.pdf)

Options:
  --engine      LaTeX engine: pdflatex (default), xelatex, lualatex
  --install     Force re/install LaTeX (TinyTeX)
  --help        Show this help message

Examples:
  tex2pdf document.tex
  tex2pdf document.tex output.pdf
  tex2pdf document.tex --engine=xelatex
  npx tex2pdf-cli document.tex

First run may take a few minutes to download LaTeX (~200MB).
`);
}

async function runInstallScript() {
  console.log('LaTeX not found. Installing TinyTeX automatically...');
  console.log('  This is a one-time setup (~200MB download)');
  console.log('');
  
  return new Promise((resolve, reject) => {
    const installScript = path.join(__dirname, 'install-latex.js');
    const child = spawn('node', [installScript], {
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Installation failed'));
      }
    });
    
    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function ensureLaTeX() {
  if (hasLaTeX()) {
    fixTinyTeXSymlinks();
    return true;
  }

  try {
    await runInstallScript();
    fixTinyTeXSymlinks();
    return hasLaTeX();
  } catch (error) {
    console.error('\nFailed to install LaTeX automatically.');
    console.error('  You can install it manually from:');
    console.error('  - https://tug.org/texlive/ (TeX Live)');
    console.error('  - https://miktex.org/ (MiKTeX for Windows)');
    console.error('  - https://yihui.org/tinytex/ (TinyTeX)');
    return false;
  }
}

async function convertFile(inputPath, outputPath, engine) {
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  const enginePath = getEnginePath(engine);
  if (!enginePath) {
    console.error(`Error: LaTeX engine "${engine}" not found`);
    process.exit(1);
  }

  const input = fs.createReadStream(inputPath);
  const output = fs.createWriteStream(outputPath);

  console.log(`Converting ${path.basename(inputPath)}...`);

  const pdf = latex(input, { 
    cmd: enginePath,
    inputs: path.dirname(inputPath)
  });

  pdf.pipe(output);

  return new Promise((resolve, reject) => {
    pdf.on('error', (err) => {
      reject(err);
    });

    output.on('finish', () => {
      console.log(`Created: ${outputPath}`);
      resolve();
    });
  });
}

async function main() {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--install')) {
    console.log('Force installing LaTeX...');
    await runInstallScript();
    process.exit(0);
  }

  const latexReady = await ensureLaTeX();
  if (!latexReady) {
    process.exit(1);
  }

  const inputFile = args[0];
  let outputFile = null;
  let engine = 'xelatex';

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--engine=')) {
      engine = arg.split('=')[1];
    } else if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else if (!outputFile) {
      outputFile = arg;
    }
  }

  if (!outputFile) {
    const parsed = path.parse(inputFile);
    outputFile = path.join(parsed.dir, `${parsed.name}.pdf`);
  }

  try {
    await convertFile(inputFile, outputFile, engine);
  } catch (err) {
    if (engine === 'pdflatex' && err.message.includes('Font')) {
      console.log(`pdflatex failed (font issue), trying xelatex...`);
      try {
        await convertFile(inputFile, outputFile, 'xelatex');
        return;
      } catch (fallbackErr) {
        console.error(`\nConversion failed with both engines:`);
        console.error(fallbackErr.message);
        process.exit(1);
      }
    }
    console.error(`\nConversion failed:`);
    console.error(err.message);
    if (err.message.includes('Command failed')) {
      console.error('\nTip: Your TeX file may have errors or missing packages.');
      console.error('  Check the file compiles with a LaTeX editor first.');
    }
    process.exit(1);
  }
}

main();
