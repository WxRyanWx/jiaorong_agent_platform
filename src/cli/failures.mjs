export class CliFailure extends Error {
    constructor(code, message, exitCode, { protocolEligible = false } = {}) {
        super(message);
        this.name = 'CliFailure';
        this.code = code;
        this.exitCode = exitCode;
        this.protocolEligible = protocolEligible;
    }
}

export class BackendFailure extends CliFailure {
    constructor(code, message, exitCode = 1) {
        super(code, message, exitCode);
        this.name = 'BackendFailure';
    }
}
