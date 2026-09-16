const fs = require('fs');
const { execSync } = require('child_process');

// Find all files in src, web/src containing 9router
const stdout = execSync('git grep -il "9router" src/ web/src/').toString();
const files = stdout.split('\n').filter(Boolean);

let count = 0;
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/9Router/g, 'Google API');
  content = content.replace(/9router/g, 'google-api');
  content = content.replace(/9ROUTER/g, 'GOOGLE API');
  fs.writeFileSync(file, content);
  count++;
  console.log(`Cleaned ${file}`);
}
console.log(`Total files cleaned: ${count}`);
