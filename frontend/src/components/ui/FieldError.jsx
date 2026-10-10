import React from 'react';
import { AlertCircle } from 'lucide-react';

const FieldError = ({ error, id }) => error ? (
    <p id={id} role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-rose-600">
        <AlertCircle size={12} />{error.message}
    </p>
) : null;

export default FieldError;
