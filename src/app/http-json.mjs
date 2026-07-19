import { get } from 'node:http';

import { AppReadinessError } from './readiness-error.mjs';

export function getBoundedJson(url, { maxBytes = 256_000, timeoutMs = 2_000 } = {}) {
    return new Promise((resolve, reject) => {
        const request = get(url, (response) => {
            const chunks = [];
            let size = 0;
            response.on('data', (chunk) => {
                size += chunk.length;
                if (size > maxBytes) {
                    request.destroy(
                        new AppReadinessError(
                            'cdp-metadata',
                            'The CDP metadata response exceeded its size limit.',
                        ),
                    );
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => {
                if (response.statusCode !== 200) {
                    reject(
                        new AppReadinessError(
                            'cdp-metadata',
                            'The CDP metadata endpoint returned an unexpected status.',
                        ),
                    );
                    return;
                }
                try {
                    resolve(
                        JSON.parse(Buffer.concat(chunks).toString('utf8')),
                    );
                } catch {
                    reject(
                        new AppReadinessError(
                            'cdp-metadata',
                            'The CDP metadata endpoint returned malformed JSON.',
                        ),
                    );
                }
            });
        });
        request.setTimeout(timeoutMs, () => {
            request.destroy(
                new AppReadinessError(
                    'cdp-metadata',
                    'The CDP metadata endpoint timed out.',
                ),
            );
        });
        request.on('error', (error) => {
            reject(
                error instanceof AppReadinessError
                    ? error
                    : new AppReadinessError(
                          'cdp-metadata',
                          'The CDP metadata endpoint is unavailable.',
                      ),
            );
        });
    });
}
