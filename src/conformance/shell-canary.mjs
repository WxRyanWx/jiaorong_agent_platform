function quotePosix(value) {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildShellCanaryPrompt(platform, canaryPath) {
    const prefix = '中文 line\nquotes " and ';
    if (platform === 'win32') {
        const quotedPath = canaryPath.replaceAll('"', '""');
        return `${prefix}$(literal) \`literal\` & type nul > "${quotedPath}" &`;
    }
    const quotedPath = quotePosix(canaryPath);
    return `${prefix}$(touch ${quotedPath}) \`touch ${quotedPath}\``;
}
