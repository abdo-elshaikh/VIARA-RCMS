import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, ArrowRight, RefreshCw, Search, Share2, X } from 'lucide-react';
import secureDelivery3d from '../../../assets/secure-delivery-3d-transparent.png';
import { formatDataFreshness, getServiceLiveStatus } from '../liveData';

export const ServicesPane = ({
    isRtl,
    activeZone,
    selectedCategory,
    setSelectedCategory,
    setInspectService,
    zoneRef,
    SERVICE_CATEGORIES,
    ALL_SERVICES,
    PATIENT_PORTAL_SERVICE,
    operationalData,
    generatedAt,
    isLoading,
    isFetching,
    isError,
    onRefresh,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [clockTick, setClockTick] = useState(0);
    const Arrow = isRtl ? ArrowLeft : ArrowRight;

    useEffect(() => {
        const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 30000);
        return () => window.clearInterval(timer);
    }, []);

    const liveStatus = (serviceKey) => getServiceLiveStatus({
        serviceKey, operationalData, generatedAt, isRtl, isLoading, isError,
    });
    void clockTick;
    const freshnessText = formatDataFreshness(generatedAt, isRtl);

    const filteredServices = useMemo(() => {
        const query = searchQuery.trim().toLocaleLowerCase();
        return ALL_SERVICES.filter((service) => {
            const matchesCategory = selectedCategory === 'live' || service.category === selectedCategory;
            const title = (isRtl ? service.arTitle : service.enTitle).toLocaleLowerCase();
            const description = (isRtl ? service.arDescription : service.enDescription).toLocaleLowerCase();
            return matchesCategory && (!query || title.includes(query) || description.includes(query));
        });
    }, [ALL_SERVICES, isRtl, searchQuery, selectedCategory]);
    const resultLabel = isRtl
        ? `${filteredServices.length} خدمات`
        : `${filteredServices.length} ${filteredServices.length === 1 ? 'service' : 'services'}`;

    const connectionText = isLoading
        ? (isRtl ? 'جاري الاتصال' : 'Connecting')
        : isError
            ? (isRtl ? 'البيانات غير متاحة' : 'Data unavailable')
            : (isRtl ? 'بيانات مباشرة' : 'Live data');

    return (
        <section
            id="modules"
            ref={zoneRef}
            tabIndex={-1}
            className={`command-services ${activeZone === 'modules' ? 'is-focused' : ''}`}
            aria-labelledby="command-services-title"
            aria-busy={isLoading || isFetching}
        >
            <header className="command-services__header">
                <div className="command-services__headline">
                    <div className="command-services__heading">
                        <h2 id="command-services-title">
                            {isRtl ? 'مركز قيادة الخدمات' : 'Service command center'}
                        </h2>
                        <p>{isRtl ? 'الوصول إلى مساحات العمل ومتابعة مؤشرات التشغيل.' : 'Open workspaces and monitor current operations.'}</p>
                    </div>

                    <div className="command-services__data-tools">
                        <div className={`command-services__health ${isError ? 'is-unavailable' : ''}`} role="status">
                            <span><Activity aria-hidden="true" /></span>
                            <span>
                                <strong>{connectionText}</strong>
                                <time dateTime={generatedAt || undefined}>{freshnessText}</time>
                            </span>
                        </div>
                        <button
                            type="button"
                            className="command-monitor-button"
                            onClick={onRefresh}
                            disabled={isFetching}
                            aria-label={isRtl ? 'تحديث البيانات المباشرة' : 'Refresh live data'}
                        >
                            <RefreshCw className={isFetching ? 'is-spinning' : ''} aria-hidden="true" />
                            <span>{isFetching ? (isRtl ? 'يتم التحديث' : 'Refreshing') : (isRtl ? 'تحديث' : 'Refresh')}</span>
                        </button>
                    </div>
                </div>

                <div className="command-service-controls">
                    <div className="command-category-list" role="group" aria-label={isRtl ? 'تصنيف الخدمات' : 'Service category'}>
                        {SERVICE_CATEGORIES.map((category) => {
                            const active = selectedCategory === category.id;
                            return (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => setSelectedCategory(category.id)}
                                    className={active ? 'is-active' : ''}
                                    aria-pressed={active}
                                >
                                    {category.hasDot && <i aria-hidden="true" />}
                                    {isRtl ? category.arLabel : category.enLabel}
                                </button>
                            );
                        })}
                    </div>

                    <div className="command-search-group">
                        <span className="command-result-count" aria-live="polite">
                            {resultLabel}
                        </span>
                        <div className="command-search">
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape') setSearchQuery('');
                                }}
                                placeholder={isRtl ? 'بحث في الخدمات...' : 'Search services...'}
                                aria-label={isRtl ? 'ابحث في الخدمات' : 'Search services'}
                            />
                            <Search className="command-search__icon" aria-hidden="true" />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className="command-search__clear"
                                    onClick={() => setSearchQuery('')}
                                    aria-label={isRtl ? 'مسح البحث' : 'Clear search'}
                                >
                                    <X aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {filteredServices.length > 0 ? (
                <div className="command-service-grid">
                    {filteredServices.map((service, index) => {
                        const Icon = service.icon;
                        return (
                            <button
                                key={service.key}
                                type="button"
                                onClick={() => setInspectService(service)}
                                className="command-service-card"
                                data-tone={service.badgeTone}
                                style={{ '--service-delay': `${index * 45}ms` }}
                                aria-haspopup="dialog"
                                aria-label={`${isRtl ? service.arTitle : service.enTitle} — ${liveStatus(service.key)}`}
                            >
                                <span className="command-service-card__topline">
                                    <span className="command-service-icon"><Icon aria-hidden="true" /></span>
                                    <span className="command-service-card__arrow"><Arrow aria-hidden="true" /></span>
                                </span>
                                <span className="command-service-card__body">
                                    <strong>{isRtl ? service.arTitle : service.enTitle}</strong>
                                    <span className="command-service-description">
                                        {isRtl ? service.arDescription : service.enDescription}
                                    </span>
                                </span>
                                <span className={`command-service-live ${isError ? 'is-unavailable' : ''}`}>
                                    <i aria-hidden="true" />{liveStatus(service.key)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="command-services-empty" role="status">
                    <Search aria-hidden="true" />
                    <strong>{isRtl ? 'لا توجد خدمات مطابقة' : 'No matching services'}</strong>
                    <span>{isRtl ? 'جرّب عبارة بحث أو تصنيفًا آخر.' : 'Try another search term or category.'}</span>
                    <button
                        type="button"
                        className="command-empty-reset"
                        onClick={() => {
                            setSearchQuery('');
                            setSelectedCategory('live');
                        }}
                    >
                        {isRtl ? 'عرض جميع الخدمات' : 'Show all services'}
                    </button>
                </div>
            )}

            <button
                type="button"
                onClick={() => setInspectService(PATIENT_PORTAL_SERVICE)}
                className="command-delivery-card"
                aria-haspopup="dialog"
                aria-label={`${isRtl ? PATIENT_PORTAL_SERVICE.arTitle : PATIENT_PORTAL_SERVICE.enTitle} — ${liveStatus(PATIENT_PORTAL_SERVICE.key)}`}
            >
                <div className="command-delivery-card__content">
                    <span className="command-delivery-card__icon"><Share2 aria-hidden="true" /></span>
                    <div>
                        <span className="command-delivery-card__titleline">
                            <strong>{isRtl ? PATIENT_PORTAL_SERVICE.arTitle : PATIENT_PORTAL_SERVICE.enTitle}</strong>
                        </span>
                        <span className="command-service-description">{isRtl ? PATIENT_PORTAL_SERVICE.arDescription : PATIENT_PORTAL_SERVICE.enDescription}</span>
                        <span className={`command-service-live ${isError ? 'is-unavailable' : ''}`}>
                            <i aria-hidden="true" />{liveStatus(PATIENT_PORTAL_SERVICE.key)}
                        </span>
                    </div>
                    <span className="command-delivery-card__action" aria-hidden="true"><Arrow /></span>
                </div>
                <img
                    src={secureDelivery3d}
                    loading="lazy"
                    decoding="async"
                    alt={isRtl ? 'تسليم تقرير أشعة آمن عبر الهاتف والحاسوب' : 'Secure radiology report delivery on phone and computer'}
                />
            </button>
        </section>
    );
};
