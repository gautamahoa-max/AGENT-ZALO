const fs = require('fs');
const { execSync } = require('child_process');

const stdout = execSync('git grep -il "9router" docs/ plans/').toString();
const files = stdout.split('\n').filter(Boolean);

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/9Router/g, 'Google API');
  content = content.replace(/9router/g, 'google-api');
  content = content.replace(/9ROUTER/g, 'GOOGLE API');
  fs.writeFileSync(file, content);
  console.log(`Cleaned ${file}`);
}
