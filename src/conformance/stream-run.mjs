import { validateStream } from '../protocol/validate-fixture.mjs';
import { runProcess } from './run-process.mjs';

export async function validateStreamRun(binary, args, expectedExit, options) {
    const processResult = await runProcess(binary, args, options);
    const validation = processResult.timedOut
        ? {
              valid: false,
              errors: ['candidate exceeded the wall-clock timeout'],
          }
        : await validateStream(processResult.stdout, {
              exitCode: processResult.exitCode,
          });
    if (processResult.exitCode !== expectedExit) {
        validation.errors.push(
            `expected exit ${expectedExit}, got ${processResult.exitCode}`,
        );
        validation.valid = false;
    }
    return { processResult, validation };
}
