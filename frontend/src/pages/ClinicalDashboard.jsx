/**
 * ClinicalDashboard.jsx — Legacy page (deprecated)
 *
 * This standalone page has been superseded by the full-featured Worklist
 * (/worklist) which provides:
 *  - Multi-role queue management (Radiologist, Technician, Nurse)
 *  - Rich report editor with AI assistance
 *  - DICOM viewer integration
 *  - Safety screening, hold management, and priority triage
 *
 * Any direct link to /clinical-dashboard will automatically redirect to /worklist.
 * The component is kept to avoid 404s from bookmarked URLs.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const ClinicalDashboard = () => {
    const navigate = useNavigate();

    useEffect(() => {
        // Replace so the back-button doesn't loop back here
        navigate('/worklist', { replace: true });
    }, [navigate]);

    return null;
};

export default ClinicalDashboard;
