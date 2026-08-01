let tokenProvider = () => null;

export const configureAccessTokenProvider = (provider) => {
    tokenProvider = typeof provider === 'function' ? provider : () => null;
};

export const getInMemoryAccessToken = () => tokenProvider() || null;
