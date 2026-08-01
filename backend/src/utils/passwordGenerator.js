const crypto = require('crypto');

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const NUMBERS = '23456789';
const ALPHABET = `${UPPERCASE}${LOWERCASE}${NUMBERS}`;

const randomChar = (alphabet) => alphabet[crypto.randomInt(0, alphabet.length)];

/**
 * Generates a cryptographically secure, staff-readable portal password.
 * The grouped format avoids ambiguous characters and guarantees the same
 * complexity expected from manually entered doctor portal passwords.
 * @returns {string} 23-character secure password, grouped for handoff
 */
const generateSecurePassword = () => {
    const chars = [
        randomChar(UPPERCASE),
        randomChar(LOWERCASE),
        randomChar(NUMBERS),
        ...Array.from({ length: 15 }, () => randomChar(ALPHABET))
    ];

    for (let index = chars.length - 1; index > 0; index -= 1) {
        const swapIndex = crypto.randomInt(0, index + 1);
        [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
    }

    return chars.join('').match(/.{1,6}/g).join('-');
};

module.exports = {
    generateSecurePassword
};
