import aiService from '../src/services/ai.js';
import { scanRepository } from '../src/services/githubScanner.js';
import express from 'express';
import fixRoutes from '../src/routes/fix.js';

console.log('Successfully imported AI service, scanner and fix routes!');
console.log('Diagnose method check:', typeof aiService.diagnoseIssues === 'function');
console.log('Fix Route check:', typeof fixRoutes === 'function');
process.exit(0);
