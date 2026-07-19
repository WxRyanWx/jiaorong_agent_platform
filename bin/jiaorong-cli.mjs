#!/usr/bin/env node
import { runMain } from '../src/cli/main.mjs';

process.exitCode = await runMain();
