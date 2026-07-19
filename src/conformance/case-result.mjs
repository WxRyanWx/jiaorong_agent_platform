export function passed(id, extra = {}) {
    return { id, status: 'pass', ...extra };
}

export function failed(id, errors, extra = {}) {
    return { id, status: 'fail', errors, ...extra };
}

export function addValidationError(validation, error) {
    validation.errors.push(error);
    validation.valid = false;
}

export function caseFromValidation(id, processResult, validation) {
    if (validation.valid) {
        return passed(id, { durationMs: processResult.durationMs });
    }
    return failed(id, validation.errors, processResult);
}
