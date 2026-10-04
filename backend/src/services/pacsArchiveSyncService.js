const { getOrthancConnection } = require('./orthancConnectionService');
const { enqueueReconciliation } = require('./pacsReconciliationQueue');

const pollOrthancChanges = async (db) => {
    const { url, username, password } = await getOrthancConnection();
    const headers = { Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') };
    const client = await db.connect();
    const read = async (path) => {
        const response = await fetch(url + path, { headers, signal: AbortSignal.timeout(8000) });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Archive synchronization failed (${response.status})`);
        return response.json();
    };
    try {
        await client.query('BEGIN');
        await client.query('INSERT INTO pacs_sync_cursors(source) VALUES ($1) ON CONFLICT DO NOTHING', [url]);
        const { rows } = await client.query('SELECT sequence FROM pacs_sync_cursors WHERE source = $1 FOR UPDATE SKIP LOCKED', [url]);
        if (!rows.length) { await client.query('COMMIT'); return; }
        const changes = await read(`/changes?since=${rows[0].sequence}&limit=10`);
        if (!changes) throw new Error('Orthanc changes feed is unavailable');
        if (!changes.Changes?.length && Number(rows[0].sequence) > 0) {
            // A recovered/replaced archive can restart its sequence. Do not leave
            // the old cursor permanently above every newly received instance.
            const latest = await read('/changes?last');
            if (latest && Number.isSafeInteger(latest.Last) && latest.Last < Number(rows[0].sequence)) {
                await client.query('UPDATE pacs_sync_cursors SET sequence = 0, updated_at = NOW() WHERE source = $1', [url]);
            }
        }
        for (const change of changes.Changes || []) {
            if (change.ChangeType === 'NewInstance') {
                const info = await read(`/instances/${encodeURIComponent(change.ID)}`);
                if (info) {
                    const tags = await read(`/instances/${encodeURIComponent(change.ID)}/tags?simplify`);
                    if (tags) await enqueueReconciliation(client, { ...tags, FileSize: info.FileSize, OrthancInstanceId: change.ID, OrthancStudyId: info.ParentStudy });
                }
            }
            await client.query('UPDATE pacs_sync_cursors SET sequence = $2, updated_at = NOW() WHERE source = $1', [url, change.Seq]);
        }
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally { client.release(); }
};

module.exports = { pollOrthancChanges };
