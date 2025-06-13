#!/usr/bin/env node
import { Command } from "commander";
import { runStart } from "./commands/start";
import { runTest } from "./commands/test";
import { runHelp } from "./commands/help";
import { runSetup } from "./commands/setup";

const program = new Command();

program
  .name("vibe")
  .description("ViBe Project CLI")
  .version("1.0.0");

program
  .command("start")
  .description("Start frontend and backend")
  .action(runStart);

program
  .command("help")
  .description("help")
  .action(runHelp);

program
  .command("test")
  .description("Run backend tests and check for failures")
  .action(runTest);

program
  .command("setup")
  .description("Complete the setup of the project")
  .action(runSetup);

program.parse(process.argv)
