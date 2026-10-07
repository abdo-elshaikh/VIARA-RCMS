import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { selectPreferences } from '../store/preferencesSlice';

const useMediaPreference = (query) => {
    const [matches, setMatches] = useState(() => window.matchMedia?.(query)?.matches ?? false);
    useEffect(() => {
        const media = window.matchMedia?.(query);
        if (!media) return undefined;
        const update = () => setMatches(media.matches);
        update();
        media.addEventListener?.('change', update);
        return () => media.removeEventListener?.('change', update);
    }, [query]);
    return matches;
};

export default function usePublicAppearance() {
    const preferences = useSelector(selectPreferences);
    const systemDark = useMediaPreference('(prefers-color-scheme: dark)');
    const systemReducedMotion = useMediaPreference('(prefers-reduced-motion: reduce)');
    return {
        dark: preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark),
        reduceMotion: preferences.motion === 'reduced' || systemReducedMotion,
    };
}
