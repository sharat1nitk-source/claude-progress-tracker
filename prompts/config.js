// Model configuration for all AI calls in the pipeline.
// Change model here to switch all stages to a different model.
const config = {
  // Available: 'deepseek-v4-flash' (fast/cheap), 'deepseek-v4-pro' (best quality)
  model: 'deepseek-v4-pro',
  // Base temperature for structured extraction
  temperature: 0.3,
  // Max tokens for extraction per conversation
  extractionMaxTokens: 4096,
  // Max tokens for digest generation
  digestMaxTokens: 32768,
  // Max tokens for synthesis generation
  synthesisMaxTokens: 16384,
};

export default config;
