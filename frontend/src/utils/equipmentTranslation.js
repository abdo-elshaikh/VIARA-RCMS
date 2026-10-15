export const createEquipmentTranslator = translate => (key, options) => {
    if (key.includes(':')) return translate(key, options);
    const value = translate([`equipment.${key}`, key], { ...options, returnObjects: true });
    // Section groups such as equipment.maintenance are objects; tab captions
    // still use the legacy string at the workspace root.
    return typeof value === 'string' ? value : translate(key, options);
};
