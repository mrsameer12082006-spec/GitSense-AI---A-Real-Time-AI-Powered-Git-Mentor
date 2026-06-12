import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import axios from 'axios';
import aiService from './ai.js';
import prisma from '../lib/prisma.js';

const execAsync = util.promisify(exec);
const activeBuilders = new Map(); // conversationId -> state object

class RepoBuilderService {
  /**
   * Get the active builder state for a conversation.
   */
  getBuilderState(conversationId) {
    return activeBuilders.get(conversationId) || null;
  }

  /**
   * Clear active builder state.
   */
  clearBuilderState(conversationId) {
    activeBuilders.delete(conversationId);
  }

  /**
   * Check if a message is requesting repository generation.
   */
  isRepoGenerationRequest(message) {
    const keywords = ['generate a repo', 'create a repo', 'build a repo', 'build me a', 'create a project', 'build a project', 'repository builder', 'build a task management', 'build a dashboard', 'create a mern'];
    const msg = message.toLowerCase();
    return keywords.some(k => msg.includes(k));
  }

  /**
   * Main entry point to handle builder messages in the chat loop.
   */
  async handleBuilderMessage(conversationId, message, user, repoRecord) {
    let state = activeBuilders.get(conversationId);

    if (!state) {
      // Step 1: Initialize Requirements Step
      state = {
        step: 'requirements',
        details: {
          name: '',
          stack: '',
          database: 'None',
          auth: 'None',
          deployment: 'None'
        }
      };
      activeBuilders.set(conversationId, state);

      // Try to extract details from the initial request if possible
      try {
        const parsed = await this._parseRequirementsWithAI(message);
        state.details = { ...state.details, ...parsed };
      } catch (e) {
        console.warn('[RepoBuilder] Failed to parse initial requirements:', e.message);
      }

      return {
        text: `I would love to help you build an entire GitHub repository from scratch! 🚀\n\nI have parsed the following requirements from your request:\n* **Project Name**: ${state.details.name || '*(Please specify)*'}\n* **Tech Stack**: ${state.details.stack || '*(Please specify)*'}\n* **Database**: ${state.details.database}\n* **Authentication**: ${state.details.auth}\n* **Deployment Target**: ${state.details.deployment}\n\nPlease reply with the missing details, confirm if they are correct, or type **"Build from idea: <your idea>"** to let me choose all settings automatically.`,
        metadata: { isRepoBuilder: true, step: 'requirements', details: state.details }
      };
    }

    if (state.step === 'requirements') {
      // Process requirements input
      if (message.toLowerCase().startsWith('build from idea:') || message.toLowerCase().startsWith('confirm') || message.toLowerCase().startsWith('approve') || message.toLowerCase().includes('correct') || message.toLowerCase().includes('yes')) {
        // AI fill-in or user confirmation
        if (message.toLowerCase().startsWith('build from idea:')) {
          const idea = message.substring(16).trim();
          try {
            const parsed = await this._parseRequirementsWithAI(`Build from idea: ${idea}`);
            state.details = { ...state.details, ...parsed };
          } catch (e) {
            return {
              text: `Failed to parse requirements for your idea. Please enter the details manually (Project Name, Stack, Database, Auth, Deployment).`,
              metadata: { isRepoBuilder: true, step: 'requirements', details: state.details }
            };
          }
        }

        // Validate required fields
        if (!state.details.name || !state.details.stack) {
          return {
            text: `We need at least a **Project Name** and a **Tech Stack** to proceed. Please specify them (e.g. Project: my-app, Stack: React + Vite).`,
            metadata: { isRepoBuilder: true, step: 'requirements', details: state.details }
          };
        }

        // Move to Step 2: Generate Blueprint
        state.step = 'blueprint';
        try {
          const blueprint = await this._generateBlueprintWithAI(state.details);
          state.blueprint = blueprint;
          return {
            text: `📦 **Repository Structure Blueprint**\n\nI have generated the file structure blueprint for **${state.details.name}**:\n\n\`\`\`\n${blueprint.structure}\n\`\`\`\n\nDo you approve of this structure? Reply with **"Approve"** or **"Yes"** to begin file generation, or tell me what changes to make.`,
            metadata: { isRepoBuilder: true, step: 'blueprint', details: state.details, blueprint }
          };
        } catch (err) {
          console.error('[RepoBuilder] Blueprint generation error:', err);
          return {
            text: `Error generating repository blueprint: ${err.message}. Please try again or rephrase your request.`,
            metadata: { isRepoBuilder: true, step: 'requirements', details: state.details }
          };
        }
      } else {
        // Parse manual updates
        try {
          const parsed = await this._parseRequirementsWithAI(message);
          state.details = { ...state.details, ...parsed };
          return {
            text: `Updated requirements:\n* **Project Name**: ${state.details.name || '*(Please specify)*'}\n* **Tech Stack**: ${state.details.stack || '*(Please specify)*'}\n* **Database**: ${state.details.database}\n* **Authentication**: ${state.details.auth}\n* **Deployment Target**: ${state.details.deployment}\n\nType **"Approve"** or **"Confirm"** to generate the blueprint.`,
            metadata: { isRepoBuilder: true, step: 'requirements', details: state.details }
          };
        } catch (e) {
          return {
            text: `Could not parse your updates. Current details:\n* **Project Name**: ${state.details.name}\n* **Tech Stack**: ${state.details.stack}\n\nPlease verify and type "Confirm" to proceed.`,
            metadata: { isRepoBuilder: true, step: 'requirements', details: state.details }
          };
        }
      }
    }

    if (state.step === 'blueprint') {
      if (message.toLowerCase().includes('approve') || message.toLowerCase().includes('yes') || message.toLowerCase().includes('confirm')) {
        // Step 3: Generate Files & Pushes
        state.step = 'generating';
        
        try {
          // Generate code files
          const files = await this._generateFilesWithAI(state.details, state.blueprint.files);
          
          // Create local git repo
          const safeName = state.details.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
          const localPath = path.join(process.cwd(), 'data', 'repos', `generated-${safeName}-${Date.now()}`);
          await fs.mkdir(localPath, { recursive: true });

          // Write files locally
          for (const [filePath, content] of Object.entries(files)) {
            const fullPath = path.join(localPath, filePath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content, 'utf8');
          }

          // Git init and commit locally
          await execAsync('git init', { cwd: localPath });
          await execAsync('git config user.email "gitsense-builder@user.ai"', { cwd: localPath });
          await execAsync('git config user.name "GitSense Repository Builder"', { cwd: localPath });
          await execAsync('git add .', { cwd: localPath });
          await execAsync('git commit -m "Initial commit by GitSense AI Builder"', { cwd: localPath });

          // GitHub integration push (if OAuth token available)
          let githubUrl = null;
          let pushSuccess = false;
          let pushError = '';
          const githubToken = user?.githubToken;

          if (githubToken) {
            try {
              // Create repo on GitHub
              const createRes = await axios.post('https://api.github.com/user/repos', {
                name: safeName,
                description: `Generated by GitSense AI: ${state.details.stack}`,
                private: false
              }, {
                headers: {
                  Authorization: `Bearer ${githubToken}`,
                  Accept: 'application/vnd.github+json'
                }
              });

              githubUrl = createRes.data.html_url;
              const remoteUrl = `https://${githubToken}@github.com/${createRes.data.owner.login}/${safeName}.git`;
              
              // Push commits
              await execAsync(`git remote add origin ${remoteUrl}`, { cwd: localPath });
              await execAsync('git branch -M main', { cwd: localPath });
              await execAsync('git push -u origin main', { cwd: localPath });
              pushSuccess = true;
            } catch (err) {
              console.error('[RepoBuilder] Push failed:', err.response?.data || err.message);
              pushError = err.response?.data?.message || err.message;
            }
          }

          // Register generated repository in Prisma
          let dbRepo = null;
          if (githubUrl) {
            dbRepo = await prisma.repository.create({
              data: {
                userId: user.id,
                name: safeName,
                owner: githubUrl.split('/').slice(-2)[0],
                fullName: githubUrl.split('/').slice(-2).join('/'),
                url: githubUrl,
                defaultBranch: 'main',
                connectionMethod: 'oauth',
                isConnected: true
              }
            });
          }

          this.clearBuilderState(conversationId);

          let outputText = `🎉 **Repository Created Successfully!**\n\n`;
          if (pushSuccess && githubUrl) {
            outputText += `✅ **GitHub Remote**: [View Repository on GitHub](${githubUrl})\n`;
          } else {
            outputText += `⚠️ **GitHub remote push skipped or failed** (${pushError || 'No GitHub Token connected'}).\n`;
          }
          outputText += `📁 **Local Path**: \`${localPath}\`\n\n`;
          outputText += `### 🚀 Next Steps:\n1. Open your terminal and navigate to the project:\n   \`cd "${localPath}"\`\n2. Install dependencies:\n   \`npm install\`\n3. Run start commands:\n   \`npm run dev\` / \`npm start\``;

          return {
            text: outputText,
            metadata: { isRepoBuilder: true, step: 'complete', localPath, githubUrl, dbRepo }
          };
        } catch (err) {
          console.error('[RepoBuilder] Code generation error:', err);
          return {
            text: `Error generating files: ${err.message}. Please try again.`,
            metadata: { isRepoBuilder: true, step: 'blueprint', details: state.details, blueprint: state.blueprint }
          };
        }
      } else {
        // Re-generate blueprint with feedback
        try {
          const blueprint = await this._generateBlueprintWithAI(state.details, message);
          state.blueprint = blueprint;
          return {
            text: `📦 **Updated Repository Structure Blueprint**\n\nI have adjusted the file structure blueprint based on your feedback:\n\n\`\`\`\n${blueprint.structure}\n\`\`\`\n\nDo you approve of this structure? Reply with **"Approve"** or **"Yes"** to begin file generation.`,
            metadata: { isRepoBuilder: true, step: 'blueprint', details: state.details, blueprint }
          };
        } catch (err) {
          return {
            text: `Failed to adjust blueprint: ${err.message}. Please try again.`,
            metadata: { isRepoBuilder: true, step: 'blueprint', details: state.details, blueprint: state.blueprint }
          };
        }
      }
    }

    return { text: 'Invalid builder step.' };
  }

