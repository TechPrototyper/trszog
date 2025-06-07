#!/usr/bin/env node

/**
 * Test script to enable transport logging and test TRS-80GP debugging session.
 * This will help us see the communication between DeZog and the mock server.
 */

const fs = require('fs');
const path = require('path');

async function main() {
    console.log('🚀 Testing TRS-80GP debugging with transport logging enabled...\n');
    
    // Verify settings.json exists
    const settingsPath = path.join(__dirname, '.vscode', 'settings.json');
    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        console.log('✅ VS Code settings configured:');
        console.log(`   - dezog.log.transport: ${settings['dezog.log.transport']}`);
        console.log(`   - dezog.log.global: ${settings['dezog.log.global']}`);
    } else {
        console.log('❌ Settings file not found');
        return;
    }
    
    // Check if mock server files exist
    const mockServerPath = path.join(__dirname, 'src', 'remotes', 'trs80', 'mock-server');
    if (fs.existsSync(mockServerPath)) {
        console.log('✅ Mock server files found at:', mockServerPath);
        const files = fs.readdirSync(mockServerPath);
        console.log('   Files:', files.join(', '));
    } else {
        console.log('❌ Mock server files not found');
        return;
    }
    
    // Check if extension is installed
    const vsixPath = path.join(__dirname, 'dezog-3.6.3-dev-trs80-final.vsix');
    if (fs.existsSync(vsixPath)) {
        console.log('✅ Final VSIX package found');
    } else {
        console.log('❌ Final VSIX package not found');
        return;
    }
    
    console.log('\n📋 Instructions for transport logging test:');
    console.log('1. Make sure VS Code is open in this workspace');
    console.log('2. Ensure the fixed DeZog extension is installed');
    console.log('3. Open the launch.json and set a TRS-80GP configuration');
    console.log('4. Start debugging session');
    console.log('5. Check the OUTPUT panel for:');
    console.log('   - "DeZog Transport" - shows DZRP protocol communication');
    console.log('   - "DeZog" - shows general debugging information');
    console.log('');
    console.log('Look for messages like:');
    console.log('   => CMD_INIT');
    console.log('   <= INIT response');
    console.log('   => CMD_GET_REGISTERS');
    console.log('   <= REGISTERS response');
    console.log('');
    console.log('If you see these messages, the protocol is working.');
    console.log('If not, there may be a communication issue.');
    
    // Create a sample launch.json configuration for TRS-80GP
    const launchJsonPath = path.join(__dirname, '.vscode', 'launch.json');
    if (fs.existsSync(launchJsonPath)) {
        console.log('\n✅ Launch.json exists');
        try {
            const launchJson = JSON.parse(fs.readFileSync(launchJsonPath, 'utf8'));
            const trs80Config = launchJson.configurations.find(config => 
                config.remoteType === 'trs80gp'
            );
            if (trs80Config) {
                console.log('✅ TRS-80GP configuration found in launch.json');
            } else {
                console.log('⚠️  No TRS-80GP configuration found in launch.json');
                console.log('   Add a configuration like:');
                console.log(`   {
       "type": "dezog",
       "request": "launch", 
       "name": "TRS-80GP Debug",
       "remoteType": "trs80gp",
       "trs80gp": {
           "port": 12345
       },
       "startAutomatically": false
   }`);
            }
        } catch (e) {
            console.log('❌ Error reading launch.json:', e.message);
        }
    }
    
    console.log('\n🔍 Next steps:');
    console.log('1. Start a debugging session with the TRS-80GP configuration');
    console.log('2. Watch the OUTPUT panel "DeZog Transport" channel');
    console.log('3. Look for DZRP protocol messages');
    console.log('4. If no messages appear, the mock server may not be responding');
    console.log('5. If messages appear but debugging doesn\'t work, check the protocol implementation');
}

main().catch(console.error);
