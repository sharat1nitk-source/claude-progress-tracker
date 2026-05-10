// Model configuration for all AI calls in the pipeline.
// Change model here to switch all stages to a different model.
const config = {
  // Available: 'deepseek-v4-flash' (fast/cheap), 'deepseek-v4-pro' (best quality)
  model: 'deepseek-v4-pro',
  // Base temperature for structured extraction
  temperature: 0.3,
  // Max tokens for extraction per conversation
  extractionMaxTokens: 2048,
  // Max tokens for digest generation
  digestMaxTokens: 8192,
  // Max tokens for synthesis generation
  synthesisMaxTokens: 4096,
};

export default config;
