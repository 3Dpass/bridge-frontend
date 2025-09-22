// Contract ABIs for Counterstake Bridge

export const EXPORT_ABI = [
  // Events
  "event NewExpatriation(address sender_address, uint amount, int reward, string foreign_address, string data)",
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)",
  "event AssistantTransferExecuted(address assistant, address recipient, uint stake, uint paid_amount)",
  
  // View functions
  "function foreign_network() view returns (string)",
  "function foreign_asset() view returns (string)",
  "function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function governance() view returns (address)",
  "function P3D_PRECOMPILE() view returns (address)",
  "function last_claim_num() view returns (uint64)",
  "function getClaim(uint claim_num) view returns (tuple(uint amount, address recipient_address, uint32 txts, uint32 ts, address claimant_address, uint32 expiry_ts, uint16 period_number, uint8 current_outcome, bool is_large, bool withdrawn, bool finished, string sender_address, string data, uint yes_stake, uint no_stake))",
  
  // State changing functions
  "function initExport(string foreign_network, string foreign_asset)",
  "function initCounterstake(address tokenAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function transferToForeignChain(string foreign_address, string data, uint amount, int reward) payable",
  "function claim(string txid, uint32 txts, uint amount, int reward, uint stake, string sender_address, address payable recipient_address, string data) payable",
  "function challenge(uint claim_num, uint8 stake_on, uint stake) payable",
  "function withdraw(uint claim_num) external",
];

// Regular Import ABI (for non-3DPass networks like Ethereum, BSC - creates new ERC20 tokens)
export const IMPORT_ABI = [
  // Events
  "event NewRepatriation(address sender_address, uint amount, uint reward, string home_address, string data)",
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)",
  
  // View functions
  "function home_network() view returns (string)",
  "function home_asset() view returns (string)",
  "function oracleAddress() view returns (address)",
  "function min_price20() view returns (uint)",
  "function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function governance() view returns (address)",
  "function P3D_PRECOMPILE() view returns (address)",
  "function last_claim_num() view returns (uint64)",
  "function getClaim(uint claim_num) view returns (tuple(uint amount, address recipient_address, uint32 txts, uint32 ts, address claimant_address, uint32 expiry_ts, uint16 period_number, uint8 current_outcome, bool is_large, bool withdrawn, bool finished, string sender_address, string data, uint yes_stake, uint no_stake))",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function initImport(string home_network, string home_asset, string name, string symbol, address oracleAddr)",
  "function initCounterstake(address stakeTokenAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function validateOracle(address oracleAddr) view",
  "function setOracle(address oracleAddr)",
  "function validateMinPrice(uint min_price20) pure",
  "function setMinPrice(uint min_price20)",
  "function transferToHomeChain(string home_address, string data, uint amount, uint reward)",
  "function claim(string txid, uint32 txts, uint amount, int reward, uint stake, string sender_address, address payable recipient_address, string data) payable",
  "function challenge(uint claim_num, uint8 stake_on, uint stake) payable",
  "function withdraw(uint claim_num) external",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

// ImportWrapper ABI (3DPass specific - wraps existing precompile tokens)
export const IMPORT_WRAPPER_ABI = [
  // Events
  "event NewRepatriation(address sender_address, uint amount, uint reward, string home_address, string data)",
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)",
  "event AssistantTransferExecuted(address assistant, address user, uint stake_amount, uint image_amount)",
  
  // View functions
  "function home_network() view returns (string)",
  "function home_asset() view returns (string)",
  "function oracleAddress() view returns (address)",
  "function min_price20() view returns (uint)",
  "function precompileAddress() view returns (address)",
  "function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function governance() view returns (address)",
  "function P3D_PRECOMPILE() view returns (address)",
  "function last_claim_num() view returns (uint64)",
  "function getClaim(uint claim_num) view returns (tuple(uint amount, address recipient_address, uint32 txts, uint32 ts, address claimant_address, uint32 expiry_ts, uint16 period_number, uint8 current_outcome, bool is_large, bool withdrawn, bool finished, string sender_address, string data, uint yes_stake, uint no_stake))",
  
  // State changing functions
  "function initImportWrapper(string home_network, string home_asset, address precompileAddress, address oracleAddr)",
  "function initCounterstake(address stakeTokenAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function setupPrecompileRoles()",
  "function setPrecompileMetadata(string name, string symbol, uint8 decimals)",
  "function validateOracle(address oracleAddr) view",
  "function setOracle(address oracleAddr)",
  "function validateMinPrice(uint min_price20) pure",
  "function setMinPrice(uint min_price20)",
  "function enactImportWrapper()",
  "function transferToHomeChain(string home_address, string data, uint amount, uint reward)",
  "function claim(string txid, uint32 txts, uint amount, int reward, uint stake, string sender_address, address payable recipient_address, string data) payable",
  "function challenge(uint claim_num, uint8 stake_on, uint stake) payable",
  "function withdraw(uint claim_num) external",
];

