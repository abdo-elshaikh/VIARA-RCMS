export const isDeveloperRole = (role) => role === 'Developer';

export const isAdminRole = (role) => role === 'Admin';

export const hasDeveloperOrAdminRole = (role) => isDeveloperRole(role) || isAdminRole(role);

export const userHasDeveloperOrAdminRole = (user) => hasDeveloperOrAdminRole(user?.role);
