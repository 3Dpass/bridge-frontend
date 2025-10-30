import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const SettingsHowTo = ({ isOpen }) => {
  const howToContent = `Adhere the following procedure exactly to set up new bridges!
---------------------------------------------------------------------------------------------
Creating new bridges:
---------------------------------------------------------------------------------------------
1. Deploy Oracle on both source and destination blockchains
2. Add home token to the tokens configuration under the chain it is going to be exported from
3. Set up initial stake tokne prices to the oracles (required: Token_address/_NATIVE_, token_symbol/_NATIVE_, _NATIVE_/Token_symbol)
4. Create Import bridge instance on the destination blockchain using the Oracle address and the home token address
5. Add foreign token from Import bridge to the tokens configuration (For Import Wrapper type the foreign token address must be added before the instance creation)
6. Add Import bridge instance to the bridges configuration under the chain it is deployed to
7. Create Export bridge instance on source blockchain using the Import bridge foreign token address
8. Add Export bridge instance to the bridges configuration under the chain it is deployed to
---------------------------------------------------------------------------------------------
Creating new pooled assistants:
1. Create new pooled assistants for the existing bridges anytime over the Settings WEB User Interface.
2. Add new assistants to the configuration under the chain it is deployed to`;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div className="card mb-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-white">How to Create Bridges and Assistants</h3>
            </div>
            <div className="bg-dark-800 rounded-lg p-4 overflow-x-auto">
              <pre className="text-sm text-secondary-300 whitespace-pre-wrap font-mono leading-relaxed">
                {howToContent}
              </pre>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SettingsHowTo;
