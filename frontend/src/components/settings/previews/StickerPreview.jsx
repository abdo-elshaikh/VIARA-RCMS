import React from 'react';

const StickerPreview = ({ width, height, themeColor = '#0f766e', fontFamily = 'Inter', data }) => {
    // Basic validation and conversion for preview.
    const parseUnit = (value) => {
        if (typeof value !== 'string') return { val: 0, unit: 'px' };
        const num = parseFloat(value);
        const unit = value.match(/[a-zA-Z%]+/)?.[0] || 'px';
        return { val: num, unit };
    };

    const widthObj = parseUnit(width);
    const heightObj = parseUnit(height);

    // A scaling factor to make the preview a reasonable size on screen
    const getScale = (unit) => {
        switch (unit) {
            case 'in': return 96; // 1 inch = 96px
            case 'mm': return 3.78; // 1 mm ~= 3.78px
            case 'cm': return 37.8; // 1 cm ~= 37.8px
            default: return 1;
        }
    };

    const previewWidth = widthObj.val * getScale(widthObj.unit);
    const previewHeight = heightObj.val * getScale(heightObj.unit);
    const fontStack = fontFamily === 'Outfit' ? "'Outfit', sans-serif" : fontFamily === 'Space Mono' ? "'Space Mono', monospace" : "'Inter', sans-serif";

    return (
        <div>
            <h4 className="text-sm font-bold text-slate-800 mb-2">Sticker Preview</h4>
            <div
                className="bg-white border-2 border-slate-300 rounded-lg p-3 overflow-hidden shadow-sm relative transition-all"
                style={{
                    width: `${Math.min(previewWidth || 364, 400)}px`,
                    height: `${Math.min(previewHeight || 172, 200)}px`,
                    fontFamily: fontStack,
                    borderLeft: `5px solid ${themeColor}`
                }}
            >
                {/* Modality Badge */}
                <span className="absolute top-2.5 right-3 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: themeColor }}>
                    MRI
                </span>

                <div className="text-[11px] text-slate-600 leading-tight space-y-1 pr-12">
                    <p className="font-extrabold text-[12px]" style={{ color: themeColor }}>{data.centerName || 'CENTER NAME'}</p>
                    <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">{data.branchName || 'Branch Name'}</p>
                    <hr className="my-1.5 border-slate-100" />
                    <p className="font-black text-slate-800 text-[13px] tracking-tight">{data.patientName || 'PATIENT, JOHN'}</p>
                    <div className="flex gap-3 text-[10px] font-semibold text-slate-500 mt-1">
                        <span>DOB: {data.dob || '01/01/1985'}</span>
                        <span>MRN: {data.mrn || 'MRN-847291'}</span>
                    </div>
                    <p className="font-bold text-[10px] mt-2 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded inline-block text-slate-700">{data.procedure || 'MRI BRAIN W/ CONTRAST'}</p>
                </div>
            </div>
        </div>
    );
};

export default StickerPreview;
