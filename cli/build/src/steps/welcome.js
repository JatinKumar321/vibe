#!/usr/bin/env node
import { select } from "@inquirer/prompts";
import fs from "fs";
import os from "os";
import path from "path";
import { findProjectRoot } from "../findRoot";
const projectRoot = findProjectRoot();
if (!projectRoot) {
    console.error("❌ Please run this command from within the vibe project directory.");
    process.exit(1);
}
// Path to .vibe.json state file
const statePath = path.resolve(projectRoot, ".vibe.json");
// Read existing state
function readState() {
    if (fs.existsSync(statePath)) {
        const raw = fs.readFileSync(statePath, "utf-8");
        return JSON.parse(raw);
    }
    return {};
}
// Write updated state
function writeState(state) {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}
// Load state
const state = readState();
// If step already completed, skip
if (state["Welcome"]) {
    console.log("✅ Welcome step already completed.");
    process.exit(0);
}
console.log("\n🚀 Welcome to the ViBe Setup!\n");
const platform = os.platform(); // 'win32', 'linux', 'darwin'
console.log(`🔍 Detected platform: ${platform}`);
// Prompt user to select environment
const environment = await select({
    message: "Choose environment:",
    choices: [
        { name: "Development", value: "Development" },
        { name: "Production", value: "Production" }
    ]
});
// Production path isn't implemented yet
if (environment === "Production") {
    console.error("❌ Production setup is not ready yet.");
    process.exit(1);
}
// Save environment choice to state
state["environment"] = environment;
state["Welcome"] = true;
writeState(state);
console.log(`✅ Environment set to: ${environment}`);
//# sourceMappingURL=welcome.js.map