  /**
   * AI helper to parse project requirements from text.
   */
  async _parseRequirementsWithAI(text) {
    const messages = [
      {
        role: 'system',
        content: `You are the requirements parser for GitSense AI's Repository Builder. Analyze the user request and extract key parameters. Return only a valid JSON object matching this schema:
{
  "name": "Project Name (kebab-case or CamelCase)",
  "stack": "Frontend and Backend tech (e.g., React + Node, HTML/JS, Python/Flask)",
  "database": "MongoDB / SQLite / PostgreSQL / None",
  "auth": "JWT / NextAuth / Firebase / None",
  "deployment": "Vercel / Render / Netlify / None"
}
Only output the JSON object, no explanation text or markdown wrappers.`
      },
      { role: 'user', content: text }
    ];

    const res = await aiService.generateCompletion(messages, 0.2);
    try {
      return JSON.parse(res);
    } catch {
      // Fallback manual regex matches if JSON parsing failed
      const nameMatch = text.match(/project:\s*([^\n]+)/i) || text.match(/name:\s*([^\n]+)/i);
      const stackMatch = text.match(/stack:\s*([^\n]+)/i) || text.match(/tech:\s*([^\n]+)/i);
      return {
        name: nameMatch ? nameMatch[1].trim() : '',
        stack: stackMatch ? stackMatch[1].trim() : '',
        database: 'None',
        auth: 'None',
        deployment: 'None'
      };
    }
  }

