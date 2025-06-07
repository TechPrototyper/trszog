#!/usr/bin/env node

// Test script to verify mock server path resolution
const path = require('path');
const fs = require('fs');

// Simulate extension path
const extensionPath = '/Users/timw/.vscode/extensions/techprototyper.dezog-3.6.3-dev-trs80';

// Test the path resolution logic
const extensionOutPath = path.join(extensionPath, 'out', 'src', 'remotes', 'trs80', 'mock-server');
const extensionSrcPath = path.join(extensionPath, 'src', 'remotes', 'trs80', 'mock-server');

console.log('Testing mock server path resolution:');
console.log('Extension path:', extensionPath);
console.log('Out path:', extensionOutPath);
console.log('Out path exists:', fs.existsSync(extensionOutPath));
console.log('Src path:', extensionSrcPath);
console.log('Src path exists:', fs.existsSync(extensionSrcPath));

if (fs.existsSync(extensionOutPath)) {
    console.log('✅ Would use out path');
} else if (fs.existsSync(extensionSrcPath)) {
    console.log('✅ Would use src path');
    
    // Check if the required files are there
    const packageJsonPath = path.join(extensionSrcPath, 'package.json');
    const serverJsPath = path.join(extensionSrcPath, 'dist', 'server.js');
    
    console.log('Package.json exists:', fs.existsSync(packageJsonPath));
    console.log('Server.js exists:', fs.existsSync(serverJsPath));
} else {
    console.log('❌ No valid path found');
}
