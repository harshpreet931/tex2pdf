# tex2pdf-cli

Convert TeX files to PDF with zero setup.

## Usage

```bash
npx tex2pdf-cli document.tex
```

LaTeX is automatically installed on first use (~200MB download).

## Installation

```bash
npm install -g tex2pdf-cli
```

## Options

```bash
tex2pdf document.tex [output.pdf] [--engine=ENGINE]
```

| Option | Description |
|--------|-------------|
| `--engine=ENGINE` | LaTeX engine: `xelatex` (default), `pdflatex`, `lualatex` |
| `--install` | Force reinstall TinyTeX |
| `--help` | Show help |

## License

MIT