  /**
   * AI helper to generate the repository structure and list of files.
   */
  async _generateBlueprintWithAI(details, feedback = '') {
    const messages = [
      {
        role: 'system',
        content: `You are the directory structure designer for GitSense AI's Repository Builder. Design a clean, modern folder structure and choose a list of 5-8 essential code files that we will generate to build a working boilerplate project. Return only a valid JSON object matching this schema:
{
  "structure": "Human-readable directory tree text",
  "files": [
    "List of essential file paths to generate (e.g. package.json, src/App.jsx, server.js)"
  ]
}
Only output the JSON object, no explanation text or markdown wrappers.`
      },
      { 
        role: 'user', 
        content: `Project Details: ${JSON.stringify(details)}${feedback ? `\nUser Feedback: ${feedback}` : ''}` 
      }
    ];

    const res = await aiService.generateCompletion(messages, 0.3);
    return JSON.parse(res);
  }

  /**
   * AI helper to generate the actual file contents for all files.
   */
  async _generateFilesWithAI(details, filesList) {
    const messages = [
      {
        role: 'system',
        content: `You are the core code generator for GitSense AI. Generate the contents for the requested list of files to form a fully working, clean project boilerplate. Write complete working code without placeholders or 'todo' comments. Return only a valid JSON object where keys are the file paths and values are the code content strings:
{
  "file/path/here.js": "code content here",
  "another/file.md": "content here"
}
Only output the JSON object, no explanations or markdown wrappers.`
      },
      {
        role: 'user',
        content: `Project Details: ${JSON.stringify(details)}\nFiles to generate: ${JSON.stringify(filesList)}`
      }
    ];

    const res = await aiService.generateCompletion(messages, 0.2);
    return JSON.parse(res);
  }
}

export default new RepoBuilderService();
