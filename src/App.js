import React, { useState } from 'react';
import { Web3Provider } from './contexts/Web3Context';
import { SettingsProvider } from './contexts/SettingsContext';
import Header from './components/Header';
import BridgeForm from './components/BridgeForm';
import ClaimList from './components/ClaimList';
import AssistantsList from './components/AssistantsList';
import { Toaster } from 'react-hot-toast';
import { motion } from 'framer-motion';

function App() {
  const [activeTab, setActiveTab] = useState('bridge'); // 'bridge', 'transfers', or 'pools'

  // Handle navigation clicks
  const handleNavClick = (section) => {
    setActiveTab(section);
  };

  // Handle navigation to transfers tab with specific filter
  const navigateToTransfers = (filter = 'all') => {
    setActiveTab('transfers');
    // Store the filter preference for ClaimList to use
    localStorage.setItem('claimListFilter', filter);
  };

    return (
    <Web3Provider>
      <SettingsProvider>
        <div className="min-h-screen bg-dark-950 flex flex-col">
          <Header onNavClick={handleNavClick} activeTab={activeTab} />

          <main className="pt-8 pb-16 flex-1">
          

          {/* Bridge Form Section */}
          {activeTab === 'bridge' && (
            <section id="bridge" className="mb-16">
              <BridgeForm onNavigateToTransfers={navigateToTransfers} />
            </section>
          )}

          {/* Transfer List Section */}
          {activeTab === 'transfers' && (
            <section id="transfers" className="mb-16">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <ClaimList activeTab={activeTab} />
              </div>
            </section>
          )}

          {/* Pools Section */}
          {activeTab === 'pools' && (
            <section id="pools" className="mb-16">
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                <AssistantsList />
              </div>
            </section>
          )}

          {/* How It Works Section - Bridge Tab */}
          {activeTab === 'bridge' && (
            <section className="mb-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="text-center mb-12"
                >
                  <h2 className="text-3xl font-bold text-white mb-4" id="how-it-works">How It Works</h2>
                  <p className="text-secondary-300 max-w-2xl mx-auto">
                    The cross-chain transfer process is simple
                  </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {[
                    {
                      step: '1',
                      title: 'Initiate Transfer',
                      description: 'Select the source and destination. Offer 2-3% fee to the bridge nodes, if you would like them to speed up your transfer.',
                    },
                    {
                      step: '2',
                      title: (
                        <a 
                          href="https://counterstake.org/how-it-works" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary-400 hover:text-primary-300 underline"
                        >
                          Counterstake consensus
                        </a>
                      ),
                      description: 'The nodes are going to claim valid transfers and challenge fraudulent ones. You may as well claim yourself, if the nodes refused to assist.',
                    },
                    {
                      step: '3',
                      title: 'Receive Tokens',
                      description: 'Receive your tokens on the destination chain. For self-claimed transfers you have to wait for the challenging period to expire before withdrawing.',
                    },
                  ].map((item, index) => (
                    <motion.div
                      key={item.step}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="card text-center relative"
                    >
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center border-2 border-dark-800">
                          <span className="text-white font-bold text-sm">{item.step}</span>
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                      <p className="text-secondary-400 text-sm">{item.description}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* How It Works Section - Pools Tab */}
          {activeTab === 'pools' && (
            <section className="mb-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="text-center mb-12"
                >
                  <h2 className="text-3xl font-bold text-white mb-4" id="how-pools-work">How Liquidity Pools Work</h2>
                  <p className="text-secondary-300 max-w-2xl mx-auto">
                    Provide liquidity to the bridge assistants and earn fees from cross-chain transfers
                  </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {[
                    {
                      step: '1',
                      title: 'Deposit Liquidity',
                      description: 'Deposit stake tokens into a bridge assistant to provide liquidity for cross-chain transfers. You receive share tokens representing your stake.',
                    },
                    {
                      step: '2',
                      title: 'Earn Fees',
                      description: 'As users make cross-chain transfers, the assistant earns management fees, success fees, and swap fees. These are distributed to liquidity providers.',
                    },
                    {
                      step: '3',
                      title: 'Withdraw Anytime',
                      description: 'Withdraw your liquidity plus earned fees at any time. Your share tokens are burned and you receive your proportional share of the pool.',
                    },
                  ].map((item, index) => (
                    <motion.div
                      key={item.step}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                      className="card text-center relative"
                    >
                      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center border-2 border-dark-800">
                          <span className="text-white font-bold text-sm">{item.step}</span>
                        </div>
                      </div>
                      <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                      <p className="text-secondary-400 text-sm">{item.description}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </main>

        {/* Footer */}
        <footer className="bg-dark-900 border-t border-secondary-800 py-8 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center space-x-6">
               <span
                  className="text-secondary-400 text-xs transition-colors"
                  >
                  This is an open-source free software. Use it at your own risk.
                </span>
                <a 
                  href="https://counterstake.org" 
                  className="text-secondary-400 text-sm hover:text-white transition-colors"
                >
                  Counterstake.org
                </a>
                <a 
                  href="https://github.com/3Dpass/counterstake-bridge/tree/v1.1-substrate" 
                  className="text-secondary-400 text-sm hover:text-white transition-colors"
                >
                  How to setup Node
                </a>
                <a 
                  href="https://github.com/3Dpass/bridge-frontend"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary-400 hover:text-white transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    className="inline-block"
                  >
                    <title>GitHub Repository</title>
                    <path
                      fill="currentColor"
                      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                    />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </footer>

        {/* Toast Notifications */}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1e293b',
              color: '#fff',
              border: '1px solid #475569',
            },
            success: {
              iconTheme: {
                primary: '#22c55e',
                secondary: '#fff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
              },
            },
          }}
        />
      </div>
        </SettingsProvider>
      </Web3Provider>
  );
}

export default App; 