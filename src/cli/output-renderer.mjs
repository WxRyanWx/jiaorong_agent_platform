function writeJsonLine(stdout, value) {
    stdout.write(`${JSON.stringify(value)}\n`);
}

function streamJsonRenderer(stdout) {
    let started = false;
    return {
        start(init) {
            writeJsonLine(stdout, init);
            started = true;
        },
        event(event) {
            writeJsonLine(stdout, event);
        },
        success({ result }) {
            writeJsonLine(stdout, result);
        },
        failure({ init, error, result }) {
            if (!started) writeJsonLine(stdout, init);
            writeJsonLine(stdout, error);
            writeJsonLine(stdout, result);
        },
    };
}

function jsonRenderer(stdout) {
    return {
        start() {},
        event() {},
        success({ json }) {
            writeJsonLine(stdout, json);
        },
        failure({ json }) {
            writeJsonLine(stdout, json);
        },
    };
}

function textRenderer(stdout, stderr) {
    return {
        start() {},
        event() {},
        success({ content }) {
            stdout.write(content);
        },
        failure({ humanError }) {
            stderr.write(`${humanError}\n`);
        },
    };
}

export function createOutputRenderer(format, { stdout, stderr }) {
    const renderers = {
        text: () => textRenderer(stdout, stderr),
        json: () => jsonRenderer(stdout),
        'stream-json': () => streamJsonRenderer(stdout),
    };
    return renderers[format]();
}
