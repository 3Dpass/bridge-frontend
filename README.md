# Counterstake Bridge Frontend

A modern React.js Web3 frontend for the Counterstake Bridge, enabling cross-chain transfers between Ethereum, BSC, and 3DPass networks using MetaMask integration.

## Features

- 🔗 **Cross-Chain Transfers**: Transfer tokens between ETH, BSC, and 3DPass networks
- 🔐 **MetaMask Integration**: Seamless wallet connection and network switching
- 🎨 **Modern UI**: Beautiful, responsive design inspired by 3DPass wallet
- ⚡ **Real-time Updates**: Live balance updates and transaction status
- 🛡️ **Security**: Trustless counterstake mechanism with automated assistants
- 📱 **Mobile Responsive**: Works perfectly on desktop and mobile devices

## Supported Networks

- **Ethereum** (Mainnet & Goerli Testnet)
- **3DPass** (Mainnet & Testnet)

## Supported Tokens

### Ethereum
- ETH (Native)
- USDT

### 3DPass
- P3D (Native, ERC20 Precompile at `0x0802`)
- wUSDT (Wrapped USDT, ERC20 Precompile at `0xde`)

**Note**: In 3DPass, all tokens (including the native P3D) are accessed through ERC20 precompile addresses, not through native token mechanisms like other networks.

## Prerequisites

- Node.js 16+ and pnpm/npm/yarn
- MetaMask browser extension
- Access to supported networks in MetaMask

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd bridge-frontend
   ```

2. **Install dependencies**
   ```bash
   # Using pnpm (recommended)
   pnpm install
   
   # Or using npm
   npm install
   
   # Or using yarn
   yarn install
   ```

3. **Configure networks** (Optional)
   Edit `src/config/networks.js` to update RPC URLs and contract addresses for your deployment.

4. **Start the development server**
   ```bash
   # Using pnpm
   pnpm dev
   # or
   pnpm start
   
   # Or using npm
   npm start
   
   # Or using yarn
   yarn start
   ```

5. **Open your browser**
   Navigate to `http://localhost:3000`

## Configuration

### Network Configuration

Update the network configuration in `src/config/networks.js`:

```javascript
export const NETWORKS = {
  ETHEREUM: {
    id: 1,
    name: 'Ethereum',
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
    contracts: {
      counterstakeFactory: '0x...',
      assistantFactory: '0x...',
      oracle: '0x...',
    },
    // ... other config
  },
  // ... other networks
};
```

### Environment Variables

Create a `.env` file in the root directory:

```env
REACT_APP_INFURA_KEY=your_infura_key_here
REACT_APP_ALCHEMY_KEY=your_alchemy_key_here
REACT_APP_3DPASS_RPC_URL=https://rpc-http.3dpass.org
```

## Usage

### Connecting Wallet

1. Click "Connect Wallet" in the header
2. Approve the MetaMask connection request
3. Ensure you're on a supported network

### Making a Transfer

1. **Select Source Network**: Choose the network you're transferring from
2. **Select Source Token**: Choose the token to transfer
3. **Select Destination Network**: Choose the target network
4. **Select Destination Token**: Choose the token to receive
5. **Enter Amount**: Specify the transfer amount
6. **Enter Destination Address**: Provide the recipient address
7. **Review Stake**: Check the required stake amount
8. **Initiate Transfer**: Click "Initiate Transfer" and confirm in MetaMask

### Understanding Stakes

The counterstake bridge requires a security deposit (stake) for each transfer:

- **Stake Ratio**: Typically 10-20% of transfer amount
- **Purpose**: Ensures honest behavior through economic incentives
- **Return**: Stakes are returned after successful transfer completion
- **Risk**: Stakes can be lost if fraudulent transfers are attempted

## Architecture

### Components

- **Header**: Wallet connection, network switching, navigation
- **BridgeForm**: Main transfer interface with validation
- **Web3Context**: Global Web3 state management
- **App**: Main application layout and routing

### 3DPass Integration

The frontend includes special handling for 3DPass's unique ERC20 precompile system:

- **Precompile Detection**: Automatically detects and handles 3DPass precompile addresses
- **Unified Interface**: All tokens (including P3D) are treated as ERC20 tokens
- **Asset Mapping**: Maps precompile addresses to substrate asset IDs
- **Validation**: Special validation for 3DPass precompile transactions
- **Contract Integration**: Uses modified Export3DPass and Import3DPass contracts
- **Automatic Approval**: Handles ERC20 approvals for precompile tokens
- **Stake Calculation**: Real-time stake calculation from contract settings

### Key Features

- **MetaMask Integration**: Automatic wallet detection and connection
- **Network Switching**: Seamless switching between supported networks
- **Balance Loading**: Real-time token balance updates
- **Form Validation**: Comprehensive input validation
- **Error Handling**: User-friendly error messages
- **Responsive Design**: Mobile-first responsive layout

## Development

### Project Structure

```
src/
├── components/          # React components
│   ├── Header.js       # Navigation and wallet connection
│   └── BridgeForm.js   # Main bridge interface
├── contexts/           # React contexts
│   └── Web3Context.js  # Web3 state management
├── config/             # Configuration files
│   └── networks.js     # Network and contract configuration
├── contracts/          # Contract ABIs
│   └── abi.js         # Contract interfaces
├── utils/              # Utility functions
│   └── web3.js        # Web3 helper functions
├── App.js             # Main application component
├── index.js           # Application entry point
└── index.css          # Global styles
```

### Available Scripts

- `pnpm dev` or `pnpm start`: Start development server
- `pnpm build`: Build for production
- `pnpm test`: Run tests
- `pnpm eject`: Eject from Create React App
- `pnpm lint`: Run ESLint
- `pnpm lint:fix`: Fix ESLint issues automatically

### Styling

The app uses Tailwind CSS with custom components.

## Security Considerations

- **MetaMask Only**: Only MetaMask is supported for security
- **Network Validation**: All networks are validated before use
- **Address Validation**: All addresses are validated using 
ethers.js
- **Smart Contracts**: The contracts are open source and available for review ([evm v1.1](/src/contracts/evm), [evm v1-substrate](/src/contracts/evm_substrate))


### Debug Mode

Enable debug logging by setting:

```javascript
localStorage.setItem('debug', 'true');
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Responsibility disclaimer
This is an open source free software. Use it at your own risk. 
