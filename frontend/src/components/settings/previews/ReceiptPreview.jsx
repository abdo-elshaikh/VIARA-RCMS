import React from 'react';
import { QrCode } from 'lucide-react';

const ReceiptPreview = ({ width, header, footer, showQR, themeColor = '#0f766e', fontFamily = 'Inter', data }) => {
    const defaultHeader = `${data.centerName || 'RCMS Radiology'}\n${data.branchName || 'Main Branch'}\n123 Health Ave\n(555) 123-4567`;
    const fontStack = fontFamily === 'Outfit' ? "'Outfit', sans-serif" : fontFamily === 'Space Mono' ? "'Space Mono', monospace" : "'Inter', sans-serif";

    return (
        <div>
            <h4 className="text-sm font-bold text-slate-800 mb-2">Receipt Preview</h4>
            <div
                className="bg-white border border-slate-200 rounded-xl p-4 overflow-hidden shadow-sm transition-all"
                style={{
                    width: width === '100%' ? '100%' : `${parseFloat(width)}px` || '288px',
                    maxWidth: '100%',
                    fontFamily: fontStack,
                }}
            >
                <div className="text-center text-[11px] text-slate-600 font-mono leading-relaxed">
                    <pre className="whitespace-pre-wrap font-sans text-xs font-bold text-slate-800" style={{ color: themeColor }}>{header || defaultHeader}</pre>
                    <p className="my-2 border-b border-dashed border-slate-300"></p>
                    <div className="text-left space-y-0.5 my-3">
                        <div className="flex justify-between"><span>Procedure 1</span><span>$150.00</span></div>
                        <div className="flex justify-between text-emerald-600 font-bold"><span>Discount (10%)</span><span>-$15.00</span></div>
                        <div className="flex justify-between font-extrabold text-slate-800 border-t border-dotted border-slate-200 pt-1"><span>Total</span><span>$135.00</span></div>
                    </div>
                    <p className="my-2 border-b border-dashed border-slate-300"></p>
                    {showQR && (
                        <div className="flex flex-col items-center my-3 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                            <QrCode size={56} style={{ color: themeColor }} />
                            <p className="mt-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">Scan for Patient Portal</p>
                        </div>
                    )}
                    <pre className="whitespace-pre-wrap mt-2 font-sans text-[10px] text-slate-400 font-semibold">{footer || 'Thank you!'}</pre>
                </div>
            </div>
        </div>
    );
};

export default ReceiptPreview;
