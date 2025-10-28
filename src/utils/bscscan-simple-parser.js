/**
 * BSCScan Simple Parser - Extracts block numbers from BSCScan transactions page
 * Targets: https://bscscan.com/txs?a=0x078E7A2037b63846836E9d721cf2dabC08b94281
 * Simple approach that works with the basic HTML content
 */

import { wait } from './utils.js';

/**
 * Parse BSCScan transactions page to extract block numbers
 * @param {string} bridgeAddress - Bridge contract address
 * @param {Object} options - Parsing options
 * @returns {Promise<Object>} Parsed result with block numbers
 */
async function parseBSCScanBlockNumbers(bridgeAddress, options = {}) {
  const {
    delay = 2000,
    retries = 3
  } = options;

  const baseUrl = 'https://bscscan.com/';
  const targetUrl = `${baseUrl}txs?a=${bridgeAddress}`;
  
  console.log(`🔍 Parsing BSCScan for block numbers: ${targetUrl}`);
  
  try {
    const result = await fetchBSCScanPage(targetUrl, { retries, delay });
    
    if (result.success) {
      console.log(`✅ Successfully parsed BSCScan page`);
      console.log(`Found ${result.blockNumbers.length} block numbers`);
      return {
        success: true,
        blockNumbers: result.blockNumbers,
        error: null
      };
    } else {
      return {
        success: false,
        blockNumbers: [],
        error: result.error || 'Failed to parse BSCScan page'
      };
    }
    
  } catch (error) {
    console.error('❌ Error parsing BSCScan:', error);
    return {
      success: false,
      blockNumbers: [],
      error: error.message
    };
  }
}

/**
 * Fetch BSCScan page and extract block numbers
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} Parsed page result
 */
async function fetchBSCScanPage(url, options = {}) {
  const { retries = 3, delay = 1000 } = options;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`  🔄 Attempt ${attempt}/${retries} for ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        timeout: 30000
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      console.log(`  ✅ Fetched HTML: ${html.length} characters`);
      
      // Extract block numbers from HTML
      const blockNumbers = extractBlockNumbers(html);
      
      if (blockNumbers.length > 0) {
        return {
          success: true,
          blockNumbers: blockNumbers
        };
      }
      
      // If no blocks found, wait and retry
      if (attempt < retries) {
        console.log(`  ⏳ No blocks found, waiting ${delay}ms before retry...`);
        await wait(delay);
      }
      
    } catch (error) {
      console.log(`  ❌ Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < retries) {
        console.log(`  ⏳ Waiting ${delay}ms before retry...`);
        await wait(delay);
      } else {
        throw error;
      }
    }
  }
  
  return {
    success: false,
    blockNumbers: []
  };
}

/**
 * Extract block numbers from HTML content
 * @param {string} html - HTML content
 * @returns {Array} Array of block numbers
 */
function extractBlockNumbers(html) {
  const blockNumbers = [];
  
  console.log(`  🔍 Extracting block numbers from HTML (${html.length} characters)...`);
  
  // Look for block links in the HTML
  const blockLinkPattern = /<a[^>]*href="\/block\/(\d+)"[^>]*>(\d+)<\/a>/gi;
  const blockMatches = [...html.matchAll(blockLinkPattern)];
  
  console.log(`  🔍 Found ${blockMatches.length} block links in HTML`);
  
  blockMatches.forEach(match => {
    const blockNumber = parseInt(match[1], 10);
    if (blockNumber > 0 && blockNumber > 100000) { // BSC blocks are typically > 100000
      blockNumbers.push(blockNumber);
    }
  });
  
  // Remove duplicates and sort (newest first)
  const uniqueBlocks = [...new Set(blockNumbers)].sort((a, b) => b - a);
  
  console.log(`  🔍 Found ${uniqueBlocks.length} unique block numbers`);
  if (uniqueBlocks.length > 0) {
    console.log(`  📋 Block numbers: ${uniqueBlocks.slice(0, 10).join(', ')}`);
  }
  
  return uniqueBlocks;
}

/**
 * Test the BSCScan simple parser
 * @param {string} bridgeAddress - Bridge contract address to test
 * @returns {Promise<Object>} Test result
 */
async function testBSCScanSimpleParser(bridgeAddress = '0x078E7A2037b63846836E9d721cf2dabC08b94281') {
  console.log(`🧪 Testing BSCScan Simple Parser`);
  
  try {
    const result = await parseBSCScanBlockNumbers(bridgeAddress, {
      delay: 2000,
      retries: 2
    });
    
    console.log('📊 Test Results:');
    console.log(`  Success: ${result.success}`);
    console.log(`  Block Numbers: ${result.blockNumbers.length}`);
    console.log(`  Error: ${result.error || 'None'}`);
    
    if (result.blockNumbers.length > 0) {
      console.log('📋 Block Numbers Found:');
      result.blockNumbers.forEach((block, index) => {
        console.log(`  ${index + 1}. Block ${block}`);
      });
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      blockNumbers: [],
      error: error.message
    };
  }
}

// Export functions
export {
  parseBSCScanBlockNumbers,
  fetchBSCScanPage,
  extractBlockNumbers,
  testBSCScanSimpleParser
};
