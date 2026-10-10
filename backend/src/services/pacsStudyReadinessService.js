const { AppError } = require('../middleware/errorHandler');

const assertPacsStudyAvailable = async (client, exam) => {
    const studyInstanceUid = exam?.study_instance_uid;
    const hasExamImageMetadata = exam?.images_available === true
        && Number(exam.image_count || 0) > 0;

    if (!studyInstanceUid || !hasExamImageMetadata) {
        throw new AppError(
            'The PACS study must be received and available before completing this examination.',
            409,
            true,
            'PACS_STUDY_NOT_READY'
        );
    }

    const result = await client.query(`
        SELECT COUNT(DISTINCT pi.sop_instance_uid)::int AS image_count
        FROM pacs_series ps
        JOIN pacs_instances pi ON pi.series_instance_uid = ps.series_instance_uid
        WHERE ps.study_instance_uid = $1
    `, [studyInstanceUid]);

    if (Number(result.rows[0]?.image_count || 0) < 1) {
        throw new AppError(
            'No PACS images are linked to this examination.',
            409,
            true,
            'PACS_STUDY_NOT_READY'
        );
    }
};

const assertReportReadyForFinalization = async (client, exam) => {
    if (exam?.status !== 'Reporting'
        || exam?.queue_stage !== 'Reporting'
        || !exam?.exam_completed_at
        || !exam?.images_ready_at
        || exam?.is_on_hold) {
        throw new AppError(
            'The examination must be completed, images ready, in Reporting, and not on safety hold before report finalization.',
            409,
            true,
            'REPORT_NOT_READY'
        );
    }

    await assertPacsStudyAvailable(client, exam);
};

module.exports = {
    assertPacsStudyAvailable,
    assertReportReadyForFinalization
};
