import { request } from './request.js';
import { wait } from './utils.js';

const threedpass_base_url = process.env.testnet ? 'https://api-testnet.3dpscan.xyz' : 'https://api.3dpscan.xyz';
const PAGE_SIZE = 25; // Adjustable page size for 3DPass API requests
let last_req_ts = 0;

/**
 * Get blocks containing EVM events for a specific contract address
 * @param {Object} params - Parameters object
 * @param {string} params.address - Contract address to query
 * @param {number} params.startblock - Starting block number
 * @param {number} params.endblock - Ending block number (optional)
 * @param {number} params.count - Retry count for error handling
 * @returns {Promise<number[]>} Array of block numbers containing EVM events
 */
async function getAddressBlocks({ address, startblock, endblock, count = 0 }) {
	try {
		let page = 1;
		let all_blocks = [];
		let consecutive_empty_pages = 0;
		const max_empty_pages = 2; // Stop after 2 consecutive pages with no relevant events
		
		while (true) {
			// Rate limiting: 1 request per second
			const passed = Date.now() - last_req_ts;
			if (passed < 1000) {
				console.log(`will wait for ${1000 - passed} ms between 3dpscan requests`);
				await wait(1000 - passed);
			}
			
			// Build URL for EVM events query
			let url = `${threedpass_base_url}/events?section=evm&method=Log&is_extrinsic=false&time_dimension=block&page=${page}&page_size=${PAGE_SIZE}`;
			if (startblock) {
				url += `&block_start=${startblock}`;
			}
			if (endblock) {
				url += `&block_end=${endblock}`;
			}
			
			console.log(`Querying 3DPass EVM events for address ${address}: ${url}`);
			const resp = await request(url);
			last_req_ts = Date.now();
			
			if (!resp.items) {
				if (resp.total === 0 && resp.page === 1) { // no events for this address
					break;
				}
				throw Error(`no items from 3dpscan EVM events: ${JSON.stringify(resp)}`);
			}
			
			// Filter events for the specific contract address
			const relevantEvents = resp.items.filter(item => {
				if (item.section !== 'evm' || item.method !== 'Log') {
					return false;
				}
				
				const log = item.args[0].value;
				return log.address.toLowerCase() === address.toLowerCase();
			});
			
			// Extract block heights from relevant events
			const blocks = relevantEvents.map(item => item.indexer.blockHeight);
			all_blocks.push(...blocks);
			
			console.log(`Found ${relevantEvents.length} relevant EVM events in page ${page} for address ${address}`);
			
			// Check if we should continue pagination
			if (resp.items.length === 0) {
				break; // No more items at all - stop pagination
			}
			
			// Track consecutive pages with no relevant events
			if (relevantEvents.length === 0) {
				consecutive_empty_pages++;
				if (consecutive_empty_pages >= max_empty_pages) {
					console.log(`Stopping after ${max_empty_pages} consecutive pages with no relevant events`);
					break;
				}
			} else {
				consecutive_empty_pages = 0; // Reset counter when we find relevant events
			}
			
			// Continue to next page
			page++;
		}
		
		// Process and return unique blocks
		let unique_blocks = [...new Set(all_blocks)];
		if (startblock) {
			unique_blocks = unique_blocks.filter(b => b >= startblock);
		}
		unique_blocks.sort((a, b) => a - b);
		
		console.log(`Found ${unique_blocks.length} unique blocks with EVM events for address ${address}`);
		return unique_blocks;
	}
	catch (e) {
		console.log(`getAddressBlocks from 3dpscan EVM events failed`, e);
		if (count > 5) {
			throw e;
		}
		console.log(`will retry getAddressBlocks from 3dpscan in 60 sec`);
		await wait(60 * 1000);
		count++;
		return await getAddressBlocks({ address, startblock, endblock, count });
	}
}

/**
 * Get EVM transaction events for a specific address
 * @param {Object} params - Parameters object
 * @param {string} params.address - Contract address to query
 * @param {number} params.startblock - Starting block number
 * @param {number} params.endblock - Ending block number (optional)
 * @param {number} params.count - Retry count for error handling
 * @returns {Promise<number[]>} Array of block numbers containing EVM transactions
 */
async function getAddressTransactionBlocks({ address, startblock, endblock, count = 0 }) {
	try {
		let page = 1;
		let all_blocks = [];
		let consecutive_empty_pages = 0;
		const max_empty_pages = 3; // Stop after 3 consecutive pages with no relevant events
		
		while (true) {
			// Rate limiting: 1 request per second
			const passed = Date.now() - last_req_ts;
			if (passed < 1000) {
				console.log(`will wait for ${1000 - passed} ms between 3dpscan requests`);
				await wait(1000 - passed);
			}
			
			// Build URL for EVM transaction events query
			let url = `${threedpass_base_url}/events?section=ethereum&is_extrinsic=false&time_dimension=block&block_start=${startblock || 0}`;
			if (endblock) {
				url += `&block_end=${endblock}`;
			}
			url += `&page=${page}`;
			
			console.log(`Querying 3DPass EVM transactions for address ${address}: ${url}`);
			const resp = await request(url);
			last_req_ts = Date.now();
			
			if (!resp.items) {
				if (resp.total === 0 && resp.page === 1) { // no transactions for this address
					break;
				}
				throw Error(`no items from 3dpscan EVM transactions: ${JSON.stringify(resp)}`);
			}
			
			// Filter transactions for the specific contract address
			const relevantTransactions = resp.items.filter(item => {
				if (item.section !== 'ethereum' || item.method !== 'Executed') {
					return false;
				}
				
				const args = item.args;
				const toAddress = args.find(arg => arg.name === 'to')?.value;
				const fromAddress = args.find(arg => arg.name === 'from')?.value;
				
				return toAddress?.toLowerCase() === address.toLowerCase() || 
					   fromAddress?.toLowerCase() === address.toLowerCase();
			});
			
			// Extract block heights from relevant transactions
			const blocks = relevantTransactions.map(item => item.indexer.blockHeight);
			all_blocks.push(...blocks);
			
			console.log(`Found ${relevantTransactions.length} relevant EVM transactions in page ${page} for address ${address}`);
			
			// Check if we should continue pagination
			if (resp.items.length === 0) {
				break; // No more items at all - stop pagination
			}
			
			// Track consecutive pages with no relevant events
			if (relevantTransactions.length === 0) {
				consecutive_empty_pages++;
				if (consecutive_empty_pages >= max_empty_pages) {
					console.log(`Stopping after ${max_empty_pages} consecutive pages with no relevant events`);
					break;
				}
			} else {
				consecutive_empty_pages = 0; // Reset counter when we find relevant events
			}
			
			// Continue to next page
			page++;
		}
		
		// Process and return unique blocks
		let unique_blocks = [...new Set(all_blocks)];
		if (startblock) {
			unique_blocks = unique_blocks.filter(b => b >= startblock);
		}
		unique_blocks.sort((a, b) => a - b);
		
		console.log(`Found ${unique_blocks.length} unique blocks with EVM transactions for address ${address}`);
		return unique_blocks;
	}
	catch (e) {
		console.log(`getAddressTransactionBlocks from 3dpscan EVM transactions failed`, e);
		if (count > 5) {
			throw e;
		}
		console.log(`will retry getAddressTransactionBlocks from 3dpscan in 60 sec`);
		await wait(60 * 1000);
		count++;
		return await getAddressTransactionBlocks({ address, startblock, endblock, count });
	}
}

export { getAddressBlocks, getAddressTransactionBlocks }; 