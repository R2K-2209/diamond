const fs = require('fs');
const path = require('path');

const replacements = {
  // Backgrounds
  'bg-[#0d1117]': 'bg-dash-bg',
  'bg-[#161b22]': 'bg-dash-card',
  'bg-[#111318]': 'bg-dash-sidebar',
  'bg-[#1a1d24]': 'bg-dash-card-hover',
  'bg-[#141822]': 'bg-dash-card-hover', // mapping to same hover for active state
  'bg-[#212532]': 'bg-dash-border-light', // mapping sidebar active to light border bg
  'bg-[#202532]': 'bg-dash-border-light',
  
  // Borders
  'border-[#1e222b]': 'border-dash-border',
  'border-[#2a2e37]': 'border-dash-border-light',
  
  // Text
  'text-white': 'text-dash-text',
  'text-[#8a91a0]': 'text-dash-text-muted',
  'text-[#5d6776]': 'text-dash-text-faded',
  
  // Hover Backgrounds
  'hover:bg-[#1a1d24]': 'hover:bg-dash-card-hover',
  'hover:bg-[#202532]': 'hover:bg-dash-border-light',
  'hover:bg-[#2a2e37]': 'hover:bg-dash-border-light',
  
  // Hover Borders
  'hover:border-[#2a2e37]': 'hover:border-dash-border-light',
  'hover:border-[#5d6776]': 'hover:border-dash-text-faded',
  
  // Hover Texts
  'hover:text-white': 'hover:text-dash-text',
  
  // Ring / Focus (AddChildModal)
  'placeholder-[#5d6776]': 'placeholder-dash-text-faded',
};

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  for (const [key, value] of Object.entries(replacements)) {
    content = content.split(key).join(value);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      processFile(fullPath);
    }
  }
}

walkDir(path.join(__dirname, 'src'));