export const FACTORY_ABI = [
  // Events
  "event NewExport(address contractAddress, address tokenAddress, string foreign_network, string foreign_asset)",
  "event NewImport(address contractAddress, string home_network, string home_asset, string symbol, address stakeTokenAddress)",
  "event NewImportWrapper(address contractAddress, string home_network, string home_asset, address precompileAddress, address stakeTokenAddress)",
  
  // View functions
  "function exportMaster() view returns (address)",
  "function importMaster() view returns (address)",
  "function importWrapperMaster() view returns (address)",
  
  // State changing functions
  "function createExport(string foreign_network, string foreign_asset, address tokenAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods) returns (address)",
  "function createImport(string home_network, string home_asset, string name, string symbol, address stakeTokenAddr, address oracleAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods) returns (address)",
  "function createImportWrapper(string home_network, string home_asset, address precompileAddress, address stakeTokenAddr, address oracleAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods) returns (address)",
];

export const ASSISTANT_FACTORY_ABI = [
  // Events
  "event NewExportAssistant(address contractAddress, address bridgeAddress, address manager, string symbol)",
  "event NewImportAssistant(address contractAddress, address bridgeAddress, address manager, string symbol)",
  "event NewImportWrapperAssistant(address contractAddress, address bridgeAddress, address precompileAddress, string name, string symbol)",
  
  // View functions
  "function exportAssistantMaster() view returns (address)",
  "function importAssistantMaster() view returns (address)",
  "function importWrapperAssistantMaster() view returns (address)",
  
  // State changing functions
  "function createExportAssistant(address bridgeAddr, address managerAddr, uint16 _management_fee10000, uint16 _success_fee10000, address oracleAddr, uint8 _exponent, string name, string symbol) returns (address)",
  "function createImportAssistant(address bridgeAddress, address managerAddress, uint16 management_fee10000, uint16 success_fee10000, uint16 swap_fee10000, uint8 exponent, string name, string symbol) returns (address)",
  "function createImportWrapperAssistant(address bridgeAddress, address managerAddress, uint16 management_fee10000, uint16 success_fee10000, uint16 swap_fee10000, uint8 exponent, string name, string symbol) returns (address)",
];

