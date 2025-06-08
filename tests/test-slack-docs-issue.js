#!/usr/bin/env node

const { DocumentationFetcher } = require('../dist/utils/documentation-fetcher');
const { NodeSourceExtractor } = require('../dist/utils/node-source-extractor');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function investigateSlackDocs() {
  console.log('=== Investigating Slack Node Documentation Issue ===\n');
  
  const docsFetcher = new DocumentationFetcher();
  const extractor = new NodeSourceExtractor();
  
  try {
    // 1. Ensure docs repo is available
    console.log('1️⃣ Ensuring documentation repository...');
    await docsFetcher.ensureDocsRepository();
    
    // 2. Check what files exist for Slack
    console.log('\n2️⃣ Searching for Slack documentation files...');
    const docsPath = path.join(process.cwd(), 'temp', 'n8n-docs');
    
    try {
      const slackFiles = execSync(
        `find ${docsPath} -name "*slack*" -type f | grep -v ".git"`,
        { encoding: 'utf-8' }
      ).trim().split('\n').filter(Boolean);
      
      console.log(`Found ${slackFiles.length} files with "slack" in the name:`);
      slackFiles.forEach(file => {
        const relPath = path.relative(docsPath, file);
        console.log(`  - ${relPath}`);
      });
      
      // Check content of each file
      console.log('\n3️⃣ Checking content of Slack-related files...');
      for (const file of slackFiles.slice(0, 5)) { // Check first 5 files
        if (file.endsWith('.md')) {
          const content = fs.readFileSync(file, 'utf-8');
          const firstLine = content.split('\n')[0];
          const isCredential = content.includes('credential') || content.includes('authentication');
          console.log(`\n  📄 ${path.basename(file)}`);
          console.log(`     First line: ${firstLine}`);
          console.log(`     Is credential doc: ${isCredential}`);
          
          // Check if it mentions being a node or credential
          if (content.includes('# Slack node')) {
            console.log('     ✅ This is the Slack NODE documentation!');
            console.log(`     Path: ${file}`);
          } else if (content.includes('# Slack credentials')) {
            console.log('     ⚠️  This is the Slack CREDENTIALS documentation');
          }
        }
      }
    } catch (error) {
      console.log('Error searching for Slack files:', error.message);
    }
    
    // 4. Test the getNodeDocumentation method
    console.log('\n4️⃣ Testing getNodeDocumentation for Slack...');
    const slackDocs = await docsFetcher.getNodeDocumentation('n8n-nodes-base.slack');
    
    if (slackDocs) {
      console.log('   ✅ Found documentation for Slack node');
      console.log(`   URL: ${slackDocs.url}`);
      console.log(`   Content preview: ${slackDocs.markdown.substring(0, 200)}...`);
      
      // Check if it's credential or node docs
      const isCredentialDoc = slackDocs.markdown.includes('credential') || 
                            slackDocs.markdown.includes('authentication') ||
                            slackDocs.markdown.includes('# Slack credentials');
      const isNodeDoc = slackDocs.markdown.includes('# Slack node') || 
                       slackDocs.markdown.includes('## Properties');
                       
      console.log(`   Is credential doc: ${isCredentialDoc}`);
      console.log(`   Is node doc: ${isNodeDoc}`);
    } else {
      console.log('   ❌ No documentation found for Slack node');
    }
    
    // 5. Extract the Slack node source to understand its structure
    console.log('\n5️⃣ Extracting Slack node source code...');
    try {
      const slackNode = await extractor.extractNodeSource('n8n-nodes-base.slack');
      console.log('   ✅ Successfully extracted Slack node');
      console.log(`   Location: ${slackNode.location}`);
      console.log(`   Has credential code: ${!!slackNode.credentialCode}`);
      
      // Parse the node definition
      const descMatch = slackNode.sourceCode.match(/description\s*[:=]\s*({[\s\S]*?})\s*[,;]/);
      if (descMatch) {
        console.log('   Found node description in source');
      }
    } catch (error) {
      console.log('   ❌ Failed to extract Slack node:', error.message);
    }
    
    // 6. Check documentation structure
    console.log('\n6️⃣ Checking n8n-docs repository structure...');
    const docStructure = [
      'docs/integrations/builtin/app-nodes',
      'docs/integrations/builtin/core-nodes',
      'docs/integrations/builtin/trigger-nodes',
      'docs/integrations/builtin/credentials'
    ];
    
    for (const dir of docStructure) {
      const fullPath = path.join(docsPath, dir);
      try {
        const files = fs.readdirSync(fullPath);
        const slackFile = files.find(f => f.toLowerCase().includes('slack'));
        console.log(`\n   📁 ${dir}:`);
        if (slackFile) {
          console.log(`      Found: ${slackFile}`);
        } else {
          console.log(`      No Slack files found`);
        }
      } catch (error) {
        console.log(`      Directory doesn't exist`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Investigation failed:', error);
  } finally {
    // Cleanup
    await docsFetcher.cleanup();
  }
}

// Run investigation
investigateSlackDocs().catch(console.error);