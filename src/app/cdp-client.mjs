import { AppReadinessError } from './readiness-error.mjs';

const MAX_CDP_MESSAGE_BYTES = 512_000;

export class CdpClient {
    #nextId = 1;
    #pending = new Map();
    #websocket;

    constructor(websocket, { timeoutMs = 3_000 } = {}) {
        this.#websocket = websocket;
        this.timeoutMs = timeoutMs;
        websocket.addEventListener('message', (event) => {
            const source = String(event.data);
            if (Buffer.byteLength(source, 'utf8') > MAX_CDP_MESSAGE_BYTES) {
                this.#failAll('The CDP renderer response exceeded its size limit.');
                websocket.close();
                return;
            }
            let message;
            try {
                message = JSON.parse(source);
            } catch {
                this.#failAll('The CDP renderer returned malformed JSON.');
                return;
            }
            const pending = this.#pending.get(message.id);
            if (!pending) return;
            this.#pending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.error) {
                pending.reject(
                    new AppReadinessError(
                        'bridge-contract',
                        'The CDP renderer rejected a bridge request.',
                    ),
                );
            } else {
                pending.resolve(message.result);
            }
        });
        websocket.addEventListener('close', () =>
            this.#failAll('The CDP renderer connection closed unexpectedly.'),
        );
        websocket.addEventListener('error', () =>
            this.#failAll('The CDP renderer connection failed.'),
        );
    }

    static async connect(url, options = {}) {
        const websocket = new WebSocket(url);
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                websocket.close();
                reject(
                    new AppReadinessError(
                        'renderer-target',
                        'The CDP renderer connection timed out.',
                    ),
                );
            }, options.timeoutMs ?? 3_000);
            websocket.addEventListener(
                'open',
                () => {
                    clearTimeout(timer);
                    resolve();
                },
                { once: true },
            );
            websocket.addEventListener(
                'error',
                () => {
                    clearTimeout(timer);
                    reject(
                        new AppReadinessError(
                            'renderer-target',
                            'The CDP renderer connection failed.',
                        ),
                    );
                },
                { once: true },
            );
        });
        return new CdpClient(websocket, options);
    }

    request(method, params = {}, { timeoutMs = this.timeoutMs } = {}) {
        let message;
        try {
            message = JSON.stringify({ id: this.#nextId, method, params });
        } catch {
            return Promise.reject(
                new AppReadinessError(
                    'bridge-contract',
                    'The CDP bridge request could not be encoded.',
                ),
            );
        }
        if (Buffer.byteLength(message, 'utf8') > MAX_CDP_MESSAGE_BYTES) {
            return Promise.reject(
                new AppReadinessError(
                    'bridge-contract',
                    'The CDP bridge request exceeded its size limit.',
                ),
            );
        }
        const id = this.#nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.#pending.delete(id);
                reject(
                    new AppReadinessError(
                        'bridge-contract',
                        'The CDP bridge request timed out.',
                    ),
                );
            }, timeoutMs);
            this.#pending.set(id, { resolve, reject, timer });
            this.#websocket.send(message);
        });
    }

    close() {
        this.#websocket.close();
    }

    #failAll(message) {
        for (const pending of this.#pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new AppReadinessError('bridge-contract', message));
        }
        this.#pending.clear();
    }
}
