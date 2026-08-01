export const formatLiveCount = (value, isRtl) => (
    new Intl.NumberFormat(isRtl ? 'ar-EG' : 'en-US').format(value)
);

export const getServiceLiveStatus = ({ serviceKey, operationalData, generatedAt, isRtl, isLoading, isError }) => {
    if (isLoading) return isRtl ? 'جاري تحميل البيانات المباشرة' : 'Loading live data';

    const definitions = {
        reception: {
            value: operationalData?.waitingToday,
            en: (value) => `${formatLiveCount(value, false)} waiting today`,
            ar: (value) => `${formatLiveCount(value, true)} في الانتظار اليوم`,
        },
        pacs: {
            value: operationalData?.activeModalities,
            en: (value) => `${formatLiveCount(value, false)} active modalities`,
            ar: (value) => `${formatLiveCount(value, true)} أجهزة نشطة`,
        },
        reporting: {
            value: operationalData?.pendingReports,
            en: (value) => `${formatLiveCount(value, false)} reports pending`,
            ar: (value) => `${formatLiveCount(value, true)} تقارير معلقة`,
        },
        billing: {
            value: operationalData?.openClaims,
            en: (value) => `${formatLiveCount(value, false)} open claims`,
            ar: (value) => `${formatLiveCount(value, true)} مطالبات مفتوحة`,
        },
        analytics: {
            value: operationalData?.studiesThisWeek,
            en: (value) => `${formatLiveCount(value, false)} studies this week`,
            ar: (value) => `${formatLiveCount(value, true)} فحوصات هذا الأسبوع`,
        },
        settings: {
            value: generatedAt ? 1 : null,
            en: () => 'Backend snapshot current',
            ar: () => 'لقطة النظام محدثة',
        },
        patient_portal: {
            value: operationalData?.deliveredToday,
            en: (value) => `${formatLiveCount(value, false)} results delivered today`,
            ar: (value) => `${formatLiveCount(value, true)} نتائج سُلّمت اليوم`,
        },
    };

    const definition = definitions[serviceKey];
    if (isError || definition?.value === null || definition?.value === undefined) {
        return isRtl ? 'البيانات غير متاحة' : 'Data unavailable';
    }
    return (isRtl ? definition.ar : definition.en)(definition.value);
};

export const formatDataFreshness = (generatedAt, isRtl) => {
    if (!generatedAt) return isRtl ? 'في انتظار التحديث' : 'Awaiting refresh';
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(generatedAt).getTime()) / 1000));
    if (elapsedSeconds < 15) return isRtl ? 'تم التحديث الآن' : 'Updated just now';
    if (elapsedSeconds < 60) return isRtl ? `منذ ${elapsedSeconds} ثانية` : `Updated ${elapsedSeconds}s ago`;
    const minutes = Math.floor(elapsedSeconds / 60);
    return isRtl ? `منذ ${minutes} دقيقة` : `Updated ${minutes}m ago`;
};
