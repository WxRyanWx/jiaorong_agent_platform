export class AppReadinessError extends Error {
    constructor(check, message) {
        super(message);
        this.name = 'AppReadinessError';
        this.check = check;
    }
}
