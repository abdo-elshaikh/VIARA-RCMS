import { canAccessRoute } from '../config/routes';

export const resolvePreferredStartPage = ({ user, preferences = {}, fallback = '/dashboard' } = {}) => {
    const preferred = user?.preferences?.startPage || preferences?.startPage;
    return preferred && canAccessRoute(preferred, user) ? preferred : fallback;
};

