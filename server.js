#!/usr/bin/env node
/**
 * Express API Server - Main Entry Point
 * This file serves as the application entry point for Hostinger deployment
 */

import('./artifacts/api-server/dist/index.js')
  .then(module => {
    if (module.default) {
      console.log('✅ API Server started successfully');
    }
  })
  .catch(err => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  });
