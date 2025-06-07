#!/usr/bin/env node

/**
 * Test the TRS-80GP mock server launcher fix
 */

const { Trs80MockServerLauncher } = require('./out/src/remotes/trs80/trs80mockserverlauncher');

async function testLauncherFix() {
    console.log('=== Testing TRS-80GP Mock Server Launcher Fix ===\n');

    const launcher = new Trs80MockServerLauncher(49152);
    
    try {
        console.log('Starting mock server...');
        await launcher.start();
        console.log('✅ SUCCESS: Mock server started successfully!');
        console.log(`Server is running on port: ${launcher.getPort()}`);
        console.log(`Server status: ${launcher.isRunning() ? 'Running' : 'Not running'}`);
        
        // Wait a moment then stop
        setTimeout(() => {
            console.log('Stopping mock server...');
            launcher.stop();
            console.log('✅ Mock server stopped successfully!');
        }, 2000);
        
    } catch (error) {
        console.error('❌ FAILED: Mock server failed to start');
        console.error('Error:', error.message);
        process.exit(1);
    }
}

testLauncherFix().catch(console.error);
