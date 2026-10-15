const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i += 1) {
        crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const getDosDateTime = (date = new Date()) => {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosDate, dosTime };
};

const writeLocalHeader = ({ name, data, crc, dosDate, dosTime }) => {
    const nameBuffer = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(dosTime, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    return Buffer.concat([header, nameBuffer, data]);
};

const writeCentralHeader = ({ name, data, crc, dosDate, dosTime, offset }) => {
    const nameBuffer = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(dosTime, 12);
    header.writeUInt16LE(dosDate, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(data.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBuffer.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);
    return Buffer.concat([header, nameBuffer]);
};

const writeEndRecord = ({ centralSize, centralOffset, count }) => {
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(count, 8);
    end.writeUInt16LE(count, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(centralOffset, 16);
    end.writeUInt16LE(0, 20);
    return end;
};

const createStoredZip = (files = []) => {
    const dateParts = getDosDateTime();
    const entries = files.map((file) => ({
        name: String(file.name || 'file').replace(/\\/g, '/'),
        data: Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || ''),
        ...dateParts
    })).map((file) => ({ ...file, crc: crc32(file.data) }));

    let offset = 0;
    const localParts = [];
    const centralParts = [];
    entries.forEach((entry) => {
        const local = writeLocalHeader(entry);
        localParts.push(local);
        centralParts.push(writeCentralHeader({ ...entry, offset }));
        offset += local.length;
    });

    const centralOffset = offset;
    const centralDirectory = Buffer.concat(centralParts);
    return Buffer.concat([
        ...localParts,
        centralDirectory,
        writeEndRecord({
            centralSize: centralDirectory.length,
            centralOffset,
            count: entries.length
        })
    ]);
};

// Sequential lazy streams apply backpressure and let yazl handle ZIP64 safely.
const createStoredZipStream = async function* (files) {
    const { Readable } = require('stream');
    const zip = new (require('yazl').ZipFile)();
    const iterator = files[Symbol.asyncIterator] ? files[Symbol.asyncIterator]() : files[Symbol.iterator]();
    let closed = false;
    let source;
    const fail = error => zip.outputStream.destroy(error);
    zip.on('error', fail);
    const addNext = async () => {
        const entry = await iterator.next();
        if (closed) return;
        if (entry.done) { zip.end({ forceZip64Format: true }); return; }
        const file = entry.value;
        zip.addReadStreamLazy(String(file.name).replace(/\\/g, '/'), { compress: false }, callback => {
            source = Readable.from([Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || '')]);
            source.once('end', () => { addNext().catch(fail); });
            source.once('error', fail);
            callback(null, source);
        });
    };
    addNext().catch(fail);
    try { for await (const chunk of zip.outputStream) yield chunk; }
    finally {
        closed = true;
        source?.destroy();
        zip.outputStream.destroy();
        await iterator.return?.();
    }
};

module.exports = { createStoredZip, createStoredZipStream };
