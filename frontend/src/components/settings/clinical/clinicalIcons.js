import {
  BrainCircuit,
  FileText,
  HeartPulse,
  Monitor,
  Radio,
  Scale,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export const getModalityIcon = (type = '') => {
  const normalized = type.toLowerCase();

  if (normalized.includes('mri')) return BrainCircuit;
  if (normalized.includes('ct')) return Monitor;
  if (normalized.includes('x-ray') || normalized.includes('xray')) return Radio;
  if (normalized.includes('ultrasound')) return HeartPulse;
  if (normalized.includes('pet') || normalized.includes('nuclear')) return Sparkles;
  if (normalized.includes('fluoro') || normalized.includes('mammo')) return ShieldCheck;
  if (normalized.includes('dexa')) return Scale;

  return FileText;
};

export const MachineIcon = Server;
