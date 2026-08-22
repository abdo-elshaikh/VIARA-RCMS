import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Radio, ScanLine, Sparkles, Waves, HeartPulse, ArrowRight, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ModalityItem {
  id: string;
  name: string;
  label: string;
  icon: any;
  tag: string;
  description: string;
  features: string[];
  prepNote: string;
}

const MODALITIES: ModalityItem[] = [
  {
    id: 'mri',
    name: 'MRI 3.0 Tesla',
    label: 'MRI 3.0T',
    icon: ScanLine,
    tag: '3.0T High-Field',
    description: 'Ultra-high field magnetic resonance imaging providing sub-millimeter anatomical detail for brain, spine, musculoskeletal, and vascular evaluation without ionizing radiation.',
    features: ['70cm Wide-Bore Comfort', 'Ultra-Quiet SilentScan', 'AI Deep Resolve Reconstruction'],
    prepNote: 'Remove all metal jewelry, notify staff of implants or pacemakers.',
  },
  {
    id: 'ct',
    name: 'CT 128-Slice',
    label: 'CT 128-Slice',
    icon: Radio,
    tag: '128 Slices',
    description: 'Sub-second full-body and cardiac coronary angiography with iterative dose reduction technology for maximum patient safety and unmatched speed.',
    features: ['Low Radiation ASiR Protocol', '0.33s Cardiac Rotation', '3D Multiplanar Angiography'],
    prepNote: '4 hours fasting if IV contrast is indicated for your examination.',
  },
  {
    id: 'xray',
    name: 'Digital Radiography (X-Ray)',
    label: 'Digital X-Ray',
    icon: Activity,
    tag: 'Low-Dose Digital',
    description: 'Direct digital flat-panel detector systems yielding instantaneous high-contrast bone, joint, and chest diagnostic imaging with minimal radiation dose.',
    features: ['Instant Digital Preview', 'Pediatric Low-Dose Filter', 'Full Spine Stitching'],
    prepNote: 'Wear loose clothing without metal buttons or zippers.',
  },
  {
    id: 'ultrasound',
    name: '4D Ultrasound & Doppler',
    label: 'Ultrasound & Doppler',
    icon: Waves,
    tag: 'Real-Time 4D',
    description: 'High-definition live tissue flow and matrix elastography for abdominal, pelvic, obstetric, thyroid, and peripheral vascular evaluations.',
    features: ['High-Density Matrix Probes', 'Shearwave Elastography', 'Live HD Fetal Rendering'],
    prepNote: 'Fasting or full bladder depending on abdominal vs pelvic study.',
  },
  {
    id: 'mammography',
    name: '3D Digital Mammography',
    label: '3D Mammography',
    icon: Sparkles,
    tag: 'Tomosynthesis',
    description: 'Advanced breast tomosynthesis capturing multiple 1mm digital slices with gentle ergonomic compression for early micro-calcification detection.',
    features: ['Gentle Curved Compression', 'High Sensitivity Tomosynthesis', 'Female Radiologist Staff'],
    prepNote: 'Avoid deodorants, powders, or lotions on the chest area before your scan.',
  },
  {
    id: 'cardiac',
    name: 'Cardiac Diagnostics & Echo',
    label: 'Cardiac Workup',
    icon: HeartPulse,
    tag: 'Echo & Holter',
    description: 'Comprehensive cardiology assessments including color Doppler echocardiography, stress ECG, and continuous ambulatory telemetry.',
    features: ['Strain & Speckle Tracking', '24h/48h Holter Monitoring', 'Exercise Stress Testing'],
    prepNote: 'Wear comfortable walking shoes for exercise stress tests.',
  },
];

interface ModalityShowcaseProps {
  onSelectModality?: (modalityId: string) => void;
}

export const ModalityShowcase = ({ onSelectModality }: ModalityShowcaseProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');
  const [activeId, setActiveId] = useState('mri');
  const activeModality = MODALITIES.find((m) => m.id === activeId) || MODALITIES[0];
  const IconComponent = activeModality.icon;

  return (
    <section id="services-strip" className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-500/20 bg-primary-500/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-primary-700 dark:text-primary-300 mb-3">
          {isRtl ? 'الخدمات التشخيصية' : 'Diagnostic Modalities'}
        </span>
        <h2 className="text-3xl font-extrabold text-foreground tracking-tight sm:text-4xl">
          {isRtl ? 'أحدث تقنيات التصوير الطبي والفحص' : 'Comprehensive Medical Imaging Services'}
        </h2>
        <p className="mt-3 text-base text-muted-foreground">
          {isRtl
            ? 'نقدم مجموعة متكاملة من خدمات الأشعة التشخيصية بإشراف نخبة من أساتذة واستشاريي الأشعة.'
            : 'Explore our state-of-the-art diagnostic imaging suites, interpreted by board-certified consultant radiologists.'}
        </p>
      </div>

      {/* Modality Tab Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-4 pt-1 scrollbar-none sm:justify-center">
        {MODALITIES.map((modality) => {
          const Icon = modality.icon;
          const isActive = modality.id === activeId;
          return (
            <button
              key={modality.id}
              type="button"
              onClick={() => setActiveId(modality.id)}
              className={`flex items-center gap-2.5 shrink-0 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-primary text-white shadow-lg shadow-primary/25 scale-[1.02]'
                  : 'bg-surface border border-border text-foreground hover:border-primary/40 hover:bg-surface-hover'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-primary'}`} />
              <span>{modality.label}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                  isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'
                }`}
              >
                {modality.tag}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active Modality Detail Panel */}
      <div className="mt-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeId}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="rounded-3xl border border-border bg-surface p-6 shadow-xl sm:p-8 lg:p-10"
          >
            <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
              <div className="space-y-5 lg:col-span-7">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-extrabold text-foreground">{activeModality.name}</h3>
                    <span className="text-xs font-bold text-primary">{activeModality.tag}</span>
                  </div>
                </div>

                <p className="text-base leading-relaxed text-muted-foreground">
                  {activeModality.description}
                </p>

                {/* Key Features */}
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {activeModality.features.map((feat, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-xl border border-border/80 bg-background px-3.5 py-2.5 text-xs font-bold text-foreground"
                    >
                      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Prep note */}
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs font-medium text-amber-800 dark:text-amber-300">
                  <span className="font-bold">{isRtl ? 'تعليمات التحضير: ' : 'Preparation Note: '}</span>
                  {activeModality.prepNote}
                </div>
              </div>

              {/* Action Side Card */}
              <div className="lg:col-span-5 flex flex-col justify-center rounded-2xl border border-border bg-background p-6 text-center">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {isRtl ? 'حجز الفحص الفوري' : 'Direct Booking'}
                </p>
                <p className="mt-1 text-lg font-extrabold text-foreground">
                  {isRtl ? `احجز فحص ${activeModality.label}` : `Book ${activeModality.label}`}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {isRtl
                    ? 'فريق الاستقبال لدينا سيقوم بالتواصل وتأكيد الموعد المناسب خلال دقائق.'
                    : 'Our concierge desk will confirm your scheduled slot and prep checklist promptly.'}
                </p>

                <button
                  type="button"
                  onClick={() => onSelectModality?.(activeModality.id)}
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition-all hover:bg-primary-dark hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] cursor-pointer"
                >
                  <span>{isRtl ? 'احجز هذا الفحص الآن' : 'Schedule Appointment'}</span>
                  <ArrowRight className="h-4 w-4 rtl:-scale-x-100" />
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};
