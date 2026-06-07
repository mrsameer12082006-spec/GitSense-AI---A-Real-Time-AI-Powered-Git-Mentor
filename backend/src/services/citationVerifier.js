// ─────────────────────────────────────────────────────────────
// GitSense AI — Citation Verifier (Tatva-style verifyCitations)
//
// Scans AI responses for commit hashes, file paths, branch names,
// and PR/issue numbers. Verifies each against retrieved chunks.
// Strips unverified references to prevent hallucination.
// ─────────────────────────────────────────────────────────────

class CitationVerifier {
  /**
   * Verify all technical references in the AI response against
   * the retrieved repository chunks.
   *
   * @param {string} responseText - The AI-generated response
   * @param {object[]} retrievedChunks - The chunks that were used as context
   * @returns {{ verifiedText: string, flaggedItems: string[], isClean: boolean }}
   */
  verify(responseText, retrievedChunks) {
    if (!responseText || !retrievedChunks || retrievedChunks.length === 0) {
      return { verifiedText: responseText, flaggedItems: [], isClean: true };
    }

    // Build a set of all known references from chunks
    const knownRefs = this._buildReferenceSet(retrievedChunks);
    const flaggedItems = [];
    let verifiedText = responseText;

    // 1. Verify commit hashes (7-40 char hex strings)
    const commitHashPattern = /\b([0-9a-f]{7,40})\b/g;
    let match;
    while ((match = commitHashPattern.exec(responseText)) !== null) {
      const hash = match[1];
      // Skip if it looks like a color code or common hex value
      if (hash.length === 6 && /^[0-9a-f]{6}$/i.test(hash)) continue;
      if (hash.length < 7) continue;

      const shortHash = hash.substring(0, 7);
      if (!knownRefs.commitHashes.has(shortHash) && !knownRefs.commitHashes.has(hash)) {
        // Check if any known hash starts with this
        const isPartialMatch = [...knownRefs.commitHashes].some(
          known => known.startsWith(shortHash) || shortHash.startsWith(known)
        );
        if (!isPartialMatch) {
          flaggedItems.push(`Commit hash: ${hash}`);
          verifiedText = verifiedText.replace(
            new RegExp(`\\b${hash}\\b`, 'g'),
            `${hash} [⚠️ unverified]`
          );
        }
      }
    }

    // 2. Verify file paths (patterns like src/..., backend/..., etc.)
    const filePathPattern = /(?:^|\s|`)((?:src|backend|frontend|lib|app|components|routes|services|utils|config|test|spec|docs|public)\/[\w./-]+)/gm;
    while ((match = filePathPattern.exec(responseText)) !== null) {
      const filePath = match[1].replace(/[`'".,;:)}\]]+$/, ''); // Clean trailing punctuation
      if (!knownRefs.filePaths.has(filePath)) {
        // Check partial matches (file might be referenced with different prefix)
        const basename = filePath.split('/').pop();
        const isPartialMatch = [...knownRefs.filePaths].some(
          known => known.endsWith(basename) || known.includes(filePath)
        );
        if (!isPartialMatch && basename && basename.includes('.')) {
          flaggedItems.push(`File path: ${filePath}`);
        }
      }
    }

    // 3. Verify branch names (referenced as branch names in backticks or after "branch")
    const branchPattern = /(?:branch\s+|`)([\w./-]+(?:\/[\w./-]+)+)`?/gi;
    while ((match = branchPattern.exec(responseText)) !== null) {
      const branchName = match[1];
      // Skip if it looks like a file path
      if (branchName.includes('.')) continue;
      if (!knownRefs.branchNames.has(branchName)) {
        // Don't flag common branch patterns
        if (!['feature/', 'bugfix/', 'hotfix/', 'release/'].some(p => branchName.startsWith(p))) {
          flaggedItems.push(`Branch name: ${branchName}`);
        }
      }
    }

    // 4. Verify PR/Issue numbers (#N)
    const prIssuePattern = /#(\d+)/g;
    while ((match = prIssuePattern.exec(responseText)) !== null) {
      const number = match[1];
      if (!knownRefs.prIssueNumbers.has(number)) {
        flaggedItems.push(`PR/Issue reference: #${number}`);
      }
    }

    return {
      verifiedText,
      flaggedItems,
      isClean: flaggedItems.length === 0,
    };
  }

  /**
   * Build a reference set from all retrieved chunks.
   */
  _buildReferenceSet(chunks) {
    const refs = {
      commitHashes: new Set(),
      filePaths: new Set(),
      branchNames: new Set(),
      prIssueNumbers: new Set(),
      contributorNames: new Set(),
    };

    for (const chunk of chunks) {
      let metadata = {};
      try {
        metadata = typeof chunk.metadata === 'string'
          ? JSON.parse(chunk.metadata)
          : (chunk.metadata || {});
      } catch { /* ignore */ }

      const content = chunk.content || '';

      // Extract commit hashes from metadata and content
      if (metadata.commitHash) {
        refs.commitHashes.add(metadata.commitHash.substring(0, 7));
        refs.commitHashes.add(metadata.commitHash);
      }
      if (metadata.sha) {
        refs.commitHashes.add(metadata.sha.substring(0, 7));
        refs.commitHashes.add(metadata.sha);
      }

      // Extract hashes from content
      const hashMatches = content.match(/\b[0-9a-f]{7,40}\b/g);
      if (hashMatches) {
        hashMatches.forEach(h => {
          refs.commitHashes.add(h.substring(0, 7));
          refs.commitHashes.add(h);
        });
      }

      // Extract file paths
      if (metadata.filePath) refs.filePaths.add(metadata.filePath);
      if (metadata.path) refs.filePaths.add(metadata.path);
      if (metadata.filesChanged) {
        (Array.isArray(metadata.filesChanged) ? metadata.filesChanged : [metadata.filesChanged])
          .forEach(f => refs.filePaths.add(typeof f === 'string' ? f : f.filename || ''));
      }

      // Extract branch names
      if (metadata.branch) refs.branchNames.add(metadata.branch);
      if (metadata.branchName) refs.branchNames.add(metadata.branchName);
      if (metadata.headBranch) refs.branchNames.add(metadata.headBranch);
      if (metadata.baseBranch) refs.branchNames.add(metadata.baseBranch);

      // Extract PR/Issue numbers
      if (metadata.number) refs.prIssueNumbers.add(String(metadata.number));
      if (metadata.prNumber) refs.prIssueNumbers.add(String(metadata.prNumber));
      if (metadata.issueNumber) refs.prIssueNumbers.add(String(metadata.issueNumber));

      // Extract contributor names
      if (metadata.author) refs.contributorNames.add(metadata.author);
    }

    return refs;
  }
}

export default new CitationVerifier();
