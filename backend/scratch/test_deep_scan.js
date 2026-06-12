import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanRepository } from '../src/services/githubScanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

async function runTest() {
  const token = process.env.GITHUB_TOKEN;
  const owner = 'mrsameer12082006-spec';
  const repo = 'GitSense-AI---A-Real-Time-AI-Powered-Git-Mentor';

  console.log(`Starting scan test on ${owner}/${repo}...`);
  console.log(`Token available: ${!!token}`);

  if (!token) {
    console.error('Error: GITHUB_TOKEN environment variable not set.');
    process.exit(1);
  }

  try {
    const result = await scanRepository(owner, repo, token, 'all');
    console.log('\n--- SCAN RESULT SUCCESS ---');
    console.log(`Status: ${result.status}`);
    console.log(`Issues Found: ${result.issues?.length || 0}`);
    console.log('Summary:', JSON.stringify(result.summary, null, 2));

    if (result.issues && result.issues.length > 0) {
      console.log('\nDetected Issues:');
      result.issues.forEach((issue, idx) => {
        console.log(`\n[${idx + 1}] ID: ${issue.id}`);
        console.log(`    Title: ${issue.title}`);
        console.log(`    Severity: ${issue.severity}`);
        console.log(`    Affected Resource: ${issue.affectedResource}`);
        console.log(`    File Path: ${issue.filePath}`);
        console.log(`    Root Cause: ${issue.rootCause}`);
        console.log(`    Manual steps: ${JSON.stringify(issue.steps)}`);
        console.log(`    Has resolvedContent: ${!!issue.resolvedContent}`);
      });
    } else {
      console.log('\nNo issues found! Repository looks healthy.');
    }
  } catch (err) {
    console.error('Error running scanRepository:', err);
  }
}

runTest();