export const EXPORT_ASSISTANT_ABI = [
  // Events
  "event NewClaimFor(uint claim_num, address for_address, string txid, uint32 txts, uint amount, int reward, uint stake)",
  "event AssistantChallenge(uint claim_num, uint8 outcome, uint stake)",
  "event NewManager(address previousManager, address newManager)",
  
  // View functions
  "function bridgeAddress() view returns (address)",
  "function tokenAddress() view returns (address)",
  "function managerAddress() view returns (address)",
  "function oracleAddress() view returns (address)",
  "function management_fee10000() view returns (uint16)",
  "function success_fee10000() view returns (uint16)",
  "function exit_fee10000() view returns (uint16)",
  "function exponent() view returns (uint8)",
  "function profit_diffusion_period() view returns (uint)",
  "function ts() view returns (uint)",
  "function profit() view returns (int)",
  "function mf() view returns (uint)",
  "function balance_in_work() view returns (uint)",
  "function balances_in_work(uint) view returns (uint)",
  "function recent_profit() view returns (uint)",
  "function recent_profit_ts() view returns (uint)",
  "function network_fee_compensation() view returns (uint)",
  "function governance() view returns (address)",
  "function getUnavailableProfit() view returns (uint)",
  "function supportsInterface(bytes4) view returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function initExportAssistant(address bridgeAddr, address managerAddr, uint16 _management_fee10000, uint16 _success_fee10000, address oracleAddr, uint8 _exponent, string _name, string _symbol)",
  "function claim(string txid, uint32 txts, uint amount, int reward, string sender_address, address recipient_address, string data)",
  "function challenge(uint claim_num, uint8 stake_on, uint stake)",
  "function onReceivedFromClaim(uint claim_num, uint claimed_amount, uint won_stake, string, address, string)",
  "function recordLoss(uint claim_num)",
  "function recordWin(uint claim_num)",
  "function buyShares(uint stake_asset_amount) payable",
  "function redeemShares(uint shares_amount)",
  "function withdrawManagementFee()",
  "function withdrawSuccessFee()",
  "function assignNewManager(address newManager)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function validateProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function setProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function validateExitFee(uint _exit_fee10000)",
  "function setExitFee(uint _exit_fee10000)",
  "function validateOracle(address oracleAddr)",
  "function setOracle(address oracleAddr)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

// ExportWrapper Assistant ABI (3DPass specific - works with precompiles)
export const EXPORT_WRAPPER_ASSISTANT_ABI = [
  // Events
  "event NewClaimFor(uint claim_num, address for_address, string txid, uint32 txts, uint amount, int reward, uint stake)",
  "event AssistantChallenge(uint claim_num, uint8 outcome, uint stake)",
  "event NewManager(address previousManager, address newManager)",
  
  // View functions
  "function bridgeAddress() view returns (address)",
  "function tokenAddress() view returns (address)",
  "function managerAddress() view returns (address)",
  "function oracleAddress() view returns (address)",
  "function management_fee10000() view returns (uint16)",
  "function success_fee10000() view returns (uint16)",
  "function exit_fee10000() view returns (uint16)",
  "function exponent() view returns (uint8)",
  "function profit_diffusion_period() view returns (uint)",
  "function ts() view returns (uint)",
  "function profit() view returns (int)",
  "function mf() view returns (uint)",
  "function balance_in_work() view returns (uint)",
  "function balances_in_work(uint) view returns (uint)",
  "function recent_profit() view returns (uint)",
  "function recent_profit_ts() view returns (uint)",
  "function network_fee_compensation() view returns (uint)",
  "function governance() view returns (address)",
  "function getUnavailableProfit() view returns (uint)",
  "function supportsInterface(bytes4) view returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function initExportAssistant(address bridgeAddr, address managerAddr, uint16 _management_fee10000, uint16 _success_fee10000, address oracleAddr, uint8 _exponent, string _name, string _symbol)",
  "function approvePrecompile()",
  "function claim(string txid, uint32 txts, uint amount, int reward, string sender_address, address recipient_address, string data)",
  "function challenge(uint claim_num, uint8 stake_on, uint stake)",
  "function onReceivedFromClaim(uint claim_num, uint claimed_amount, uint won_stake, string, address, string)",
  "function recordLoss(uint claim_num)",
  "function recordWin(uint claim_num)",
  "function buyShares(uint stake_asset_amount) payable",
  "function redeemShares(uint shares_amount)",
  "function withdrawManagementFee()",
  "function withdrawSuccessFee()",
  "function assignNewManager(address newManager)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function validateProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function setProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function validateExitFee(uint _exit_fee10000)",
  "function setExitFee(uint _exit_fee10000)",
  "function validateOracle(address oracleAddr)",
  "function setOracle(address oracleAddr)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

// ImportWrapper Assistant ABI (3DPass specific - wraps existing precompile tokens)
export const IMPORT_WRAPPER_ASSISTANT_ABI = [
  // Events
  "event NewClaimFor(uint claim_num, address for_address, string txid, uint32 txts, uint amount, int reward, uint stake)",
  "event AssistantChallenge(uint claim_num, uint8 outcome, uint stake)",
  "event NewManager(address previousManager, address newManager)",
  
  // View functions
  "function bridgeAddress() view returns (address)",
  "function tokenAddress() view returns (address)",
  "function precompileAddress() view returns (address)",
  "function managerAddress() view returns (address)",
  "function management_fee10000() view returns (uint16)",
  "function success_fee10000() view returns (uint16)",
  "function swap_fee10000() view returns (uint16)",
  "function exit_fee10000() view returns (uint16)",
  "function exponent() view returns (uint8)",
  "function profit_diffusion_period() view returns (uint)",
  "function ts() view returns (uint)",
  "function profit() view returns (tuple(int stake, int image))",
  "function mf() view returns (tuple(uint stake, uint image))",
  "function balance_in_work() view returns (tuple(uint stake, uint image))",
  "function balances_in_work(uint) view returns (tuple(uint stake, uint image))",
  "function recent_profit() view returns (tuple(uint stake, uint image))",
  "function recent_profit_ts() view returns (uint)",
  "function network_fee_compensation() view returns (uint)",
  "function governance() view returns (address)",
  "function getUnavailableProfit() view returns (tuple(uint stake, uint image))",
  "function supportsInterface(bytes4) view returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function initImportWrapperAssistant(address bridgeAddr, address managerAddr, uint16 _management_fee10000, uint16 _success_fee10000, uint16 _swap_fee10000, uint8 _exponent, string _name, string _symbol)",
  "function approvePrecompile()",
  "function claim(string txid, uint32 txts, uint amount, int reward, string sender_address, address recipient_address, string data)",
  "function challenge(uint claim_num, uint8 stake_on, uint stake)",
  "function onReceivedFromClaim(uint claim_num, uint claimed_amount, uint won_stake, string, address, string)",
  "function recordLoss(uint claim_num)",
  "function recordWin(uint claim_num)",
  "function buyShares(uint stake_asset_amount, uint image_asset_amount) payable",
  "function redeemShares(uint shares_amount)",
  "function swapImage2Stake(uint image_asset_amount, uint min_amount_out)",
  "function swapStake2Image(uint stake_asset_amount, uint min_amount_out) payable",
  "function withdrawManagementFee()",
  "function withdrawSuccessFee()",
  "function assignNewManager(address newManager)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function validateProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function setProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function validateSwapFee(uint _swap_fee10000)",
  "function setSwapFee(uint _swap_fee10000)",
  "function validateExitFee(uint _exit_fee10000)",
  "function setExitFee(uint _exit_fee10000)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

// Regular Import Assistant ABI (for non-3DPass networks like Ethereum, BSC)
export const IMPORT_ASSISTANT_ABI = [
  // Events
  "event NewClaimFor(uint claim_num, address for_address, string txid, uint32 txts, uint amount, int reward, uint stake)",
  "event AssistantChallenge(uint claim_num, uint8 outcome, uint stake)",
  "event NewManager(address previousManager, address newManager)",
  
  // View functions
  "function bridgeAddress() view returns (address)",
  "function tokenAddress() view returns (address)",
  "function managerAddress() view returns (address)",
  "function management_fee10000() view returns (uint16)",
  "function success_fee10000() view returns (uint16)",
  "function swap_fee10000() view returns (uint16)",
  "function exit_fee10000() view returns (uint16)",
  "function exponent() view returns (uint8)",
  "function profit_diffusion_period() view returns (uint)",
  "function ts() view returns (uint)",
  "function profit() view returns (tuple(int stake, int image))",
  "function mf() view returns (tuple(uint stake, uint image))",
  "function balance_in_work() view returns (tuple(uint stake, uint image))",
  "function balances_in_work(uint) view returns (tuple(uint stake, uint image))",
  "function recent_profit() view returns (tuple(uint stake, uint image))",
  "function recent_profit_ts() view returns (uint)",
  "function network_fee_compensation() view returns (uint)",
  "function governance() view returns (address)",
  "function getUnavailableProfit() view returns (tuple(uint stake, uint image))",
  "function supportsInterface(bytes4) view returns (bool)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function initImportAssistant(address bridgeAddr, address managerAddr, uint16 _management_fee10000, uint16 _success_fee10000, uint16 _swap_fee10000, uint8 _exponent, string _name, string _symbol)",
  "function claim(string txid, uint32 txts, uint amount, int reward, string sender_address, address recipient_address, string data)",
  "function challenge(uint claim_num, uint8 stake_on, uint stake)",
  "function onReceivedFromClaim(uint claim_num, uint claimed_amount, uint won_stake, string, address, string)",
  "function recordLoss(uint claim_num)",
  "function recordWin(uint claim_num)",
  "function buyShares(uint stake_asset_amount, uint image_asset_amount) payable",
  "function redeemShares(uint shares_amount)",
  "function swapImage2Stake(uint image_asset_amount, uint min_amount_out)",
  "function swapStake2Image(uint stake_asset_amount, uint min_amount_out) payable",
  "function withdrawManagementFee()",
  "function withdrawSuccessFee()",
  "function assignNewManager(address newManager)",
  "function setupGovernance(address governanceFactory, address votedValueFactory)",
  "function validateProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function setProfitDiffusionPeriod(uint _profit_diffusion_period)",
  "function validateSwapFee(uint _swap_fee10000)",
  "function setSwapFee(uint _swap_fee10000)",
  "function validateExitFee(uint _exit_fee10000)",
  "function setExitFee(uint _exit_fee10000)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

export const GOVERNANCE_ABI = [
  // Events
  "event Deposit(address indexed who, uint amount)",
  "event Withdrawal(address indexed who, uint amount)",
  "event VotedValueAdded(string name, address votedValueAddress)",
  "event VotedValueRemoved(string name, address votedValueAddress)",
  
  // View functions
  "function votedValues(string name) view returns (address)",
  "function getVotedValues() view returns (string[] names, address[] addresses)",
  "function balanceOf(address account) view returns (uint)",
  "function totalSupply() view returns (uint)",
  "function addressBelongsToGovernance(address addr) view returns (bool)",
  "function isUntiedFromAllVotes(address addr) view returns (bool)",
  
  // State changing functions
  "function init(address _governedContractAddress, address _votingTokenAddress)",
  "function addVotedValue(string name, address votedValueAddress)",
  "function removeVotedValue(string name)",
  "function deposit() payable",
  "function deposit(address from, uint amount) payable",
  "function withdraw()",
  "function withdraw(uint amount)",
];

export const VOTED_VALUE_UINT_ABI = [
  // Events
  "event Vote(address indexed who, uint indexed value, uint votes, uint total_votes, uint leader, uint leader_total_votes, uint expiry_ts)",
  "event Unvote(address indexed who, uint indexed value, uint votes)",
  "event Commit(address indexed who, uint indexed value)",
  
  // View functions
  "function leader() view returns (uint)",
  "function current_value() view returns (uint)",
  "function choices(address) view returns (uint)",
  "function votesByValue(uint) view returns (uint)",
  "function votesByValueAddress(uint, address) view returns (uint)",
  "function governance() view returns (address)",
  
  // State changing functions
  "function init(Governance _governance, uint initial_value, function(uint) external _validationCallback, function(uint) external _commitCallback)",
  "function vote(uint value)",
  "function voteAndDeposit(uint value, uint amount) payable",
  "function unvote()",
  "function commit()",
];

export const VOTED_VALUE_ADDRESS_ABI = [
  // Events
  "event Vote(address indexed who, address indexed value, uint votes, uint total_votes, address leader, uint leader_total_votes, uint expiry_ts)",
  "event Unvote(address indexed who, address indexed value, uint votes)",
  "event Commit(address indexed who, address indexed value)",
  
  // View functions
  "function leader() view returns (address)",
  "function current_value() view returns (address)",
  "function choices(address) view returns (address)",
  "function votesByValue(address) view returns (uint)",
  "function votesByValueAddress(address, address) view returns (uint)",
  "function governance() view returns (address)",
  
  // State changing functions
  "function init(Governance _governance, address initial_value, function(address) external _validationCallback, function(address) external _commitCallback)",
  "function vote(address value)",
  "function voteAndDeposit(address value, uint amount) payable",
  "function unvote()",
  "function commit()",
];

// VotedValueUintArray ABI (was missing)
export const VOTED_VALUE_UINT_ARRAY_ABI = [
  // Events
  "event Vote(address indexed who, uint[] value, uint votes, uint total_votes, uint[] leader, uint leader_total_votes, uint expiry_ts)",
  "event Unvote(address indexed who, uint[] value, uint votes)",
  "event Commit(address indexed who, uint[] value)",
  
  // View functions
  "function leader() view returns (uint[])",
  "function current_value() view returns (uint[])",
  "function choices(address) view returns (uint[])",
  "function votesByValue(bytes32) view returns (uint)",
  "function votesByValueAddress(bytes32, address) view returns (uint)",
  "function equal(uint[] a1, uint[] a2) pure returns (bool)",
  "function getKey(uint[] a) pure returns (bytes32)",
  
  // State changing functions
  "function init(Governance _governance, uint[] initial_value, function(uint[]) external _validationCallback, function(uint[]) external _commitCallback)",
  "function vote(uint[] value)",
  "function voteAndDeposit(uint[] value, uint amount) payable",
  "function unvote()",
  "function commit()",
];

export const ORACLE_ABI = [
  // View functions
  "function getPrice(string asset1, string asset2) view returns (uint num, uint den)",
  
  // State changing functions
  "function setPrice(string asset1, string asset2, uint num, uint den)",
];

// ERC20 Token ABI
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// IP3D Interface ABI (exactly matches IP3D.sol interface)
export const IP3D_ABI = [
  "function name() external view returns (string memory)",
  "function symbol() external view returns (string memory)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address owner) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 value) external returns (bool)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function transferFrom(address from, address to, uint256 value) external returns (bool)",
  
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// IPrecompileERC20 Interface ABI (exactly matches IPrecompileERC20.sol interface)
export const IPRECOMPILE_ERC20_ABI = [
  "function name() external view returns (string memory)",
  "function symbol() external view returns (string memory)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  "function balanceOf(address who) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 value) external returns (bool)",
  "function approve(address spender, uint256 value) external returns (bool)",
  "function transferFrom(address from, address to, uint256 value) external returns (bool)",
  
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// LocalAsset Interface ABI (3DPass specific - was missing)
export const ILOCAL_ASSET_ABI = [
  "function mint(address to, uint256 value) external returns (bool)",
  "function burn(address from, uint256 value) external returns (bool)",
  "function freeze(address account) external returns (bool)",
  "function thaw(address account) external returns (bool)",
  "function freezeAsset() external returns (bool)",
  "function thawAsset() external returns (bool)",
  "function transferOwnership(address owner) external returns (bool)",
  "function setTeam(address issuer, address admin, address freezer) external returns (bool)",
  "function setMetadata(string name, string symbol, uint8 decimals) external returns (bool)",
  "function clearMetadata() external returns (bool)",
  "function isOwner(address account) external view returns (bool)",
  "function isIssuer(address account) external view returns (bool)",
  "function isAdmin(address account) external view returns (bool)",
  "function isFreezer(address account) external view returns (bool)",
  "function status() external view returns (string)",
  "function reserved() external view returns (uint256)",
  "function minBalance() external view returns (uint256)",
  "function reservedOf(address account) external view returns (uint256)",
  "function objDetails() external view returns (bool isValid, uint8 objIdx, uint8 propIdx, uint256 maxSupply)",
];

// Counterstake ABI for claim-related functions (from actual compiled contract)
export const COUNTERSTAKE_ABI = [
  // Events
  "event NewClaim(uint indexed claim_num, address author_address, string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, uint stake, string data, uint32 expiry_ts)",
  "event NewChallenge(uint indexed claim_num, address author_address, uint stake, uint8 outcome, uint8 current_outcome, uint yes_stake, uint no_stake, uint32 expiry_ts, uint challenging_target)",
  "event FinishedClaim(uint indexed claim_num, uint8 outcome)",
  
  // View functions
  "function settings() view returns (address tokenAddress, uint16 ratio100, uint16 counterstake_coef100, uint32 min_tx_age, uint min_stake, uint large_threshold)",
  "function last_claim_num() view returns (uint64)",
  "function getOngoingClaimNums() view returns (uint64[])",
  "function stakes(uint claim_num, uint8 outcome, address account) view returns (uint)",
  "function getClaim(uint claim_num) view returns (tuple(uint amount, address payable recipient_address, uint32 txts, uint32 ts, address payable claimant_address, uint32 expiry_ts, uint16 period_number, uint8 current_outcome, bool is_large, bool withdrawn, bool finished, string sender_address, string data, uint yes_stake, uint no_stake))",
  "function getClaim(string claim_id) view returns (tuple(uint amount, address payable recipient_address, uint32 txts, uint32 ts, address payable claimant_address, uint32 expiry_ts, uint16 period_number, uint8 current_outcome, bool is_large, bool withdrawn, bool finished, string sender_address, string data, uint yes_stake, uint no_stake))",
  "function getChallengingPeriod(uint16 period_number, bool bLarge) view returns (uint)",
  "function getRequiredStake(uint amount) view returns (uint)",
  "function getMissingStake(uint claim_num, uint8 stake_on) view returns (uint)",
  "function governance() view returns (address)",
  "function P3D_PRECOMPILE() view returns (address)",
  
  // State changing functions
  "function claim(string txid, uint32 txts, uint amount, int reward, uint stake, string sender_address, address payable recipient_address, string data) payable",
  "function challenge(uint claim_num, uint8 stake_on, uint stake) payable",
  "function challenge(string claim_id, uint8 stake_on, uint stake) payable",
  "function withdraw(uint256 claim_num) external",
  "function withdraw(string claim_id) external",
  "function withdraw(uint256 claim_num, address payable to_address) external",
  "function withdraw(string claim_id, address payable to_address) external",
];

// CounterstakeLibrary ABI (3DPass specific functions - was missing)
export const COUNTERSTAKE_LIBRARY_ABI = [
  // Constants
  "function P3D_PRECOMPILE() pure returns (address)",
  
  // Helper functions for 3DPass
  "function is3DPassERC20Precompile(address tokenAddr) pure returns (bool)",
  "function isP3D(address token) pure returns (bool)",
  "function getPrecompileSymbol(address tokenAddr) view returns (string)",
  "function approvePrecompile(address tokenAddr, address bridgeAddr)",
  "function isContract(address _addr) view returns (bool)",
  "function validateChallengingPeriods(uint[] periods) pure",
  "function getClaimId(string sender_address, address recipient_address, string txid, uint32 txts, uint amount, int reward, string data) pure returns (string)",
];

// BridgesRegistry ABI (was missing)
export const BRIDGES_REGISTRY_ABI = [
  // Events
  "event BridgeRegistered(address indexed bridgeAddress, uint8 bridgeType, uint256 createdAt)",
  "event AssistantRegistered(address indexed assistantAddress, uint8 assistantType, uint256 createdAt)",
  
  // View functions
  "function bridges(address) view returns (address bridgeAddress, uint8 bridgeType, uint256 createdAt, bool exists)",
  "function assistants(address) view returns (address assistantAddress, uint8 assistantType, uint256 createdAt, bool exists)",
  "function allBridges(uint256) view returns (address)",
  "function allAssistants(uint256) view returns (address)",
  "function counterstakeFactory() view returns (address)",
  "function assistantFactory() view returns (address)",
  "function getBridge(address bridgeAddress) view returns (tuple(address bridgeAddress, uint8 bridgeType, uint256 createdAt, bool exists))",
  "function getAssistant(address assistantAddress) view returns (tuple(address assistantAddress, uint8 assistantType, uint256 createdAt, bool exists))",
  "function isBridgeRegistered(address bridgeAddress) view returns (bool)",
  "function isAssistantRegistered(address assistantAddress) view returns (bool)",
  "function getAllBridges() view returns (address[])",
  "function getAllAssistants() view returns (address[])",
  "function getBridgesByType(uint8 bridgeType) view returns (address[])",
  "function getAssistantsByType(uint8 assistantType) view returns (address[])",
  "function getBridgeCount() view returns (uint256)",
  "function getAssistantCount() view returns (uint256)",
  
  // State changing functions
  "function setFactories(address _counterstakeFactory, address _assistantFactory)",
  "function registerBridge(address bridgeAddress, uint8 bridgeType)",
  "function registerAssistant(address assistantAddress, uint8 assistantType)",
];

// CounterstakeFactory ABI (was missing)
export const COUNTERSTAKE_FACTORY_ABI = [
  // Events
  "event NewExport(address contractAddress, address tokenAddress, string foreign_network, string foreign_asset)",
  "event NewImportWrapper(address contractAddress, string home_network, string home_asset, address precompileAddress, address stakeTokenAddress)",
  
  // View functions
  "function exportMaster() view returns (address)",
  "function importWrapperMaster() view returns (address)",
  "function bridgesRegistry() view returns (address)",
  
  // State changing functions
  "function createExport(string foreign_network, string foreign_asset, address tokenAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods) returns (address)",
  "function createImportWrapper(string home_network, string home_asset, address precompileAddress, address stakeTokenAddr, address oracleAddr, uint16 counterstake_coef100, uint16 ratio100, uint large_threshold, uint[] challenging_periods, uint[] large_challenging_periods) returns (address)",
];

// GovernanceFactory ABI (was missing)
export const GOVERNANCE_FACTORY_ABI = [
  // View functions
  "function governanceMaster() view returns (address)",
  
  // State changing functions
  "function createGovernance(address governedContractAddress, address votingTokenAddress) returns (address)",
];

// VotedValueFactory ABI (was missing)
export const VOTED_VALUE_FACTORY_ABI = [
  // View functions
  "function votedValueUintMaster() view returns (address)",
  "function votedValueUintArrayMaster() view returns (address)",
  "function votedValueAddressMaster() view returns (address)",
  
  // State changing functions
  "function createVotedValueUint(address governance, uint initial_value, function(uint) external validationCallback, function(uint) external commitCallback) returns (address)",
  "function createVotedValueUintArray(address governance, uint[] initial_value, function(uint[]) external validationCallback, function(uint[]) external commitCallback) returns (address)",
  "function createVotedValueAddress(address governance, address initial_value, function(address) external validationCallback, function(address) external commitCallback) returns (address)",
];

// LocalAsset ABI (3DPass specific - was missing)
export const LOCAL_ASSET_ABI = [
  // State changing functions
  "function mint(address to, uint256 value) returns (bool)",
  "function burn(address from, uint256 value) returns (bool)",
  "function freeze(address account) returns (bool)",
  "function thaw(address account) returns (bool)",
  "function freezeAsset() returns (bool)",
  "function thawAsset() returns (bool)",
  "function transferOwnership(address owner) returns (bool)",
  "function setTeam(address issuer, address admin, address freezer) returns (bool)",
  "function setMetadata(string name, string symbol, uint8 decimals) returns (bool)",
  "function clearMetadata() returns (bool)",
];

// Token ABI (was missing)
export const TOKEN_ABI = [
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  
  // View functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function transfer(address recipient, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address sender, address recipient, uint256 amount) returns (bool)",
  "function increaseAllowance(address spender, uint256 addedValue) returns (bool)",
  "function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)",
];

// BadToken ABI (was missing)
export const BAD_TOKEN_ABI = [
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  
  // View functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function transfer(address recipient, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address sender, address recipient, uint256 amount) returns (bool)",
  "function increaseAllowance(address spender, uint256 addedValue) returns (bool)",
  "function decreaseAllowance(address spender, uint256 subtractedValue) returns (bool)",
];

// CounterstakeReceiver ABI (was missing)
export const COUNTERSTAKE_RECEIVER_ABI = [
  // State changing functions
  "function onReceivedFromClaim(uint256 claim_num, uint256 net_claimed_amount, uint256 won_stake, string sender_address, address claim_recipient_address, string data)",
];

// IERC20Precompile ABI (was missing)
export const IERC20_PRECOMPILE_ABI = [
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  
  // View functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address who) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
];

// Batch ABI (3DPass precompile interface)
export const BATCH_ABI = [
  // Events
  "event SubcallSucceeded(uint256 index)",
  "event SubcallFailed(uint256 index)",
  
  // State changing functions
  "function batchSome(address[] to, uint256[] value, bytes[] callData, uint64[] gasLimit)",
  "function batchSomeUntilFailure(address[] to, uint256[] value, bytes[] callData, uint64[] gasLimit)",
  "function batchAll(address[] to, uint256[] value, bytes[] callData, uint64[] gasLimit)",
];

// IBatch ABI (was missing)
export const IBATCH_ABI = [
  // Events
  "event SubcallSucceeded(uint256 index)",
  "event SubcallFailed(uint256 index)",
  
  // State changing functions
  "function batchSome(address[] to, uint256[] value, bytes[] callData, uint64[] gasLimit)",
  "function batchSomeUntilFailure(address[] to, uint256[] value, bytes[] callData, uint64[] gasLimit)",
];

// Math Library ABI (was missing - library functions)
export const MATH_ABI = [
  // Pure functions
  "function max(uint256 a, uint256 b) pure returns (uint256)",
  "function min(uint256 a, uint256 b) pure returns (uint256)",
  "function average(uint256 a, uint256 b) pure returns (uint256)",
  "function ceilDiv(uint256 a, uint256 b) pure returns (uint256)",
  "function mulDiv(uint256 x, uint256 y, uint256 denominator) pure returns (uint256)",
  "function mulDiv(uint256 x, uint256 y, uint256 denominator, uint8 rounding) pure returns (uint256)",
  "function sqrt(uint256 a) pure returns (uint256)",
  "function sqrt(uint256 a, uint8 rounding) pure returns (uint256)",
  "function log2(uint256 value) pure returns (uint256)",
  "function log2(uint256 value, uint8 rounding) pure returns (uint256)",
  "function log10(uint256 value) pure returns (uint256)",
  "function log10(uint256 value, uint8 rounding) pure returns (uint256)",
  "function log256(uint256 value) pure returns (uint256)",
  "function log256(uint256 value, uint8 rounding) pure returns (uint256)",
];

// PrecompileSymbolHelper Library ABI (was missing - library functions)
export const PRECOMPILE_SYMBOL_HELPER_ABI = [
  // View functions
  "function getSymbol(address tokenAddress, address bridgeAddress) view returns (string)",
];

// AssistantMath Library ABI (was missing - library functions)
export const ASSISTANT_MATH_ABI = [
  // Pure functions
  "function max(int a, int b) pure returns (int)",
  "function sqrt(uint y) pure returns (uint z)",
  "function getGasCostInStakeTokens(uint gas, uint num, uint den) view returns (uint)",
];

// IERC20WithSymbol ABI (was missing)
export const IERC20_WITH_SYMBOL_ABI = [
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  
  // View functions
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  
  // State changing functions
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
];

// IERC165 ABI (was missing)
export const IERC165_ABI = [
  // View functions
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
];

// ERC165 ABI (was missing)
export const ERC165_ABI = [
  // View functions
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
];

// Context ABI (was missing)
export const CONTEXT_ABI = [
  // View functions
  "function _msgSender() view returns (address)",
  "function _msgData() view returns (bytes)",
];

// Address ABI (was missing - library functions)
export const ADDRESS_ABI = [
  // Pure functions
  "function isContract(address account) pure returns (bool)",
  "function sendValue(address payable recipient, uint256 amount)",
  "function functionCall(address target, bytes data) returns (bytes)",
  "function functionCall(address target, bytes data, string errorMessage) returns (bytes)",
  "function functionCallWithValue(address target, bytes data, uint256 value) returns (bytes)",
  "function functionCallWithValue(address target, bytes data, uint256 value, string errorMessage) returns (bytes)",
  "function functionStaticCall(address target, bytes data) view returns (bytes)",
  "function functionStaticCall(address target, bytes data, string errorMessage) view returns (bytes)",
  "function verifyCallResult(bool success, bytes returndata, string errorMessage) pure returns (bytes)",
];

// SafeERC20 ABI (was missing - library functions)
export const SAFE_ERC20_ABI = [
  // View functions
  "function safeTransfer(IERC20 token, address to, uint256 value) returns (bool)",
  "function safeTransferFrom(IERC20 token, address from, address to, uint256 value) returns (bool)",
  "function safeApprove(IERC20 token, address spender, uint256 value) returns (bool)",
  "function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) returns (bool)",
  "function safeDecreaseAllowance(IERC20 token, address spender, uint256 value) returns (bool)",
  "function safePermit(IERC20 token, address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
];

// IERC20Permit ABI (was missing)
export const IERC20_PERMIT_ABI = [
  // View functions
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  "function nonces(address owner) view returns (uint256)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
];

// ReentrancyGuard ABI (was missing)
export const REENTRANCY_GUARD_ABI = [
  // No public functions - only internal modifiers
];

// Clones ABI (was missing - library functions)
export const CLONES_ABI = [
  // Pure functions
  "function clone(address implementation) pure returns (address)",
  "function cloneDeterministic(address implementation, bytes32 salt) pure returns (address)",
  "function predictDeterministicAddress(address implementation, bytes32 salt) pure returns (address)",
  "function predictDeterministicAddress(address implementation, bytes32 salt, address deployer) pure returns (address)",
];

// Ownable ABI (was missing)
export const OWNABLE_ABI = [
  // Events
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  
  // View functions
  "function owner() view returns (address)",
  
  // State changing functions
  "function renounceOwnership()",
  "function transferOwnership(address newOwner)",
];

// IERC20 ABI (was missing)
export const IERC20_BASE_ABI = [
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  
  // View functions
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

// Migrations ABI (was missing)
export const MIGRATIONS_ABI = [
  // View functions
  "function last_completed_migration() view returns (uint)",
  "function owner() view returns (address)",
  
  // State changing functions
  "function setCompleted(uint completed)",
];

// Oracle ABI (was missing)
export const ORACLE_BASE_ABI = [
  // View functions
  "function getPrice(string asset1, string asset2) view returns (uint num, uint den)",
  
  // State changing functions
  "function setPrice(string asset1, string asset2, uint num, uint den)",
];

// IOracle ABI (was missing)
export const IORACLE_ABI = [
  // View functions
  "function getPrice(string asset1, string asset2) view returns (uint num, uint den)",
];

// VotedValue ABI (was missing)
export const VOTED_VALUE_BASE_ABI = [
  // Events
  "event Vote(address indexed who, uint votes, uint total_votes, uint leader, uint leader_total_votes, uint expiry_ts)",
  "event Unvote(address indexed who, uint votes)",
  "event Commit(address indexed who)",
  
  // View functions
  "function leader() view returns (uint)",
  "function current_value() view returns (uint)",
  "function choices(address) view returns (uint)",
  "function votesByValue(uint) view returns (uint)",
  "function votesByValueAddress(uint, address) view returns (uint)",
  "function governance() view returns (address)",
  
  // State changing functions
  "function vote(uint value)",
  "function voteAndDeposit(uint value, uint amount) payable",
  "function unvote()",
  "function commit()",
];