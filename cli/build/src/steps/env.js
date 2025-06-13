#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { findProjectRoot } from "../findRoot";
import password from '@inquirer/password';
const rootDir = findProjectRoot();
if (!rootDir) {
    console.error("❌ Please run this command from within the vibe project directory.");
    process.exit(1);
}
const backendDir = path.join(rootDir, "backend");
const statePath = path.join(rootDir, ".vibe.json");
const envPath = path.join(backendDir, ".env");
// Constants
const STEP_NAME = "Env Variables";
async function getMongoUri() {
    const userPassword = await password({
        message: 'Enter your MongoDB password:',
        mask: '*',
    });
    const encodedPassword = encodeURIComponent(userPassword);
    const uriTemplate = 'mongodb+srv://Vibe:<db_password>@vibe-test.jt5wz7s.mongodb.net/?retryWrites=true&w=majority&appName=vibe-test';
    const finalUri = uriTemplate.replace('<db_password>', encodedPassword);
    console.log('\nYour MongoDB URI:');
    console.log(finalUri);
    return finalUri;
}
// Read state
function readState() {
    if (fs.existsSync(statePath)) {
        return JSON.parse(fs.readFileSync(statePath, "utf8"));
    }
    return {};
}
// Write state
function writeState(state) {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}
// Validate MongoDB URI
function isValidMongoUri(uri) {
    return uri.startsWith("mongodb://") || uri.startsWith("mongodb+srv://");
}
const state = readState();
if (state[STEP_NAME]) {
    console.log("✅ Environment variables already set. Skipping.");
    process.exit(0);
}
console.log(`
📄 Creating .env file for MongoDB
`);
const mongoUri = await getMongoUri();
// Write to .env file
fs.writeFileSync(envPath, `DB_URL="${mongoUri}"\nFIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099\nFIREBASE_EMULATOR_HOST=127.0.0.1:4000\nGCLOUD_PROJECT=demo-test`);
console.log(`✅ Wrote MongoDB URI to ${envPath}`);
// Save step complete
state[STEP_NAME] = true;
writeState(state);
//# sourceMappingURL=env.js.map