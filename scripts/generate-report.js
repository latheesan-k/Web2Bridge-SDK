const fs = require('fs');
const path = require('path');

function mergeCoverage() {
  const packages = ['core', 'react', 'auth-clerk'];
  const reportsDir = path.join(__dirname, '..', 'code-coverage-report');
  
  let merged = {
    total: {
      lines: { total: 0, covered: 0, skipped: 0, pct: 0 },
      statements: { total: 0, covered: 0, skipped: 0, pct: 0 },
      functions: { total: 0, covered: 0, skipped: 0, pct: 0 },
      branches: { total: 0, covered: 0, skipped: 0, pct: 0 },
      branchesTrue: { total: 0, covered: 0, skipped: 0, pct: 0 }
    },
    packages: {},
    data: {}
  };

  for (const pkg of packages) {
    const jsonPath = path.join(reportsDir, pkg + '-coverage.json');
    if (!fs.existsSync(jsonPath)) {
      console.log('Skipping ' + pkg + ' - no coverage JSON found');
      continue;
    }
    
    const coverage = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    console.log('Processing ' + pkg + ' coverage...');
    
    // Initialize package stats
    merged.packages[pkg] = {
      statements: { total: 0, covered: 0 },
      branches: { total: 0, covered: 0 },
      functions: { total: 0, covered: 0 },
      lines: { total: 0, covered: 0 }
    };
    
    for (const [filePath, data] of Object.entries(coverage)) {
      const newPath = pkg + '/' + filePath.replace(/^packages\/[^\/]+\/src\//, '');
      merged.data[newPath] = data;
      
      // Calculate file stats and add to package totals
      const fileStats = calculateFileStats(data);
      merged.packages[pkg].statements.total += fileStats.statements.total;
      merged.packages[pkg].statements.covered += fileStats.statements.covered;
      merged.packages[pkg].branches.total += fileStats.branches.total;
      merged.packages[pkg].branches.covered += fileStats.branches.covered;
      merged.packages[pkg].functions.total += fileStats.functions.total;
      merged.packages[pkg].functions.covered += fileStats.functions.covered;
      merged.packages[pkg].lines.total += fileStats.statements.total; // Lines = statements for v8
      merged.packages[pkg].lines.covered += fileStats.statements.covered;
    }
    
    // Calculate package percentages
    const pkgStats = merged.packages[pkg];
    pkgStats.statements.pct = pkgStats.statements.total > 0 
      ? (pkgStats.statements.covered / pkgStats.statements.total) * 100 
      : 0;
    pkgStats.branches.pct = pkgStats.branches.total > 0 
      ? (pkgStats.branches.covered / pkgStats.branches.total) * 100 
      : 0;
    pkgStats.functions.pct = pkgStats.functions.total > 0 
      ? (pkgStats.functions.covered / pkgStats.functions.total) * 100 
      : 0;
    pkgStats.lines.pct = pkgStats.lines.total > 0 
      ? (pkgStats.lines.covered / pkgStats.lines.total) * 100 
      : 0;
    
    // Add to global totals
    merged.total.statements.total += pkgStats.statements.total;
    merged.total.statements.covered += pkgStats.statements.covered;
    merged.total.branches.total += pkgStats.branches.total;
    merged.total.branches.covered += pkgStats.branches.covered;
    merged.total.functions.total += pkgStats.functions.total;
    merged.total.functions.covered += pkgStats.functions.covered;
    merged.total.lines.total += pkgStats.lines.total;
    merged.total.lines.covered += pkgStats.lines.covered;
  }

  // Calculate global percentages
  merged.total.statements.pct = merged.total.statements.total > 0 
    ? (merged.total.statements.covered / merged.total.statements.total) * 100 
    : 0;
  merged.total.branches.pct = merged.total.branches.total > 0 
    ? (merged.total.branches.covered / merged.total.branches.total) * 100 
    : 0;
  merged.total.functions.pct = merged.total.functions.total > 0 
    ? (merged.total.functions.covered / merged.total.functions.total) * 100 
    : 0;
  merged.total.lines.pct = merged.total.lines.total > 0 
    ? (merged.total.lines.covered / merged.total.lines.total) * 100 
    : 0;

  return merged;
}

function calculateFileStats(data) {
  let statements = { total: 0, covered: 0 };
  let branches = { total: 0, covered: 0 };
  let functions = { total: 0, covered: 0 };
  
  if (data.s) {
    for (const count of Object.values(data.s)) {
      statements.total++;
      if (count > 0) statements.covered++;
    }
  }
  if (data.f) {
    for (const count of Object.values(data.f)) {
      functions.total++;
      if (count > 0) functions.covered++;
    }
  }
  if (data.b) {
    for (const branchArray of Object.values(data.b)) {
      for (const count of branchArray) {
        branches.total++;
        if (count > 0) branches.covered++;
      }
    }
  }
  
  return { statements, branches, functions };
}

function getColor(pct) {
  if (pct >= 70) return 'good';
  if (pct >= 40) return 'medium';
  return 'low';
}

function formatCoveredCount(covered, total) {
  return covered + '/' + total;
}

function calculateFilePct(data) {
  const stats = calculateFileStats(data);
  return stats.statements.total > 0 
    ? (stats.statements.covered / stats.statements.total) * 100 
    : 0;
}

function generateFileList(data) {
  const files = Object.entries(data).map(([pathStr, fileData]) => {
    const stats = calculateFileStats(fileData);
    return {
      path: pathStr,
      pct: calculateFilePct(fileData),
      covered: stats.statements.covered,
      total: stats.statements.total
    };
  }).sort((a, b) => b.pct - a.pct);

  let rows = '';
  for (const f of files) {
    rows += '    <tr>\n      <td class="file-name">' + f.path + '</td>\n      <td class="file-pct ' + getColor(f.pct) + '" style="text-align:right">' + f.pct.toFixed(1) + '% <span style="color:#888;font-size:12px">(' + formatCoveredCount(f.covered, f.total) + ')</span></td>\n    </tr>\n';
  }

  return '<table>\n    <tr>\n      <th onclick="sortTable(0)" style="cursor:pointer">File</th>\n      <th onclick="sortTable(1)" style="cursor:pointer;text-align:right">Coverage</th>\n    </tr>\n' + rows + '  </table>';
}

function generatePackageCard(pkg, pkgStats) {
  return '      <div class="pkg-card" onclick="location.href=\'' + pkg + '-html/index.html\'">\n' +
         '        <a href="' + pkg + '-html/index.html">\n' +
         '          <div class="pkg-name">@web2bridge/' + pkg + '</div>\n' +
         '          <div class="pkg-stats">\n' +
         '            <span>Statements</span>\n' +
         '            <span class="file-pct ' + getColor(pkgStats.statements.pct) + '">' + pkgStats.statements.pct.toFixed(1) + '%</span>\n' +
         '          </div>\n' +
         '          <div class="pkg-details">\n' +
         '            <span>Branches: ' + pkgStats.branches.pct.toFixed(1) + '%</span> | ' +
         '            <span>Functions: ' + pkgStats.functions.pct.toFixed(1) + '%</span> | ' +
         '            <span>Lines: ' + pkgStats.lines.pct.toFixed(1) + '%</span>' +
         '          </div>\n' +
         '          <div class="pkg-link">View detailed report →</div>\n' +
         '        </a>\n' +
         '      </div>\n';
}

function generateUnifiedHTML(coverage) {
  const html = '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'  <meta charset="UTF-8">\n' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'  <title>Web2Bridge SDK - Unified Coverage Report</title>\n' +
'  <style>\n' +
'    * { box-sizing: border-box; margin: 0; padding: 0; }\n' +
'    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; }\n' +
'    .header { background: #1a1a2e; color: white; padding: 20px 30px; }\n' +
'    .header a { color: #60a5fa; text-decoration: none; }\n' +
'    .header a:hover { text-decoration: underline; }\n' +
'    .footer { text-align: center; padding: 20px; color: #888; font-size: 13px; }\n' +
'    .footer a { color: #3b82f6; text-decoration: none; }\n' +
'    .footer a:hover { text-decoration: underline; }\n' +
'    .header h1 { font-size: 24px; margin-bottom: 5px; }\n' +
'    .header p { color: #888; font-size: 14px; }\n' +
'    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }\n' +
'    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }\n' +
'    .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }\n' +
'    .card-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }\n' +
'    .card-value { font-size: 36px; font-weight: bold; margin: 10px 0; }\n' +
'    .card-value.good { color: #22c55e; }\n' +
'    .card-value.medium { color: #f59e0b; }\n' +
'    .card-value.low { color: #ef4444; }\n' +
'    .card-sub { font-size: 13px; color: #888; }\n' +
'    .packages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }\n' +
'    .pkg-card { background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }\n' +
'    .pkg-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }\n' +
'    .pkg-card a { text-decoration: none; color: inherit; display: block; }\n' +
'    .pkg-name { font-weight: 600; font-size: 16px; margin-bottom: 10px; color: #1a1a2e; }\n' +
'    .pkg-stats { display: flex; justify-content: space-between; font-size: 13px; }\n' +
'    .pkg-details { font-size: 11px; color: #666; margin-top: 5px; }\n' +
'    .pkg-link { font-size: 12px; color: #3b82f6; margin-top: 8px; }\n' +
'    .file-list { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }\n' +
'    .file-list h2 { font-size: 18px; margin-bottom: 15px; color: #1a1a2e; }\n' +
'    .file-item { display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee; }\n' +
'    .file-item:last-child { border-bottom: none; }\n' +
'    .file-name { font-family: monospace; font-size: 13px; color: #333; }\n' +
'    .file-pct { font-weight: 600; font-size: 14px; }\n' +
'    .file-pct.good { color: #22c55e; }\n' +
'    .file-pct.medium { color: #f59e0b; }\n' +
'    .file-pct.low { color: #ef4444; }\n' +
'    .footer { text-align: center; padding: 20px; color: #888; font-size: 13px; }\n' +
'    table { width: 100%; border-collapse: collapse; }\n' +
'    th { text-align: left; padding: 10px; border-bottom: 2px solid #eee; color: #666; font-size: 12px; text-transform: uppercase; }\n' +
'    td { padding: 10px; border-bottom: 1px solid #eee; }\n' +
'    tr:last-child td { border-bottom: none; }\n' +
'    tr:hover { background: #fafafa; }\n' +
'  </style>\n' +
'</head>\n' +
'<body>\n' +
'  <div class="header">\n' +
'    <h1><a href="https://github.com/latheesan-k/Web2Bridge-SDK" target="_blank">Web2Bridge SDK</a> - Coverage Report</h1>\n' +
'    <p>Generated: ' + new Date().toISOString() + '</p>\n' +
'  </div>\n' +
'  <div class="container">\n' +
'    <div class="summary">\n' +
'      <div class="card">\n' +
'        <div class="card-label">Statements</div>\n' +
'        <div class="card-value ' + getColor(coverage.total.statements.pct) + '">' + coverage.total.statements.pct.toFixed(1) + '%</div>\n' +
'        <div class="card-sub">' + formatCoveredCount(coverage.total.statements.covered, coverage.total.statements.total) + '</div>\n' +
'      </div>\n' +
'      <div class="card">\n' +
'        <div class="card-label">Branches</div>\n' +
'        <div class="card-value ' + getColor(coverage.total.branches.pct) + '">' + coverage.total.branches.pct.toFixed(1) + '%</div>\n' +
'        <div class="card-sub">' + formatCoveredCount(coverage.total.branches.covered, coverage.total.branches.total) + '</div>\n' +
'      </div>\n' +
'      <div class="card">\n' +
'        <div class="card-label">Functions</div>\n' +
'        <div class="card-value ' + getColor(coverage.total.functions.pct) + '">' + coverage.total.functions.pct.toFixed(1) + '%</div>\n' +
'        <div class="card-sub">' + formatCoveredCount(coverage.total.functions.covered, coverage.total.functions.total) + '</div>\n' +
'      </div>\n' +
'      <div class="card">\n' +
'        <div class="card-label">Lines</div>\n' +
'        <div class="card-value ' + getColor(coverage.total.lines.pct) + '">' + coverage.total.lines.pct.toFixed(1) + '%</div>\n' +
'        <div class="card-sub">' + formatCoveredCount(coverage.total.lines.covered, coverage.total.lines.total) + '</div>\n' +
'      </div>\n' +
'    </div>\n' +
'    \n' +
'    <div class="packages">\n' +
    generatePackageCard('core', coverage.packages.core || { statements: { pct: 0 }, branches: { pct: 0 }, functions: { pct: 0 }, lines: { pct: 0 } }) +
    generatePackageCard('react', coverage.packages.react || { statements: { pct: 0 }, branches: { pct: 0 }, functions: { pct: 0 }, lines: { pct: 0 } }) +
    generatePackageCard('auth-clerk', coverage.packages['auth-clerk'] || { statements: { pct: 0 }, branches: { pct: 0 }, functions: { pct: 0 }, lines: { pct: 0 } }) +
'    </div>\n' +

'    <div class="file-list">\n' +
'      <h2>File Coverage</h2>\n' +
      generateFileList(coverage.data) +
'\n' +
'    </div>\n' +
'  </div>\n' +
'  <div class="footer">\n' +
'    <a href="https://github.com/latheesan-k/Web2Bridge-SDK" target="_blank">Web2Bridge SDK</a> &copy; ' + new Date().getFullYear() + ' | Coverage Report | Developed by <a href="https://github.com/latheesan-k" target="_blank">Latheesan Kanesamoorthy</a>\n' +
'  </div>\n' +
'  <script>\n' +
'    function sortTable(n) {\n' +
'      const table = document.querySelector(".file-list table");\n' +
'      const rows = Array.from(table.querySelectorAll("tr"));\n' +
'      const dir = table.dataset.dir === "asc" ? "desc" : "asc";\n' +
'      table.dataset.dir = dir;\n' +
'      \n' +
'      rows.sort((a, b) => {\n' +
'        const aVal = a.children[n].textContent;\n' +
'        const bVal = b.children[n].textContent;\n' +
'        if (dir === "asc") return aVal.localeCompare(bVal, undefined, {numeric: true});\n' +
'        return bVal.localeCompare(aVal, undefined, {numeric: true});\n' +
'      });\n' +
'      \n' +
'      rows.forEach(row => table.appendChild(row));\n' +
'    }\n' +
'  </script>\n' +
'</body>\n' +
'</html>';

  return html;
}

// Main execution
console.log('Merging coverage reports...');
const merged = mergeCoverage();
console.log('Generating unified HTML report...');
const html = generateUnifiedHTML(merged);

const outputPath = path.join(__dirname, '..', 'code-coverage-report', 'index.html');
fs.writeFileSync(outputPath, html);
console.log('Report generated: ' + outputPath);
console.log('');
console.log('Coverage Summary:');
console.log('  Statements: ' + merged.total.statements.pct.toFixed(2) + '% (' + formatCoveredCount(merged.total.statements.covered, merged.total.statements.total) + ')');
console.log('  Branches:   ' + merged.total.branches.pct.toFixed(2) + '% (' + formatCoveredCount(merged.total.branches.covered, merged.total.branches.total) + ')');
console.log('  Functions:  ' + merged.total.functions.pct.toFixed(2) + '% (' + formatCoveredCount(merged.total.functions.covered, merged.total.functions.total) + ')');
console.log('  Lines:      ' + merged.total.lines.pct.toFixed(2) + '% (' + formatCoveredCount(merged.total.lines.covered, merged.total.lines.total) + ')');
