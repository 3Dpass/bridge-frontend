export const switchNetwork = async (networkConfig) => {
  if (!networkConfig || (networkConfig.chainId === undefined && networkConfig.id === undefined)) {
    return false;
  }

  const win = typeof window !== 'undefined' ? window : (typeof global !== 'undefined' && global.window);
  if (!win || !win.ethereum) {
    return false;
  }

  try {
    const chainId = networkConfig.chainId !== undefined ? networkConfig.chainId : networkConfig.id;
    const chainIdHex = `0x${chainId.toString(16)}`;

    await win.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainIdHex }],
    });

    return true;
  } catch (error) {
    if (error.code === 4902) {
      try {
        const chainId = networkConfig.chainId !== undefined ? networkConfig.chainId : networkConfig.id;
        const chainIdHex = `0x${chainId.toString(16)}`;

        await win.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chainIdHex,
            chainName: networkConfig.name,
            nativeCurrency: networkConfig.nativeCurrency,
            rpcUrls: [networkConfig.rpcUrl],
            blockExplorerUrls: [networkConfig.explorer],
          }],
        });

        return true;
      } catch (addError) {
        return false;
      }
    }

    return false;
  }
};
