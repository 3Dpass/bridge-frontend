/**
 * Request utility for 3dpscan.js
 */
const request = async (url) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Request failed:', error);
    throw error;
  }
};

export { request };
